// Potential-contradiction detection and review state.
//
// This module only ever produces POSSIBLE conflicts. Two sentences that
// disagree on a number, or differ by a negation, may well both be right:
// different date, different material, different definition. So every
// candidate carries:
//   - the reason(s) it was flagged (machine-readable code + plain sentence),
//   - context differences a reviewer should weigh (dates, qualifiers),
//   - a review state that only a human can move to "confirmed".
//
// Detection is fully deterministic (no model call), so it is free, fast,
// reproducible and can be evaluated against labeled fixtures.

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import type { Db } from "./db";
import { listPageRows } from "./db-pages";
import { segmentPassages, type Passage } from "./passages";
import { extractQueryTerms } from "./retrieval";
import { readPage, WIKI_PATHS } from "./wiki";

// ---- types ------------------------------------------------------------------

export type ContradictionReasonCode = "numeric_mismatch" | "negation_mismatch" | "opposite_terms";

export type ContradictionReason = { code: ContradictionReasonCode; message: string };

export type ReviewStatus =
  | "unreviewed"
  /** A human judged these genuinely cannot both hold. */
  | "confirmed_contradiction"
  /** Both are right: different scope, date, definition or conditions. */
  | "explained_difference"
  /** Not actually about the same thing / false alarm. */
  | "not_a_conflict";

export const REVIEW_STATUSES: readonly ReviewStatus[] = [
  "unreviewed",
  "confirmed_contradiction",
  "explained_difference",
  "not_a_conflict",
] as const;

export type ClaimSide = {
  pageSlug: string;
  pageTitle: string;
  pageUpdated: string | null;
  passageId: string;
  heading: string | null;
  /** The sentence that triggered the flag, verbatim from the page (markdown stripped). */
  statement: string;
  /** Full passage text, for context. */
  passageText: string;
};

export type ContradictionCandidate = {
  /** Stable across runs for the same pair of statements; keys the review state. */
  id: string;
  a: ClaimSide;
  b: ClaimSide;
  reasons: ContradictionReason[];
  /** Differences that may explain the disagreement without either side being wrong. */
  contextNotes: string[];
  /** Heuristic ordering aid, not a probability. */
  strength: "high" | "medium" | "low";
  /** Always "possible_conflict": detection can never confirm a contradiction. */
  classification: "possible_conflict";
};

export type ContradictionPage = {
  slug: string;
  title: string;
  updated: string | null;
  passages: Passage[];
};

// ---- statement extraction ---------------------------------------------------

type Measure = { value: number; unit: string; raw: string };

type Statement = {
  page: ContradictionPage;
  passage: Passage;
  text: string;
  terms: Set<string>;
  measures: Measure[];
  years: number[];
  negated: boolean;
  opposites: Set<string>;
  qualifiers: string[];
};

const NEGATION_RE = /\b(not|no|never|cannot|without|neither|nor|fails? to|unable to|doesn't|don't|isn't|aren't|won't|can't|didn't)\b|n't\b/i;

// Opposite pairs. Order-insensitive; both directions are checked.
const OPPOSITES: Array<[string, string]> = [
  ["increase", "decrease"],
  ["increases", "decreases"],
  ["higher", "lower"],
  ["faster", "slower"],
  ["safe", "unsafe"],
  ["improves", "degrades"],
  ["improve", "degrade"],
  ["more", "less"],
  ["greater", "smaller"],
  ["enables", "prevents"],
  ["supports", "opposes"],
];
const OPPOSITE_WORDS = new Set(OPPOSITES.flat());

const UNIT_ALIASES: Record<string, string> = {
  percent: "%",
  degree: "deg",
  degrees: "deg",
  c: "deg",
  "°c": "deg",
  "°f": "deg",
  celsius: "deg",
  year: "year",
  years: "year",
  month: "month",
  months: "month",
  day: "day",
  days: "day",
  hour: "hour",
  hours: "hour",
  cycle: "cycle",
  cycles: "cycle",
};
const NON_UNITS = new Set(["of", "in", "and", "the", "to", "at", "for", "a", "an", "or", "is", "are", "was", "by", "on", "with", "as", "than", "after", "before"]);

const MEASURE_RE = /(?<![\w.])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?(%|°\s?[CFK]|[A-Za-z]{1,12})?/g;
const QUALIFIER_RE = /\b(?:at|in|for|under|during|when|with|using|on)\s+(?:the\s+)?[^,.;()]{3,40}/gi;

export function stripMarkdown(text: string): string {
  return text
    .replace(/\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\]/g, (_m, slug: string, label?: string) => label ?? slug)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~>]/g, "")
    .replace(/^\s*([-+]|\d+[.)])\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSentences(text: string): string[] {
  return stripMarkdown(text)
    // Sentence ends, plus semicolons: "A rises; B falls." holds two statements.
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])|(?<=;)\s+/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length >= 5);
}

