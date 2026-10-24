import type { EvalReport } from "./deterministic";
import type { Metric } from "./metrics";

function pct(m: Metric): string {
  return m.value === null ? "n/a" : `${(m.value * 100).toFixed(1)}%`;
}

function cell(m: Metric): string {
  return `${pct(m)} (${m.numerator}/${m.denominator})`;
}

function num(m: Metric): string {
  return m.value === null ? "n/a" : m.value.toFixed(3);
}

/** Plain-markdown rendering used by the CLI, the committed results file, and the docs. */
export function formatReportMarkdown(r: EvalReport, title = "EvidenceGraph AI — deterministic evaluation"): string {
  const f = r.fixtures;
  const cv = r.citationValidation;
  const ct = r.contradictions;
  const ab = r.abstentionSignal;
  const lines: string[] = [];

  lines.push(`# ${title}`);
  lines.push("");
  lines.push(
    `Sample: ${f.corpusPages} synthetic pages (${f.corpusPassages} passages), ${f.answerableQuestions} answerable + ${f.unanswerableQuestions} unanswerable questions, ${f.citationCases} citation cases (${f.labeledCitations} labeled citations), ${f.goldContradictions} gold contradictions.`,
  );
  lines.push("");
  lines.push("## 1. Retrieval (page level, answerable questions)");
  lines.push("");
  lines.push(
    "Baseline = the inherited search (every word must match). Improved = stop-words removed, OR query with prefix matching, bm25 ranking. Both phrasings of each information need are reported.",
  );
  for (const [label, v] of [
    ["Natural-language questions", r.retrieval.naturalLanguage],
    ["Keyword queries", r.retrieval.keyword],
  ] as const) {
    lines.push("");
    lines.push(`### ${label}`);
    lines.push("");
    lines.push("| Metric | Baseline | Improved |");
    lines.push("|---|---|---|");
    for (const k of ["@1", "@3", "@5", "@10"]) {
      lines.push(`| Recall${k} | ${cell(v.baseline.recallAt[k] as Metric)} | ${cell(v.improved.recallAt[k] as Metric)} |`);
    }
    for (const k of ["@1", "@3"]) {
      lines.push(`| Hit${k} | ${cell(v.baseline.hitAt[k] as Metric)} | ${cell(v.improved.hitAt[k] as Metric)} |`);
    }
    lines.push(`| MRR | ${num(v.baseline.mrr)} | ${num(v.improved.mrr)} |`);
  }
  lines.push("");
  lines.push(`Passage Recall@3 (improved retriever, natural-language questions; the inherited pipeline had no passage ranking): ${cell(r.retrieval.improvedPassageRecallAt3)}`);
  lines.push("");
  lines.push(`## 2. Abstention signal (all ${f.answerableQuestions + f.unanswerableQuestions} questions)`);
  lines.push("");
  lines.push(
    `A retrieval-only signal for "the wiki may not cover this". Baseline: abstain when the inherited search returns nothing. Improved: abstain when the best retrieved page covers < ${ab.threshold} of the question's content terms.`,
  );
  lines.push("");
  lines.push("| Metric | Baseline | Improved |");
  lines.push("|---|---|---|");
  lines.push(`| Accuracy | ${cell(ab.baseline.accuracy)} | ${cell(ab.improved.accuracy)} |`);
  lines.push(`| Answerable questions kept | ${cell(ab.baseline.answerableKept)} | ${cell(ab.improved.answerableKept)} |`);
  lines.push(`| Unanswerable questions detected | ${cell(ab.baseline.unanswerableDetected)} | ${cell(ab.improved.unanswerableDetected)} |`);
  lines.push("");
  lines.push("Sensitivity of the improved signal to its threshold (reported, not tuned):");
  lines.push("");
  lines.push("| Threshold | Accuracy | Answerable kept | Unanswerable detected |");
  lines.push("|---|---|---|---|");
  for (const s of ab.sensitivity) {
    lines.push(`| ${s.threshold} | ${cell(s.accuracy)} | ${cell(s.answerableKept)} | ${cell(s.unanswerableDetected)} |`);
  }
  lines.push("");
  lines.push("## 3. Citation integrity validation (labeled citations)");
  lines.push("");
  lines.push("| Metric | Baseline (slug-exists only) | Improved (full validator) |");
  lines.push("|---|---|---|");
  lines.push(`| Integrity accuracy | ${cell(cv.baseline.accuracy)} | ${cell(cv.improved.accuracy)} |`);
  lines.push(`| Bad citations flagged | ${cell(cv.baseline.problemDetectionRate)} | ${cell(cv.improved.problemDetectionRate)} |`);
  lines.push(`| Good citations wrongly flagged | ${cell(cv.baseline.falseAlarmRate)} | ${cell(cv.improved.falseAlarmRate)} |`);
  lines.push("");
  lines.push(
    `Improved only: duplicate detection ${cell(cv.duplicateDetection)}, claim-state accuracy ${cell(cv.claimStateAccuracy)}, verdict accuracy ${cell(cv.verdictAccuracy)}.`,
  );
  lines.push("");
  lines.push(
    `Known blind spot: ${cv.semanticBlindSpots} labeled citation(s) resolve correctly but do not support the claim. Integrity checks cannot catch these by design.`,
  );
  if (cv.disagreements.length > 0) {
    lines.push("");
    lines.push("Cases where a variant disagreed with the label:");
    lines.push("");
    lines.push("| Case | Claim/citation | Label | Improved | Baseline |");
    lines.push("|---|---|---|---|---|");
    const SHOWN = 12;
    for (const d of cv.disagreements.slice(0, SHOWN)) {
      lines.push(`| ${d.case} | ${d.claim}/${d.citation} | ${d.expected} | ${d.improved} | ${d.baseline} |`);
    }
    if (cv.disagreements.length > SHOWN) {
      lines.push("");
      lines.push(`…and ${cv.disagreements.length - SHOWN} more rows (see the JSON file).`);
    }
  }
  lines.push("");
  lines.push("## 4. Contradiction candidates");
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push("|---|---|");
  lines.push(`| Candidates flagged | ${ct.detected} |`);
  lines.push(`| Gold conflicts found (recall) | ${cell(ct.recall)} |`);
  lines.push(`| Precision against gold | ${cell(ct.precision)} |`);
  lines.push(`| Known non-conflicts wrongly flagged | ${cell(ct.knownNonConflictsFlagged)} |`);
  if (ct.missedGold.length > 0) lines.push(`\nMissed gold pairs: ${ct.missedGold.join("; ")}`);
  if (ct.flaggedNonConflicts.length > 0) lines.push(`\nFlagged known non-conflicts: ${ct.flaggedNonConflicts.join("; ")}`);
  if (ct.unlabeledDetections.length > 0) {
    lines.push("");
    lines.push("Detections not covered by any label (review manually; counted as false positives in precision):");
    for (const u of ct.unlabeledDetections) lines.push(`- ${u.pair} [${u.reasons.join(", ")}]`);
  }
  lines.push("");
  lines.push("## Limitations");
  lines.push("");
  for (const l of r.limitations) lines.push(`- ${l}`);
  lines.push("");
  return lines.join("\n");
}
