// Single source of truth for what each metric means. The Evaluation Lab page
// renders this list and docs/evaluation.md mirrors it.

export type MetricDefinition = {
  name: string;
  definition: string;
  denominator: string;
  /** How the number is produced. */
  source: "automated" | "automated against hand-written labels" | "live model only" | "needs human judgment";
};

export const METRIC_DEFINITIONS: MetricDefinition[] = [
  {
    name: "Retrieval Recall@k",
    definition:
      "For each answerable question: the share of its gold pages that appear in the top k retrieved pages. Averaged over questions (macro).",
    denominator: "Answerable questions (each contributes a value between 0 and 1).",
    source: "automated against hand-written labels",
  },
  {
    name: "Retrieval Hit@k",
    definition: "1 if at least one gold page is in the top k, else 0. Averaged over questions.",
    denominator: "Answerable questions.",
    source: "automated against hand-written labels",
  },
  {
    name: "MRR",
    definition: "Mean reciprocal rank of the first gold page in the ranked results (0 when none is retrieved).",
    denominator: "Answerable questions.",
    source: "automated against hand-written labels",
  },
  {
    name: "Passage Recall@3",
    definition: "Share of gold passages found among the 3 best-scoring passages across the top 5 retrieved pages.",
    denominator: "Answerable questions.",
    source: "automated against hand-written labels",
  },
  {
    name: "Abstention signal accuracy",
    definition:
      "Whether a retrieval-only rule (best page covers at least half the question's content terms) correctly separates answerable from unanswerable questions. This is a signal, not model behavior.",
    denominator: "All questions.",
    source: "automated against hand-written labels",
  },
  {
    name: "Citation integrity accuracy",
    definition:
      "Share of labeled citations whose validator outcome (valid / invalid / unavailable) equals the hand label. Duplicates are excluded.",
    denominator: "Labeled, non-duplicate citations.",
    source: "automated against hand-written labels",
  },
  {
    name: "Bad citations flagged / good citations wrongly flagged",
    definition: "Detection rate on citations labeled invalid or unavailable, and false-alarm rate on citations labeled valid.",
    denominator: "Citations labeled bad / citations labeled valid.",
    source: "automated against hand-written labels",
  },
  {
    name: "Contradiction recall and precision",
    definition:
      "Recall: gold conflicting passage pairs that the detector flags. Precision: flagged pairs that are in the gold list. Flags not covered by any label count against precision.",
    denominator: "Gold pairs (recall) / flagged pairs (precision).",
    source: "automated against hand-written labels",
  },
  {
    name: "Citation resolution rate (live)",
    definition: "Share of a real model's citations that resolve to a real page, passage and (if quoted) matching text.",
    denominator: "Non-duplicate citations in answerable-question answers.",
    source: "live model only",
  },
  {
    name: "Citation correctness vs gold (live)",
    definition: "Share of resolving citations that point at a gold page (and gold passage, when a passage is cited).",
    denominator: "Resolving citations.",
    source: "live model only",
  },
  {
    name: "Unsupported-claim rate, integrity proxy (live)",
    definition: "Share of claims whose citations do not all resolve (including claims with no citation).",
    denominator: "Claims in answerable-question answers.",
    source: "live model only",
  },
  {
    name: "Abstention behavior (live)",
    definition:
      "On unanswerable questions: share where the model made no claims (abstained) vs made claims anyway; on answerable ones: share it wrongly abstained.",
    denominator: "Unanswerable / answerable questions.",
    source: "live model only",
  },
  {
    name: "Semantic support",
    definition: "Whether a cited passage actually supports its claim. Not computed anywhere in this project.",
    denominator: "n/a",
    source: "needs human judgment",
  },
];
