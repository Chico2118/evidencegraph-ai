// The deterministic suite: no network, no model, no clock, no randomness.
// Running it twice must produce byte-identical JSON (a test enforces this).

import {
  extractQueryTerms,
  findContradictionCandidates,
  indexPageForSearch,
  openInMemoryDb,
  parseRawClaims,
  rankPassages,
  searchPages,
  searchPagesRanked,
  segmentPassages,
  termCoverage,
  upsertPage,
  validateEvidence,
  type CorpusPage,
  type EvidenceCorpus,
} from "@evidencegraph/core";

import { loadFixtures, type CitationCase, type Fixtures } from "./fixtures";
import { hitAtK, macroAverage, ratio, recallAtK, reciprocalRank, type Metric } from "./metrics";

export const EVAL_SCHEMA_VERSION = 1;
const KS = [1, 3, 5, 10] as const;
/** Declared before the first run and never tuned on these fixtures. */
export const ABSTENTION_COVERAGE_THRESHOLD = 0.5;
const SENSITIVITY_THRESHOLDS = [0.3, 0.5, 0.7] as const;

type RetrievalRow = { id: string; goldRank: number | null; retrieved: string[] };

export type RetrievalVariant = {
  hitAt: Record<string, Metric>;
  recallAt: Record<string, Metric>;
  mrr: Metric;
  perQuestion: RetrievalRow[];
};

export type ConfusionCell = Record<"valid" | "invalid" | "unavailable", number>;

export type ValidatorVariant = {
  accuracy: Metric;
  /** Of citations a human labeled invalid/unavailable: share flagged (predicted != valid). */
  problemDetectionRate: Metric;
  /** Of citations a human labeled valid: share wrongly flagged. */
  falseAlarmRate: Metric;
  confusion: Record<string, ConfusionCell>;
};

export type EvalReport = {
  schemaVersion: number;
  fixtures: {
    corpusPages: number;
    corpusPassages: number;
    answerableQuestions: number;
    unanswerableQuestions: number;
    citationCases: number;
    labeledCitations: number;
    goldContradictions: number;
    knownNonConflicts: number;
    corpusNote: string;
  };
  retrieval: {
    /** Questions phrased as full sentences. */
    naturalLanguage: { baseline: RetrievalVariant; improved: RetrievalVariant };
    /** The same information needs phrased as short keyword queries. */
    keyword: { baseline: RetrievalVariant; improved: RetrievalVariant };
    /** Passage-level, improved retriever only (the inherited pipeline had no passage ranking). */
    improvedPassageRecallAt3: Metric;
  };
  abstentionSignal: {
    threshold: number;
    baseline: { accuracy: Metric; answerableKept: Metric; unanswerableDetected: Metric };
    improved: { accuracy: Metric; answerableKept: Metric; unanswerableDetected: Metric };
    sensitivity: Array<{ threshold: number; accuracy: Metric; answerableKept: Metric; unanswerableDetected: Metric }>;
  };
  citationValidation: {
    baseline: ValidatorVariant;
    improved: ValidatorVariant;
    duplicateDetection: Metric;
    claimStateAccuracy: Metric;
    verdictAccuracy: Metric;
    /** Citations labeled valid-but-semantically-unsupported. Undetectable by integrity checks, by design. */
    semanticBlindSpots: number;
    disagreements: Array<{ case: string; claim: number; citation: number; expected: string; improved: string; baseline: string }>;
  };
  contradictions: {
    detected: number;
    truePositives: Metric;
    precision: Metric;
    recall: Metric;
    missedGold: string[];
    knownNonConflictsFlagged: Metric;
    flaggedNonConflicts: string[];
    unlabeledDetections: Array<{ pair: string; reasons: string[]; a: string; b: string }>;
  };
  limitations: string[];
};

// ---- helpers ------------------------------------------------------------------

function pairKey(a: string, b: string): string {
  return [a, b].sort().join(" | ");
}

function corpusPages(f: Fixtures): CorpusPage[] {
  return f.corpus.pages.map((p) => ({
    slug: p.slug,
    title: p.title,
    updated: p.updated,
    passages: segmentPassages(p.content),
    sources: p.sources,
  }));
}

function corpusFor(all: CorpusPage[], c: CitationCase): EvidenceCorpus {
  const map = new Map<string, CorpusPage | null | "unreadable">();
  for (const p of all) map.set(p.slug, p);
  for (const slug of c.removePages ?? []) map.delete(slug);
  for (const slug of c.unreadablePages ?? []) map.set(slug, "unreadable");
  return map;
}

