// Passage addressing: the unit of evidence.
//
// A wiki page body is split into "passages" (blank-line separated blocks:
// paragraphs, lists, tables, headings with their text). Each passage gets a
// stable, human-readable id `p<N>` (1-based, document order) so a model can
// cite `[[some-page#p3]]`-style locations and a validator can resolve them
// without any fuzzy matching.
//
// Ids are positional, so editing a page can shift them. That is intentional
// and safe: citations that carry a quote are re-verified against the passage
// text, and a drifted passage surfaces as a quote mismatch, never as a silent
// wrong answer.

export type Passage = {
  /** `p1`, `p2`, ... in document order. */
  id: string;
  /** 1-based position; same number as in `id`. */
  index: number;
  /** Passage text exactly as written in the page (trimmed). */
  text: string;
  /** Nearest preceding markdown heading, if any — useful location metadata. */
  heading: string | null;
  /** Half-open character offsets into the page body (post-frontmatter). */
  start: number;
  end: number;
};

const PASSAGE_ID_RE = /^p([1-9][0-9]{0,4})$/;
const HEADING_RE = /^#{1,6}\s+(.*?)\s*#*\s*$/;

export function isPassageId(value: string): boolean {
  return PASSAGE_ID_RE.test(value);
}

/**
 * Splits a markdown body into passages. Fenced code blocks are kept whole so
 * a blank line inside code does not split a passage.
 */
export function segmentPassages(body: string): Passage[] {
  const passages: Passage[] = [];
  const text = body.replace(/\r\n/g, "\n");

  let heading: string | null = null;
  let blockStart = -1;
  let blockLines: string[] = [];
  let inFence = false;
  let offset = 0;

  const flush = (endOffset: number) => {
    if (blockStart < 0) return;
    const raw = blockLines.join("\n").trim();
    if (raw.length > 0) {
      const first = raw.split("\n")[0] ?? "";
      const headingMatch = HEADING_RE.exec(first);
      const isPureHeading = headingMatch !== null && raw.split("\n").length === 1;
      if (headingMatch) heading = headingMatch[1] ?? heading;
      // A bare heading line is location metadata for what follows, not
      // evidence in itself — skip it so passage ids point at real content.
      if (!isPureHeading) {
        const index = passages.length + 1;
        passages.push({
          id: `p${index}`,
          index,
          text: raw,
          heading,
          start: blockStart,
          end: endOffset,
        });
      }
    }
    blockStart = -1;
    blockLines = [];
  };

  for (const line of text.split("\n")) {
    const lineEnd = offset + line.length;
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;

    if (!inFence && line.trim() === "") {
      flush(offset);
    } else {
      if (blockStart < 0) blockStart = offset;
      blockLines.push(line);
    }
    offset = lineEnd + 1;
  }
  flush(text.length);

  return passages;
}

/**
 * Normalizes text for quote comparison: lowercases, strips markdown emphasis
 * and link syntax, unifies quotes/dashes, ignores punctuation, and collapses
 * whitespace. Both the quote and the passage go through the same function,
 * so only genuinely different wording can fail to match.
 *
 * Punctuation is ignored EXCEPT where it carries meaning inside a token:
 * the decimal/thousands separators in "4.5" and "1,000" and the apostrophe in
 * "it's" are kept, so "4.5" never matches "45". A trailing "%" is kept too.
 * (The first evaluation run found that a model quote differing from the page
 * only by an inserted dash was wrongly rejected; this is that fix.)
 */
export function normalizeForQuote(input: string): string {
  return input
    .replace(/\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\]/g, (_m, slug: string, label?: string) => label ?? slug)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~>#]/g, "")
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”‟]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/…/g, "...")
    // Protect separators that sit inside a token (4.5, 1,000, it's) with
    // private-use placeholders, drop all other punctuation, then restore.
    .replace(/(\d)\.(?=\d)/g, "$1\u0001")
    .replace(/(\d),(?=\d)/g, "$1\u0002")
    .replace(/(\p{L})'(?=\p{L})/gu, "$1\u0003")
    .replace(/[^\p{L}\p{N}%\u0001\u0002\u0003\s]+/gu, " ")
    .replace(/\u0001/g, ".")
    .replace(/\u0002/g, ",")
    .replace(/\u0003/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * True when `quote` appears (after normalization) inside `passageText`.
 * An ellipsis ("..." or "…") inside a quote is treated as a gap: every
 * fragment must appear, in order. This matches how people (and models)
 * abbreviate quotations without letting unrelated text pass.
 */
export function quoteAppearsIn(quote: string, passageText: string): boolean {
  const fragments = quote
    .split(/\.\.\.|…/)
    .map(normalizeForQuote)
    .filter((f) => f.length > 0);
  if (fragments.length === 0) return false;
  const haystack = normalizeForQuote(passageText);
  let from = 0;
  for (const fragment of fragments) {
    const at = haystack.indexOf(fragment, from);
    if (at < 0) return false;
    from = at + fragment.length;
  }
  return true;
}
