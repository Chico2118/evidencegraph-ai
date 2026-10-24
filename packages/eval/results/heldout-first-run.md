<!-- FROZEN: the FIRST run of the held-out set, with code unchanged since the fixtures were hashed (fixtures/heldout/FROZEN.sha256). Never edit. Later results are in heldout-latest.* and are no longer held-out for anything fixed after this. -->

# EvidenceGraph AI — HELD-OUT evaluation (current code)

Sample: 18 synthetic pages (46 passages), 22 answerable + 8 unanswerable questions, 21 citation cases (160 labeled citations), 7 gold contradictions.

## 1. Retrieval (page level, answerable questions)

Baseline = the inherited search (every word must match). Improved = stop-words removed, OR query with prefix matching, bm25 ranking. Both phrasings of each information need are reported.

### Natural-language questions

| Metric | Baseline | Improved |
|---|---|---|
| Recall@1 | 0.0% (0/22) | 81.8% (18/22) |
| Recall@3 | 0.0% (0/22) | 95.5% (21/22) |
| Recall@5 | 0.0% (0/22) | 95.5% (21/22) |
| Recall@10 | 0.0% (0/22) | 95.5% (21/22) |
| Hit@1 | 0.0% (0/22) | 90.9% (20/22) |
| Hit@3 | 0.0% (0/22) | 95.5% (21/22) |
| MRR | 0.000 | 0.932 |

### Keyword queries

| Metric | Baseline | Improved |
|---|---|---|
| Recall@1 | 88.6% (19.5/22) | 88.6% (19.5/22) |
| Recall@3 | 100.0% (22/22) | 100.0% (22/22) |
| Recall@5 | 100.0% (22/22) | 100.0% (22/22) |
| Recall@10 | 100.0% (22/22) | 100.0% (22/22) |
| Hit@1 | 100.0% (22/22) | 100.0% (22/22) |
| Hit@3 | 100.0% (22/22) | 100.0% (22/22) |
| MRR | 1.000 | 1.000 |

Passage Recall@3 (improved retriever, natural-language questions; the inherited pipeline had no passage ranking): 95.5% (21/22)

## 2. Abstention signal (all 30 questions)

A retrieval-only signal for "the wiki may not cover this". Baseline: abstain when the inherited search returns nothing. Improved: abstain when the best retrieved page covers < 0.5 of the question's content terms.

| Metric | Baseline | Improved |
|---|---|---|
| Accuracy | 26.7% (8/30) | 80.0% (24/30) |
| Answerable questions kept | 0.0% (0/22) | 81.8% (18/22) |
| Unanswerable questions detected | 100.0% (8/8) | 75.0% (6/8) |

Sensitivity of the improved signal to its threshold (reported, not tuned):

| Threshold | Accuracy | Answerable kept | Unanswerable detected |
|---|---|---|---|
| 0.3 | 83.3% (25/30) | 90.9% (20/22) | 62.5% (5/8) |
| 0.5 | 80.0% (24/30) | 81.8% (18/22) | 75.0% (6/8) |
| 0.7 | 56.7% (17/30) | 40.9% (9/22) | 100.0% (8/8) |

## 3. Citation integrity validation (labeled citations)

| Metric | Baseline (slug-exists only) | Improved (full validator) |
|---|---|---|
| Integrity accuracy | 65.0% (104/160) | 100.0% (160/160) |
| Bad citations flagged | 37.1% (33/89) | 100.0% (89/89) |
| Good citations wrongly flagged | 0.0% (0/71) | 0.0% (0/71) |

Improved only: duplicate detection n/a (0/0), claim-state accuracy 100.0% (161/161), verdict accuracy 100.0% (21/21).

Known blind spot: 0 labeled citation(s) resolve correctly but do not support the claim. Integrity checks cannot catch these by design.

Cases where a variant disagreed with the label:

| Case | Claim/citation | Label | Improved | Baseline |
|---|---|---|---|---|
| h-bus-rapid-transit-p1 | 5/0 | invalid | invalid | valid |
| h-bus-rapid-transit-p1 | 6/0 | invalid | invalid | valid |
| h-bus-rapid-transit-p1 | 7/0 | invalid | invalid | valid |
| h-bus-rapid-transit-p1 | 8/0 | invalid | invalid | valid |
| h-bus-rapid-transit-p2 | 5/0 | invalid | invalid | valid |
| h-bus-rapid-transit-p2 | 6/0 | invalid | invalid | valid |
| h-bus-rapid-transit-p2 | 7/0 | invalid | invalid | valid |
| h-bus-rapid-transit-p2 | 8/0 | invalid | invalid | valid |
| h-bus-rapid-transit-p3 | 5/0 | invalid | invalid | valid |
| h-bus-rapid-transit-p3 | 6/0 | invalid | invalid | valid |
| h-bus-rapid-transit-p3 | 7/0 | invalid | invalid | valid |
| h-bus-rapid-transit-p3 | 8/0 | invalid | invalid | valid |
| h-light-rail-p1 | 5/0 | invalid | invalid | valid |
| h-light-rail-p1 | 6/0 | invalid | invalid | valid |
| h-light-rail-p1 | 7/0 | invalid | invalid | valid |
| h-light-rail-p1 | 8/0 | invalid | invalid | valid |
| h-light-rail-p2 | 5/0 | invalid | invalid | valid |
| h-light-rail-p2 | 6/0 | invalid | invalid | valid |
| h-light-rail-p2 | 7/0 | invalid | invalid | valid |
| h-light-rail-p2 | 8/0 | invalid | invalid | valid |
| h-fare-policy-p1 | 5/0 | invalid | invalid | valid |
| h-fare-policy-p1 | 6/0 | invalid | invalid | valid |
| h-fare-policy-p1 | 7/0 | invalid | invalid | valid |
| h-fare-policy-p1 | 8/0 | invalid | invalid | valid |
| h-electric-buses-p2 | 5/0 | invalid | invalid | valid |
| h-electric-buses-p2 | 6/0 | invalid | invalid | valid |
| h-electric-buses-p2 | 7/0 | invalid | invalid | valid |
| h-electric-buses-p2 | 8/0 | invalid | invalid | valid |
| h-bike-lanes-p1 | 5/0 | invalid | invalid | valid |
| h-bike-lanes-p1 | 6/0 | invalid | invalid | valid |
| h-bike-lanes-p1 | 7/0 | invalid | invalid | valid |
| h-bike-lanes-p1 | 8/0 | invalid | invalid | valid |
| h-congestion-pricing-p1 | 5/0 | invalid | invalid | valid |
| h-congestion-pricing-p1 | 6/0 | invalid | invalid | valid |
| h-congestion-pricing-p1 | 7/0 | invalid | invalid | valid |
| h-congestion-pricing-p1 | 8/0 | invalid | invalid | valid |
| h-transit-oriented-development-p1 | 5/0 | invalid | invalid | valid |
| h-transit-oriented-development-p1 | 6/0 | invalid | invalid | valid |
| h-transit-oriented-development-p1 | 7/0 | invalid | invalid | valid |
| h-transit-oriented-development-p1 | 8/0 | invalid | invalid | valid |
| h-accessibility-p1 | 5/0 | invalid | invalid | valid |
| h-accessibility-p1 | 6/0 | invalid | invalid | valid |
| h-accessibility-p1 | 7/0 | invalid | invalid | valid |
| h-accessibility-p1 | 8/0 | invalid | invalid | valid |
| h-ridership-recovery-p1 | 5/0 | invalid | invalid | valid |
| h-ridership-recovery-p1 | 6/0 | invalid | invalid | valid |
| h-ridership-recovery-p1 | 7/0 | invalid | invalid | valid |
| h-ridership-recovery-p1 | 8/0 | invalid | invalid | valid |
| h-signal-priority-p1 | 5/0 | invalid | invalid | valid |
| h-signal-priority-p1 | 6/0 | invalid | invalid | valid |
| h-signal-priority-p1 | 7/0 | invalid | invalid | valid |
| h-signal-priority-p1 | 8/0 | invalid | invalid | valid |
| h-maintenance-costs-p3 | 5/0 | invalid | invalid | valid |
| h-maintenance-costs-p3 | 6/0 | invalid | invalid | valid |
| h-maintenance-costs-p3 | 7/0 | invalid | invalid | valid |
| h-maintenance-costs-p3 | 8/0 | invalid | invalid | valid |

## 4. Contradiction candidates

| Metric | Value |
|---|---|
| Candidates flagged | 4 |
| Gold conflicts found (recall) | 57.1% (4/7) |
| Precision against gold | 100.0% (4/4) |
| Known non-conflicts wrongly flagged | 0.0% (0/4) |

Missed gold pairs: congestion-pricing-critique#p1 | congestion-pricing-critique#p2; maintenance-costs#p2 | rail-economics#p1; ridership-recovery#p1 | ridership-recovery-regional#p1

## Limitations

- Small, synthetic corpus (13 pages) and 20 questions written by one person: results are a regression guard, not an estimate of real-world accuracy.
- Gold labels were written by the same person who built the system; no inter-annotator agreement was measured.
- Citation-validation cases are hand-written failure modes, not sampled model outputs. They show the validator catches what it was designed to catch, not how often real models fail.
- Semantic support (does a passage actually back the claim?) is not measured: it needs human judgment, and no model-based assessor is shipped.
- Model-behavior metrics (citation correctness, unsupported-claim rate, real abstention) require live mode with a model and have not been run for this report.
- The abstention threshold (0.5 term coverage) was fixed before the first run; the sensitivity table shows other values for transparency, not as tuned alternatives.