// ---- retrieval ----------------------------------------------------------------

function buildDb(f: Fixtures) {
  const db = openInMemoryDb();
  for (const p of f.corpus.pages) {
    upsertPage(db, {
      slug: p.slug,
      title: p.title,
      type: p.type,
      created_at: p.updated,
      updated_at: p.updated,
      word_count: p.content.split(/\s+/).length,
      tags: [],
    });
    indexPageForSearch(db, { slug: p.slug, title: p.title, content: p.content, tags: [] });
  }
  return db;
}

function summarize(rows: RetrievalRow[], golds: Map<string, string[]>): Omit<RetrievalVariant, "perQuestion"> {
  const hitAt: Record<string, Metric> = {};
  const recallAt: Record<string, Metric> = {};
  for (const k of KS) {
    hitAt[`@${k}`] = macroAverage(rows.map((r) => hitAtK(r.retrieved, golds.get(r.id) ?? [], k)));
    recallAt[`@${k}`] = macroAverage(rows.map((r) => recallAtK(r.retrieved, golds.get(r.id) ?? [], k)));
  }
  return { hitAt, recallAt, mrr: macroAverage(rows.map((r) => reciprocalRank(r.retrieved, golds.get(r.id) ?? []))) };
}

function sufficiency(terms: string[], slugs: string[], pageText: Map<string, string>): number {
  return Math.max(0, ...slugs.slice(0, 5).map((s) => termCoverage(terms, pageText.get(s) ?? "")));
}

function abstentionStats(
  answerable: boolean[],
  predictedAnswerable: boolean[],
): { accuracy: Metric; answerableKept: Metric; unanswerableDetected: Metric } {
  const n = answerable.length;
  const correct = answerable.filter((a, i) => a === predictedAnswerable[i]).length;
  const ans = answerable.filter(Boolean).length;
  const keptCount = answerable.filter((a, i) => a && predictedAnswerable[i]).length;
  const unans = n - ans;
  const detected = answerable.filter((a, i) => !a && !predictedAnswerable[i]).length;
  return { accuracy: ratio(correct, n), answerableKept: ratio(keptCount, ans), unanswerableDetected: ratio(detected, unans) };
}

// ---- citation validation --------------------------------------------------------

type Pred = "valid" | "invalid" | "unavailable";

/** What the inherited UI could do: link the slug if it exists. No passage or quote checks. */
function baselinePredict(raw: unknown, corpus: EvidenceCorpus): Pred {
  const page = typeof raw === "object" && raw !== null ? (raw as { page?: unknown }).page : undefined;
  if (typeof page !== "string" || !/^[a-z0-9-]+$/.test(page)) return "invalid";
  const entry = corpus.get(page);
  return entry && entry !== "unreadable" ? "valid" : "unavailable";
}

function validatorVariant(rows: Array<{ expected: Pred; predicted: Pred }>): ValidatorVariant {
  const confusion: Record<string, ConfusionCell> = {};
  for (const e of ["valid", "invalid", "unavailable"] as const) confusion[e] = { valid: 0, invalid: 0, unavailable: 0 };
  for (const r of rows) (confusion[r.expected] as ConfusionCell)[r.predicted]++;
  const problems = rows.filter((r) => r.expected !== "valid");
  const goods = rows.filter((r) => r.expected === "valid");
  return {
    accuracy: ratio(rows.filter((r) => r.expected === r.predicted).length, rows.length),
    problemDetectionRate: ratio(problems.filter((r) => r.predicted !== "valid").length, problems.length),
    falseAlarmRate: ratio(goods.filter((r) => r.predicted !== "valid").length, goods.length),
    confusion,
  };
}

// ---- main -------------------------------------------------------------------------

