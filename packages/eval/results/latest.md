# EvidenceGraph AI — deterministic evaluation

Sample: 13 synthetic pages (33 passages), 15 answerable + 5 unanswerable questions, 18 citation cases (24 labeled citations), 5 gold contradictions.

## 1. Retrieval (page level, answerable questions)

Baseline = the inherited search (every word must match). Improved = stop-words removed, OR query with prefix matching, bm25 ranking. Both phrasings of each information need are reported.

### Natural-language questions

| Metric | Baseline | Improved |
|---|---|---|
| Recall@1 | 0.0% (0/15) | 73.3% (11/15) |
| Recall@3 | 0.0% (0/15) | 100.0% (15/15) |
| Recall@5 | 0.0% (0/15) | 100.0% (15/15) |
| Recall@10 | 0.0% (0/15) | 100.0% (15/15) |
| Hit@1 | 0.0% (0/15) | 86.7% (13/15) |
| Hit@3 | 0.0% (0/15) | 100.0% (15/15) |
| MRR | 0.000 | 0.933 |

### Keyword queries

| Metric | Baseline | Improved |
|---|---|---|
| Recall@1 | 70.0% (10.5/15) | 66.7% (10/15) |
| Recall@3 | 83.3% (12.5/15) | 100.0% (15/15) |
| Recall@5 | 83.3% (12.5/15) | 100.0% (15/15) |
| Recall@10 | 83.3% (12.5/15) | 100.0% (15/15) |
| Hit@1 | 80.0% (12/15) | 80.0% (12/15) |
| Hit@3 | 86.7% (13/15) | 100.0% (15/15) |
| MRR | 0.833 | 0.900 |

Passage Recall@3 (improved retriever, natural-language questions; the inherited pipeline had no passage ranking): 93.3% (14/15)

## 2. Abstention signal (all 20 questions)

A retrieval-only signal for "the wiki may not cover this". Baseline: abstain when the inherited search returns nothing. Improved: abstain when the best retrieved page covers < 0.5 of the question's content terms.

| Metric | Baseline | Improved |
|---|---|---|
| Accuracy | 25.0% (5/20) | 100.0% (20/20) |
| Answerable questions kept | 0.0% (0/15) | 100.0% (15/15) |
| Unanswerable questions detected | 100.0% (5/5) | 100.0% (5/5) |

Sensitivity of the improved signal to its threshold (reported, not tuned):

| Threshold | Accuracy | Answerable kept | Unanswerable detected |
|---|---|---|---|
| 0.3 | 95.0% (19/20) | 100.0% (15/15) | 80.0% (4/5) |
| 0.5 | 100.0% (20/20) | 100.0% (15/15) | 100.0% (5/5) |
| 0.7 | 85.0% (17/20) | 80.0% (12/15) | 100.0% (5/5) |

## 3. Citation integrity validation (labeled citations)

| Metric | Baseline (slug-exists only) | Improved (full validator) |
|---|---|---|
| Integrity accuracy | 83.3% (20/24) | 100.0% (24/24) |
| Bad citations flagged | 71.4% (10/14) | 100.0% (14/14) |
| Good citations wrongly flagged | 0.0% (0/10) | 0.0% (0/10) |

Improved only: duplicate detection 100.0% (1/1), claim-state accuracy 100.0% (21/21), verdict accuracy 100.0% (18/18).

Known blind spot: 1 labeled citation(s) resolve correctly but do not support the claim. Integrity checks cannot catch these by design.

Cases where a variant disagreed with the label:

| Case | Claim/citation | Label | Improved | Baseline |
|---|---|---|---|---|
| cc02-fabricated-quote | 0/0 | invalid | invalid | valid |
| cc03-quote-in-other-passage | 0/0 | invalid | invalid | valid |
| cc08-nonexistent-passage | 0/0 | invalid | invalid | valid |
| cc18-mixed | 1/0 | invalid | invalid | valid |

## 4. Contradiction candidates

| Metric | Value |
|---|---|
| Candidates flagged | 6 |
| Gold conflicts found (recall) | 100.0% (5/5) |
| Precision against gold | 83.3% (5/6) |
| Known non-conflicts wrongly flagged | 33.3% (1/3) |

Flagged known non-conflicts: thermal-management#p1 | thermal-management#p2

## Limitations

- Small, synthetic corpora and a few dozen questions, all written by one person: results are a regression guard, not an estimate of real-world accuracy.
- The held-out set was written after development stopped and was run once before any fix, but its author also built the system, so it is held out from tuning, not independent of the author's assumptions.
- Gold labels were written by the same person who built the system; no inter-annotator agreement was measured.
- Citation-validation cases are hand-written failure modes, not sampled model outputs. They show the validator catches what it was designed to catch, not how often real models fail.
- Semantic support (does a passage actually back the claim?) is not measured: it needs human judgment, and no model-based assessor is shipped.
- Model-behavior metrics (citation correctness, unsupported-claim rate, real abstention) require live mode with a model and have not been run for this report.
- The abstention threshold (0.5 term coverage) was fixed before the first run; the sensitivity table shows other values for transparency, not as tuned alternatives.
