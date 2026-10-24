// Question → evidence retrieval.
//
// The inherited `searchPages` wraps every word of the question in quotes,
// which FTS5 treats as an implicit AND: "What temperature does the cell
// degrade at?" only matches a page containing *all* of those words,
// including "what", "does" and "the". That is fine for a keyword search box
// and poor for natural-language questions. `searchPages` is left unchanged
// (the evaluation lab uses it as the baseline); this module adds:
//
//   - stop-word removal so only content words drive the match,
//   - an OR query with prefix matching (plural/verb forms) ranked by bm25,
//   - passage-level scoring so the prompt can lead with the best passages.

import type { Db } from "./db";
import { segmentPassages, type Passage } from "./passages";

const STOPWORDS = new Set(
  (
    "a an and are as at be been being but by can could did do does doing for from had has have how i if in into is it its " +
    "me my of on or our should so than that the their them then there these they this those to too was we were what when " +
    "where which while who whom whose why will with would you your about above after again all also any because before " +
    "between both each few more most other over same some such only own very just tell give show explain describe"
  ).split(" "),
);

/** Content words of a question, lowercased and de-duplicated, in order of first appearance. */
export function extractQueryTerms(question: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of question.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < 2 || STOPWORDS.has(raw) || seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
  }
  return out;
}

/**
 * Prefix stems for inflection: "fares" must find "fare", "subsidy" must find
 * "subsidies", "buses" must find "bus". Found by the held-out evaluation: the
 * first version only prefix-matched the exact word, so a question that said
 * "removing fares" missed pages that said "fare-free". Stems are at least 3
 * characters; shorter words are matched exactly.
 */
export function prefixStems(term: string): string[] {
  const stems = new Set<string>([term]);
  if (term.length >= 5) {
    for (const suffix of ["ies", "es", "ing", "ed", "s", "y"]) {
      if (term.endsWith(suffix) && term.length - suffix.length >= 3) stems.add(term.slice(0, -suffix.length));
    }
  }
  return [...stems];
}

/** Builds a safe FTS5 OR query; every term is quoted so punctuation cannot act as syntax. */
export function buildOrQuery(terms: string[]): string {
  const parts: string[] = [];
  for (const t of terms) {
    const quote = (s: string) => `"${s.replace(/"/g, '""')}"`;
    if (t.length >= 5) for (const stem of prefixStems(t)) parts.push(`${quote(stem)}*`);
    else parts.push(quote(t));
  }
  return parts.join(" OR ");
}

export type RankedPageHit = { slug: string; title: string; score: number };

/**
 * bm25-ranked page search over the FTS index. Title matches weigh more than
 * body matches. Lower bm25 is better in SQLite, so the score is negated:
 * higher `score` = more relevant.
 */
export function searchPagesRanked(db: Db, question: string, limit = 10): RankedPageHit[] {
  const terms = extractQueryTerms(question);
  if (terms.length === 0) return [];
  const rows = db
    .prepare(
      `SELECT slug, title, bm25(pages_fts, 0.0, 6.0, 1.0, 3.0) AS rank
         FROM pages_fts
        WHERE pages_fts MATCH ?
        ORDER BY rank
        LIMIT ?`,
    )
    .all(buildOrQuery(terms), limit) as Array<{ slug: string; title: string; rank: number }>;
  return rows.map((r) => ({ slug: r.slug, title: r.title, score: -r.rank }));
}

// ---- passage scoring --------------------------------------------------------

function tokenSet(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 2));
}

function termMatches(term: string, tokens: Set<string>): boolean {
  if (tokens.has(term)) return true;
  if (term.length < 5) return false;
  const stem = term.slice(0, Math.max(4, term.length - 2));
  for (const t of tokens) if (t.startsWith(stem)) return true;
  return false;
}

/** Fraction (0..1) of the question's content terms present in `text`. */
export function termCoverage(terms: string[], text: string): number {
  if (terms.length === 0) return 0;
  const tokens = tokenSet(text);
  return terms.filter((t) => termMatches(t, tokens)).length / terms.length;
}

export type ScoredPassage = Passage & { score: number };

/** Scores passages by term coverage; ties keep document order. */
export function rankPassages(passages: Passage[], terms: string[]): ScoredPassage[] {
  return passages
    .map((p) => ({ ...p, score: termCoverage(terms, `${p.heading ?? ""} ${p.text}`) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
}

export type ContextPage = {
  slug: string;
  title: string;
  type: string;
  /** Passages chosen for the prompt, in document order. */
  passages: Array<{ id: string; text: string; heading: string | null }>;
  omittedPassages: number;
};

/**
 * Chooses which passages of a page go into the prompt under a word budget:
 * the best-scoring passages first, re-sorted into reading order. Passage ids
 * always come from the full page, so a cited id means the same thing whether
 * or not the model saw every passage.
 */
export function selectPassagesForPrompt(
  page: { slug: string; title: string; type: string; content: string },
  terms: string[],
  wordBudget = 900,
): ContextPage {
  const all = segmentPassages(page.content);
  const ranked = rankPassages(all, terms);
  const chosen: ScoredPassage[] = [];
  let words = 0;
  for (const p of ranked) {
    const w = p.text.split(/\s+/).length;
    if (chosen.length > 0 && words + w > wordBudget) continue;
    chosen.push(p);
    words += w;
  }
  chosen.sort((a, b) => a.index - b.index);
  return {
    slug: page.slug,
    title: page.title,
    type: page.type,
    passages: chosen.map((p) => ({ id: p.id, text: p.text, heading: p.heading })),
    omittedPassages: all.length - chosen.length,
  };
}