export function runDeterministicEval(fixtures: Fixtures = loadFixtures()): EvalReport {
  const pages = corpusPages(fixtures);
  const pageText = new Map(fixtures.corpus.pages.map((p) => [p.slug, `${p.title} ${p.content}`]));
  const db = buildDb(fixtures);

  try {
    // ---- retrieval
    const answerableQs = fixtures.questions.filter((q) => q.answerable);
    const golds = new Map(answerableQs.map((q) => [q.id, q.gold.map((g) => g.page)]));
    const retrievalFor = (queryOf: (q: (typeof answerableQs)[number]) => string) => {
      const baselineRows: RetrievalRow[] = [];
      const improvedRows: RetrievalRow[] = [];
      for (const q of answerableQs) {
        const gold = golds.get(q.id) ?? [];
        const text = queryOf(q);
        const b = searchPages(db, text, 10).map((h) => h.slug);
        const i = searchPagesRanked(db, text, 10).map((h) => h.slug);
        const rank = (list: string[]) => {
          const at = list.findIndex((s) => gold.includes(s));
          return at < 0 ? null : at + 1;
        };
        baselineRows.push({ id: q.id, goldRank: rank(b), retrieved: b });
        improvedRows.push({ id: q.id, goldRank: rank(i), retrieved: i });
      }
      return {
        baseline: { ...summarize(baselineRows, golds), perQuestion: baselineRows },
        improved: { ...summarize(improvedRows, golds), perQuestion: improvedRows },
      };
    };
    const naturalLanguage = retrievalFor((q) => q.question);
    const keyword = retrievalFor((q) => q.keywordQuery ?? q.question);

    // passage-level, improved only: rank passages across the top-5 retrieved pages
    const passageRecalls = answerableQs.map((q) => {
      const terms = extractQueryTerms(q.question);
      const top = searchPagesRanked(db, q.question, 5).map((h) => h.slug);
      const scored = top.flatMap((slug, pageRank) =>
        rankPassages(pages.find((p) => p.slug === slug)?.passages ?? [], terms).map((p) => ({ key: `${slug}#${p.id}`, score: p.score, pageRank, index: p.index })),
      );
      scored.sort((a, b) => b.score - a.score || a.pageRank - b.pageRank || a.index - b.index);
      const top3 = scored.slice(0, 3).map((s) => s.key);
      const gold = q.gold.flatMap((g) => g.passages.map((p) => `${g.page}#${p}`));
      return recallAtK(top3, gold, 3);
    });

    // ---- abstention signal (all questions)
    const answerableFlags = fixtures.questions.map((q) => q.answerable);
    const baselinePred = fixtures.questions.map((q) => searchPages(db, q.question, 10).length > 0);
    const improvedCoverage = fixtures.questions.map((q) => {
      const terms = extractQueryTerms(q.question);
      const slugs = searchPagesRanked(db, q.question, 5).map((h) => h.slug);
      return sufficiency(terms, slugs, pageText);
    });
    const improvedPred = improvedCoverage.map((c) => c >= ABSTENTION_COVERAGE_THRESHOLD);

    // ---- citation validation
    const baselineRowsV: Array<{ expected: Pred; predicted: Pred }> = [];
    const improvedRowsV: Array<{ expected: Pred; predicted: Pred }> = [];
    const disagreements: EvalReport["citationValidation"]["disagreements"] = [];
    let dupTotal = 0;
    let dupHit = 0;
    let claimStateTotal = 0;
    let claimStateHit = 0;
    let verdictHit = 0;
    let blindSpots = 0;

    for (const c of fixtures.citationCases) {
      const corpus = corpusFor(pages, c);
      const parsed = parseRawClaims(c.claims);
      const report = validateEvidence({ claims: parsed.claims, origin: "model", pagesUsed: [], corpus });

      if (report.verdict === c.verdict) verdictHit++;
      c.claimStates.forEach((expected, i) => {
        claimStateTotal++;
        if (report.claims[i]?.evidenceState === expected) claimStateHit++;
      });

      for (const label of c.labels) {
        const check = report.claims[label.claim]?.citations[label.citation];
        if (label.semantic) blindSpots++;
        if (label.duplicate) {
          dupTotal++;
          if (check?.isDuplicate) dupHit++;
          continue; // duplicates are excluded from integrity accuracy for both variants
        }
        const raw = c.claims[label.claim]?.citations[label.citation];
        const improved = check?.integrity ?? "invalid";
        const baseline = baselinePredict(raw, corpus);
        improvedRowsV.push({ expected: label.expected, predicted: improved });
        baselineRowsV.push({ expected: label.expected, predicted: baseline });
        if (improved !== label.expected || baseline !== label.expected) {
          disagreements.push({ case: c.id, claim: label.claim, citation: label.citation, expected: label.expected, improved, baseline });
        }
      }
    }

    // ---- contradictions
    const candidates = findContradictionCandidates(
      pages.map((p) => ({ slug: p.slug, title: p.title, updated: p.updated, passages: p.passages })),
    );
    const detectedKeys = candidates.map((c) => pairKey(`${c.a.pageSlug}#${c.a.passageId}`, `${c.b.pageSlug}#${c.b.passageId}`));
    const goldKeys = new Set(fixtures.contradictions.gold.map((g) => pairKey(g.a, g.b)));
    const nonConflictKeys = new Set(fixtures.contradictions.knownNonConflicts.map((g) => pairKey(g.a, g.b)));
    const detectedSet = new Set(detectedKeys);
    const tp = [...goldKeys].filter((k) => detectedSet.has(k)).length;
    const flaggedNon = [...nonConflictKeys].filter((k) => detectedSet.has(k));

    return {
      schemaVersion: EVAL_SCHEMA_VERSION,
      fixtures: {
        corpusPages: pages.length,
        corpusPassages: pages.reduce((n, p) => n + p.passages.length, 0),
        answerableQuestions: answerableQs.length,
        unanswerableQuestions: fixtures.questions.length - answerableQs.length,
        citationCases: fixtures.citationCases.length,
        labeledCitations: improvedRowsV.length,
        goldContradictions: goldKeys.size,
        knownNonConflicts: nonConflictKeys.size,
        corpusNote: fixtures.corpus.note,
      },
      retrieval: {
        naturalLanguage,
        keyword,
        improvedPassageRecallAt3: macroAverage(passageRecalls),
      },
      abstentionSignal: {
        threshold: ABSTENTION_COVERAGE_THRESHOLD,
        baseline: abstentionStats(answerableFlags, baselinePred),
        improved: abstentionStats(answerableFlags, improvedPred),
        sensitivity: SENSITIVITY_THRESHOLDS.map((t) => ({
          threshold: t,
          ...abstentionStats(answerableFlags, improvedCoverage.map((c) => c >= t)),
        })),
      },
      citationValidation: {
        baseline: validatorVariant(baselineRowsV),
        improved: validatorVariant(improvedRowsV),
        duplicateDetection: ratio(dupHit, dupTotal),
        claimStateAccuracy: ratio(claimStateHit, claimStateTotal),
        verdictAccuracy: ratio(verdictHit, fixtures.citationCases.length),
        semanticBlindSpots: blindSpots,
        disagreements,
      },
      contradictions: {
        detected: candidates.length,
        truePositives: ratio(tp, goldKeys.size),
        precision: ratio(detectedKeys.filter((k) => goldKeys.has(k)).length, detectedKeys.length),
        recall: ratio(tp, goldKeys.size),
        missedGold: [...goldKeys].filter((k) => !detectedSet.has(k)).sort(),
        knownNonConflictsFlagged: ratio(flaggedNon.length, nonConflictKeys.size),
        flaggedNonConflicts: flaggedNon.sort(),
        unlabeledDetections: candidates
          .filter((c, i) => !goldKeys.has(detectedKeys[i] as string) && !nonConflictKeys.has(detectedKeys[i] as string))
          .map((c) => ({
            pair: pairKey(`${c.a.pageSlug}#${c.a.passageId}`, `${c.b.pageSlug}#${c.b.passageId}`),
            reasons: c.reasons.map((r) => r.code),
            a: c.a.statement,
            b: c.b.statement,
          })),
      },
      limitations: LIMITATIONS,
    };
  } finally {
    db.close();
  }
}

const LIMITATIONS = [
  "Small, synthetic corpora and a few dozen questions, all written by one person: results are a regression guard, not an estimate of real-world accuracy.",
  "The held-out set was written after development stopped and was run once before any fix, but its author also built the system, so it is held out from tuning, not independent of the author's assumptions.",
  "Gold labels were written by the same person who built the system; no inter-annotator agreement was measured.",
  "Citation-validation cases are hand-written failure modes, not sampled model outputs. They show the validator catches what it was designed to catch, not how often real models fail.",
  "Semantic support (does a passage actually back the claim?) is not measured: it needs human judgment, and no model-based assessor is shipped.",
  "Model-behavior metrics (citation correctness, unsupported-claim rate, real abstention) require live mode with a model and have not been run for this report.",
  "The abstention threshold (0.5 term coverage) was fixed before the first run; the sensitivity table shows other values for transparency, not as tuned alternatives.",
];
