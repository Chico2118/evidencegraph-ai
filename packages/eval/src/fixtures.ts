// Loads and validates the labeled fixtures. A malformed fixture must fail
// loudly here, not silently skew a metric.

import { z } from "zod";

import citationCasesJson from "../fixtures/citation-cases.json";
import contradictionsJson from "../fixtures/contradictions.json";
import corpusJson from "../fixtures/corpus.json";
import questionsJson from "../fixtures/questions.json";
import heldoutCitationCasesJson from "../fixtures/heldout/citation-cases.json";
import heldoutContradictionsJson from "../fixtures/heldout/contradictions.json";
import heldoutCorpusJson from "../fixtures/heldout/corpus.json";
import heldoutQuestionsJson from "../fixtures/heldout/questions.json";

const CorpusSchema = z.object({
  note: z.string(),
  pages: z.array(
    z.object({
      slug: z.string().regex(/^[a-z0-9-]+$/),
      title: z.string(),
      type: z.enum(["entity", "concept", "source", "comparison", "overview"]),
      updated: z.string(),
      sources: z.array(z.object({ id: z.string(), title: z.string(), format: z.string() })),
      content: z.string(),
    }),
  ),
});

const QuestionsSchema = z.object({
  note: z.string(),
  questions: z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      /** Short keyword-style phrasing of the same information need (answerable questions only). */
      keywordQuery: z.string().optional(),
      answerable: z.boolean(),
      gold: z.array(z.object({ page: z.string(), passages: z.array(z.string()) })),
    }),
  ),
});

const CitationCasesSchema = z.object({
  note: z.string(),
  cases: z.array(
    z.object({
      id: z.string(),
      description: z.string(),
      removePages: z.array(z.string()).optional(),
      unreadablePages: z.array(z.string()).optional(),
      claims: z.array(z.object({ text: z.string(), citations: z.array(z.unknown()) })),
      labels: z.array(
        z.object({
          claim: z.number().int().min(0),
          citation: z.number().int().min(0),
          expected: z.enum(["valid", "invalid", "unavailable"]),
          duplicate: z.boolean().optional(),
          semantic: z.enum(["unsupported"]).optional(),
        }),
      ),
      claimStates: z.array(
        z.enum(["no_evidence", "all_citations_valid", "some_citations_valid", "no_valid_citations"]),
      ),
      verdict: z.enum(["no_claims", "all_claims_verified", "some_claims_unverified", "no_valid_evidence"]),
    }),
  ),
});

const PairSchema = z.object({ a: z.string(), b: z.string(), why: z.string() });
const ContradictionsSchema = z.object({
  note: z.string(),
  gold: z.array(PairSchema),
  knownNonConflicts: z.array(PairSchema),
});

export type Corpus = z.infer<typeof CorpusSchema>;
export type EvalQuestion = z.infer<typeof QuestionsSchema>["questions"][number];
export type CitationCase = z.infer<typeof CitationCasesSchema>["cases"][number];
export type ContradictionLabels = z.infer<typeof ContradictionsSchema>;

export type Fixtures = {
  corpus: Corpus;
  questions: EvalQuestion[];
  citationCases: CitationCase[];
  contradictions: ContradictionLabels;
};

/** The development fixtures: the implementation WAS adjusted while looking at these. */
export function loadFixtures(): Fixtures {
  return buildFixtures(corpusJson, questionsJson, citationCasesJson, contradictionsJson);
}

/** The held-out fixtures: written after development stopped; see docs/evidencegraph/evaluation.md. */
export function loadHeldoutFixtures(): Fixtures {
  return buildFixtures(heldoutCorpusJson, heldoutQuestionsJson, heldoutCitationCasesJson, heldoutContradictionsJson);
}

function buildFixtures(corpusRaw: unknown, questionsRaw: unknown, casesRaw: unknown, contradictionsRaw: unknown): Fixtures {
  const corpus = CorpusSchema.parse(corpusRaw);
  const questions = QuestionsSchema.parse(questionsRaw).questions;
  const citationCases = CitationCasesSchema.parse(casesRaw).cases;
  const contradictions = ContradictionsSchema.parse(contradictionsRaw);

  // Referential integrity: labels must point at things that exist.
  const slugs = new Set(corpus.pages.map((p) => p.slug));
  for (const q of questions) {
    for (const g of q.gold) {
      if (!slugs.has(g.page)) throw new Error(`fixture ${q.id}: gold page "${g.page}" is not in the corpus`);
    }
    if (q.answerable !== q.gold.length > 0) {
      throw new Error(`fixture ${q.id}: answerable must match whether gold is non-empty`);
    }
  }
  for (const c of citationCases) {
    c.labels.forEach((l) => {
      if (!c.claims[l.claim]) throw new Error(`fixture ${c.id}: label points at missing claim ${l.claim}`);
    });
  }
  return { corpus, questions, citationCases, contradictions };
}