// A 4-digit number in 1900..2100 is a year when nothing marks it as a
// quantity, or when it follows a year-introducing word ("of the 2019 level",
// "by 2030") and its trailing word is not a real unit. Without this rule,
// "the 2019 level" was parsed as a quantity with unit "level", which removed
// "level" from the topic terms (found by the held-out evaluation).
const YEAR_LEADERS = new Set(["in", "by", "since", "of", "from", "until", "during", "before", "after", "the", "to", "through", "around", "circa"]);

function looksLikeYear(value: number, unitRaw: string, sentence: string, index: number): boolean {
  if (!Number.isInteger(value) || value < 1900 || value > 2100) return false;
  if (!unitRaw) return true;
  if (unitRaw in UNIT_ALIASES || unitRaw === "%") return false;
  const before = sentence.slice(0, index).trimEnd().split(/\s+/).pop()?.toLowerCase() ?? "";
  return YEAR_LEADERS.has(before);
}

function extractMeasures(sentence: string): { measures: Measure[]; years: number[] } {
  const measures: Measure[] = [];
  const years: number[] = [];
  for (const m of sentence.matchAll(MEASURE_RE)) {
    const value = Number((m[1] ?? "").replace(/,/g, ""));
    if (!Number.isFinite(value)) continue;
    const unitRaw = (m[2] ?? "").replace(/\s/g, "").toLowerCase();
    if (looksLikeYear(value, unitRaw, sentence, m.index ?? 0)) {
      years.push(value);
      continue;
    }
    if (!unitRaw || NON_UNITS.has(unitRaw)) continue;
    measures.push({ value, unit: UNIT_ALIASES[unitRaw] ?? unitRaw, raw: m[0].trim() });
  }
  return { measures, years };
}

function toStatement(page: ContradictionPage, passage: Passage, text: string): Statement {
  const { measures, years } = extractMeasures(text);
  const measureWords = new Set(measures.flatMap((m) => [m.unit, m.raw.toLowerCase()]));
  const terms = new Set(
    extractQueryTerms(text).filter(
      (t) => !/^\d/.test(t) && !OPPOSITE_WORDS.has(t) && !measureWords.has(t) && !NEGATION_RE.test(t),
    ),
  );
  const words = text.toLowerCase().split(/[^a-z']+/);
  return {
    page,
    passage,
    text,
    terms,
    measures,
    years,
    negated: NEGATION_RE.test(text),
    opposites: new Set(words.filter((w) => OPPOSITE_WORDS.has(w))),
    qualifiers: [...text.matchAll(QUALIFIER_RE)].map((q) => q[0].trim().toLowerCase()),
  };
}

// ---- pairing ----------------------------------------------------------------

const MIN_SHARED_TERMS = 3;
const MIN_JACCARD = 0.45;
const MIN_RELATIVE_DIFF = 0.1;
const MAX_POSTING = 200;
const MAX_STATEMENTS = 3000;

function overlap(a: Statement, b: Statement): { shared: number; jaccard: number } {
  let shared = 0;
  for (const t of a.terms) if (b.terms.has(t)) shared++;
  const union = a.terms.size + b.terms.size - shared;
  return { shared, jaccard: union === 0 ? 0 : shared / union };
}

function hasOppositePair(a: Statement, b: Statement): [string, string] | null {
  for (const [x, y] of OPPOSITES) {
    if ((a.opposites.has(x) && b.opposites.has(y)) || (a.opposites.has(y) && b.opposites.has(x))) return [x, y];
  }
  return null;
}

// Near-identical wording (same sentence frame) with a different number is a
// notable disagreement even when the numbers are close, so the relative-diff
// cutoff only applies to statements that merely overlap in topic.
const NEAR_IDENTICAL_JACCARD = 0.6;

function numericConflict(a: Statement, b: Statement, jaccard: number): { a: Measure; b: Measure } | null {
  for (const ma of a.measures) {
    for (const mb of b.measures) {
      if (ma.unit !== mb.unit) continue;
      const top = Math.max(Math.abs(ma.value), Math.abs(mb.value));
      if (top === 0) continue;
      const differs = ma.value !== mb.value;
      const material = Math.abs(ma.value - mb.value) / top > MIN_RELATIVE_DIFF;
      if (material || (differs && jaccard >= NEAR_IDENTICAL_JACCARD)) return { a: ma, b: mb };
    }
  }
  return null;
}

function contextNotesFor(a: Statement, b: Statement): string[] {
  const notes: string[] = [];
  if (a.page.updated && b.page.updated && a.page.updated !== b.page.updated) {
    notes.push(`Different page dates: “${a.page.title}” updated ${a.page.updated}, “${b.page.title}” updated ${b.page.updated}.`);
  }
  if (a.years.length > 0 && b.years.length > 0 && a.years.join() !== b.years.join()) {
    notes.push(`The statements refer to different years (${a.years.join(", ")} vs ${b.years.join(", ")}).`);
  }
  const qa = a.qualifiers.filter((q) => !b.qualifiers.includes(q));
  const qb = b.qualifiers.filter((q) => !a.qualifiers.includes(q));
  if (qa.length > 0 && qb.length > 0) {
    notes.push(`Different conditions stated: “${qa[0]}” vs “${qb[0]}”.`);
  } else if (qa.length > 0 || qb.length > 0) {
    notes.push(`Only one statement states a condition: “${(qa[0] ?? qb[0]) as string}”.`);
  }
  return notes;
}

function sideOf(s: Statement): ClaimSide {
  return {
    pageSlug: s.page.slug,
    pageTitle: s.page.title,
    pageUpdated: s.page.updated,
    passageId: s.passage.id,
    heading: s.passage.heading,
    statement: s.text,
    passageText: s.passage.text,
  };
}

function candidateId(a: Statement, b: Statement): string {
  const keys = [
    `${a.page.slug}#${a.passage.id}:${a.text.toLowerCase()}`,
    `${b.page.slug}#${b.passage.id}:${b.text.toLowerCase()}`,
  ].sort();
  return createHash("sha256").update(keys.join("\n")).digest("hex").slice(0, 16);
}

/** Finds statement pairs across the given pages that may contradict each other. */
export function findContradictionCandidates(pages: ContradictionPage[]): ContradictionCandidate[] {
  const statements: Statement[] = [];
  for (const page of pages) {
    for (const passage of page.passages) {
      for (const text of splitSentences(passage.text)) {
        statements.push(toStatement(page, passage, text));
        if (statements.length >= MAX_STATEMENTS) break;
      }
    }
  }

  // Inverted index so we only compare statements that share vocabulary.
  const postings = new Map<string, number[]>();
  statements.forEach((s, i) => {
    for (const t of s.terms) {
      const list = postings.get(t);
      if (list) list.push(i);
      else postings.set(t, [i]);
    }
  });

  const seen = new Set<string>();
  const out: ContradictionCandidate[] = [];

  statements.forEach((a, i) => {
    const counts = new Map<number, number>();
    for (const t of a.terms) {
      const list = postings.get(t);
      if (!list || list.length > MAX_POSTING) continue;
      for (const j of list) if (j > i) counts.set(j, (counts.get(j) ?? 0) + 1);
    }
    for (const [j, shared] of counts) {
      if (shared < MIN_SHARED_TERMS) continue;
      const b = statements[j];
      if (!b) continue;
      if (a.page.slug === b.page.slug && a.passage.id === b.passage.id) continue;
      const { jaccard } = overlap(a, b);
      if (jaccard < MIN_JACCARD) continue;

      const reasons: ContradictionReason[] = [];
      const num = numericConflict(a, b, jaccard);
      if (num) {
        reasons.push({
          code: "numeric_mismatch",
          message: `Same quantity (${num.a.unit}) stated as “${num.a.raw}” and “${num.b.raw}”.`,
        });
      }
      if (a.negated !== b.negated) {
        reasons.push({
          code: "negation_mismatch",
          message: "One statement is negated and the other is not, on the same topic.",
        });
      }
      const opp = hasOppositePair(a, b);
      if (opp) {
        reasons.push({ code: "opposite_terms", message: `Opposite terms on the same topic: “${opp[0]}” vs “${opp[1]}”.` });
      }
      if (reasons.length === 0) continue;

      const id = candidateId(a, b);
      if (seen.has(id)) continue;
      seen.add(id);

      const strong = reasons.some((r) => r.code === "numeric_mismatch") && jaccard >= 0.6;
      out.push({
        id,
        a: sideOf(a),
        b: sideOf(b),
        reasons,
        contextNotes: contextNotesFor(a, b),
        strength: strong ? "high" : reasons.length > 1 || jaccard >= 0.6 ? "medium" : "low",
        classification: "possible_conflict",
      });
    }
  });

  const rank = { high: 0, medium: 1, low: 2 } as const;
  return out.sort((x, y) => rank[x.strength] - rank[y.strength] || x.id.localeCompare(y.id));
}

// ---- review state -----------------------------------------------------------

export const CONTRADICTION_REVIEWS_FILE = "contradiction-reviews.json";

const ReviewEntrySchema = z.object({
  status: z.enum(["unreviewed", "confirmed_contradiction", "explained_difference", "not_a_conflict"]),
  note: z.string().max(2000).optional(),
  reviewedAt: z.string(),
});
const ReviewFileSchema = z.object({ version: z.literal(1), reviews: z.record(z.unknown()) });

export type ReviewEntry = z.infer<typeof ReviewEntrySchema>;

function reviewsPath(wikiPath: string): string {
  return join(wikiPath, WIKI_PATHS.tooling, CONTRADICTION_REVIEWS_FILE);
}

export async function loadReviews(wikiPath: string): Promise<Record<string, ReviewEntry>> {
  try {
    const parsed = ReviewFileSchema.safeParse(JSON.parse(await readFile(reviewsPath(wikiPath), "utf8")));
    if (!parsed.success) return {};
    const out: Record<string, ReviewEntry> = {};
    for (const [id, value] of Object.entries(parsed.data.reviews)) {
      const entry = ReviewEntrySchema.safeParse(value);
      if (entry.success && /^[a-f0-9]{16}$/.test(id)) out[id] = entry.data;
    }
    return out;
  } catch {
    return {};
  }
}

export async function saveReview(
  wikiPath: string,
  id: string,
  review: { status: ReviewStatus; note?: string },
): Promise<ReviewEntry> {
  if (!/^[a-f0-9]{16}$/.test(id)) throw new Error("invalid candidate id");
  const reviews = await loadReviews(wikiPath);
  const entry: ReviewEntry = {
    status: review.status,
    reviewedAt: new Date().toISOString(),
    ...(review.note?.trim() ? { note: review.note.trim().slice(0, 2000) } : {}),
  };
  if (review.status === "unreviewed") delete reviews[id];
  else reviews[id] = entry;

  const dir = join(wikiPath, WIKI_PATHS.tooling);
  await mkdir(dir, { recursive: true });
  const tmp = join(dir, `${CONTRADICTION_REVIEWS_FILE}.${process.pid}.tmp`);
  await writeFile(tmp, JSON.stringify({ version: 1, reviews }, null, 2), "utf8");
  await rename(tmp, reviewsPath(wikiPath));
  return entry;
}

// ---- whole-wiki scan --------------------------------------------------------

export type ReviewedCandidate = ContradictionCandidate & { review: ReviewEntry | null };

export type ContradictionScan = {
  candidates: ReviewedCandidate[];
  pagesScanned: number;
  /** Pages that could not be read or parsed (never fatal). */
  pagesSkipped: number;
};

/** Reads every page, finds candidates, and attaches any saved human review. */
export async function scanWikiForContradictions(wikiPath: string, db: Db): Promise<ContradictionScan> {
  const rows = listPageRows(db);
  const pages: ContradictionPage[] = [];
  let skipped = 0;
  for (const row of rows) {
    try {
      const page = await readPage(wikiPath, row.slug);
      pages.push({
        slug: page.slug,
        title: page.frontmatter.title,
        updated: page.frontmatter.updated,
        passages: segmentPassages(page.content),
      });
    } catch {
      skipped++;
    }
  }
  const reviews = await loadReviews(wikiPath);
  const candidates = findContradictionCandidates(pages).map((c) => ({ ...c, review: reviews[c.id] ?? null }));
  return { candidates, pagesScanned: pages.length, pagesSkipped: skipped };
}
