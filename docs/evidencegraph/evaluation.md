# Evaluation lab

A reproducible way to check the parts of the pipeline that can be checked **without a model**, plus an opt-in mode that runs a real model on the same questions.

```bash
pnpm eval            # deterministic suite; prints and writes packages/eval/results/latest.{json,md}
pnpm eval:check      # exits 1 if results differ from the committed latest.json (regression guard)
pnpm test            # includes the eval tests and the same drift check
```

The in-app view is **Evaluation** in the header (`/evaluation`); it re-runs the deterministic suite on each request.

## What is measured, and how

Every metric reports numerator and denominator. Definitions live in code (`packages/eval/src/definitions.ts`) and are rendered on the Evaluation page.

| Metric | Definition | Denominator | Produced by |
|---|---|---|---|
| Retrieval Recall@k | Per answerable question: share of its gold pages in the top *k*; macro-averaged | 15 answerable questions | Automated, against hand-written gold |
| Hit@k | 1 if any gold page is in the top *k* | 15 | Automated vs gold |
| MRR | Reciprocal rank of the first gold page | 15 | Automated vs gold |
| Passage Recall@3 | Gold passages among the 3 best passages across the top-5 pages | 15 | Automated vs gold |
| Abstention signal accuracy | Does a retrieval-only rule separate answerable from unanswerable questions? | 20 | Automated vs gold |
| Citation integrity accuracy | Validator outcome equals the hand label (valid / invalid / unavailable) | 24 labeled citations | Automated vs hand labels |
| Bad citations flagged / good wrongly flagged | Detection rate / false-alarm rate | 14 bad / 10 good | Automated vs hand labels |
| Contradiction recall / precision | Gold pairs found / flagged pairs that are gold | 5 gold / 6 flagged | Automated vs hand labels |
| Citation resolution rate *(live)* | A real model's citations that resolve | its non-duplicate citations | Live model only |
| Citation correctness vs gold *(live)* | Resolving citations that point at gold pages/passages | resolving citations | Live model only |
| Unsupported-claim rate *(live, integrity proxy)* | Claims whose citations don't all resolve | claims | Live model only |
| Abstention behavior *(live)* | Unanswerable: made no claims vs made claims anyway; answerable: falsely abstained | 5 / 15 | Live model only |
| **Semantic support** | Whether a passage truly supports its claim | n/a | **Needs human judgment — not computed anywhere** |

"Unsupported-claim rate" is explicitly an *integrity proxy*. A claim with a perfectly valid citation to an irrelevant passage counts as supported by this measure. That limitation is stated in the live report itself, and it is why semantic support is listed as unmeasured instead of being approximated.

## Fixtures

All in `packages/eval/fixtures/`, validated with zod at load time (including referential integrity: every gold page and passage must exist).

- `corpus.json` — 13 **synthetic** battery-research pages (33 passages) with source lineage. Invented for testing; contains deliberate disagreements (an outdated notes page, lab-vs-fleet data, differing thresholds) and decoys. None of the statements are real findings.
- `questions.json` — 15 answerable questions (with a keyword-style phrasing of each) and 5 unanswerable ones, with gold pages and passages.
- `citation-cases.json` — 18 hand-written model-style responses, 24 labeled citations: fabricated quotes, quote from the wrong passage, hallucinated page, deleted page, unreadable page, nonexistent passage, malformed entries, path-traversal slugs, duplicates, uncited claims, abstention, ellipsis and formatting variants, and one **known blind spot** (a wrong passage cited without a quote: the citation resolves, so integrity is "valid").
- `contradictions.json` — 5 gold conflicting passage pairs and 3 known non-conflicts.

The deterministic suite uses the production code paths: the same `searchPages` / `searchPagesRanked`, the same `validateEvidence`, the same `findContradictionCandidates`, over an in-memory SQLite database. No clock, no randomness, no network; a test checks two runs are byte-identical.

## Results (deterministic suite, current code)

Sample: 13 pages · 15 answerable + 5 unanswerable questions · 24 labeled citations · 5 gold contradictions. Full output: [`packages/eval/results/latest.md`](../../packages/eval/results/latest.md).

**Retrieval — baseline is the inherited every-word-must-match search**

| | Baseline | Improved |
|---|---|---|
| Natural-language questions: Recall@1 / @3 / MRR | 0% / 0% / 0.000 | 73.3% / 100% / 0.933 |
| Keyword queries: Recall@1 / @3 / MRR | 70.0% / 83.3% / 0.833 | 66.7% / 100% / 0.900 |

The 0% baseline is not a bug in the measurement: FTS5 treats the inherited quoted-token query as AND, so "What temperature does capacity fade…" requires a page to contain *what*, *does* and *the*. Keyword-style queries show the baseline working normally. The improved retriever is better at Recall@3 there, but its **Recall@1 is now below the baseline's** (66.7% vs 70.0%, one question) since the word-ending fix described under "Held-out evaluation" below widened the match and reshuffled one close ranking. It was not tuned away. Caveat: the inherited pipeline also gave the model the whole wiki index, so it could sometimes recover; this measures the search step alone.

**Citation integrity**

| | Baseline (slug exists) | Validator |
|---|---|---|
| Accuracy | 83.3% (20/24) | 100% (24/24) |
| Bad citations flagged | 71.4% (10/14) | 100% (14/14) |
| Good citations wrongly flagged | 0% (0/10) | 0% (0/10) |

**Contradiction detector** — recall 100% (5/5), precision 83.3% (5/6). The one false positive (liquid vs air cooling on the same page) is kept in the fixtures on purpose.

**Abstention signal** — 100% (20/20) at the pre-declared threshold of 0.5 term coverage, but 95% at 0.3 and 85% at 0.7. With 20 questions that swing is the honest read: a signal worth exploring, not a gate to ship.

## What changed after the first run — read this before trusting the numbers

The suite was run once before any fix; that output is frozen in [`results/first-run.md`](../../packages/eval/results/first-run.md). It exposed two defects, which were then fixed:

| Component | First run | Defect | After |
|---|---|---|---|
| Validator | accuracy 95.8%, 1 good citation flagged | A quote differing from the page only by an inserted dash was rejected | 100%, 0 false alarms |
| Contradiction detector | recall 3/5, precision 3/4 | A 6% numeric gap in near-identical wording was below the 10% cutoff; a `;`-joined clause diluted topic overlap | recall 5/5, precision 5/6 |

**Three things about the development first run that you should know:**

- It predates the keyword-phrasing variant. The first run had only natural-language questions; its inherited-search score of 0% made me doubt that the comparison was fair, so the keyword variant (and the Recall@1 and MRR rows for it) was added *afterwards*. That was a change to the measurement design made after seeing a result, though not a change tuned to flatter the new code (it showed the baseline doing much better).
- `first-run.md` is therefore a record of the pre-fix *validator and contradiction detector*, with a single retrieval table.
- The two markdown records are pinned by hash in `heldout.test.ts` only from the point they were checked for consistency (the held-out one against its JSON; the development one against the output observed at the time). Before that they were protected only by being committed alongside the results.

**The labels were not held out.** The fixes were informed by the same fixtures they are scored on, so the "after" numbers are optimistic and should be read as "these two bugs are fixed and covered by unit tests", not as generalization. The retrieval comparison and the abstention threshold were not adjusted after seeing results.

## Held-out evaluation

To see how far the development numbers carry, a **second dataset** was written after development stopped, in a different domain (urban transit) with different wording, and run **once** before anything was changed.

**How it was kept honest**

- Written first, as files in `packages/eval/fixtures/heldout/`; their SHA-256 hashes were recorded in `FROZEN.sha256` and a test fails if any file changes.
- The 160 labeled citations are **generated by script** (`generate-citation-cases.mjs`) from the corpus, with every label fixed by construction (a verbatim quote is valid; the same quote with one number changed is a fabrication; the same quote under another passage number is a wrong-passage citation; and so on), not taken from validator output.
- About a third of the 22 answerable questions paraphrase the page wording on purpose ("abolished" vs "fare-free", "stand at stations" vs "dwell time"); 8 questions are unanswerable, 2 of them adjacent topics.
- The first run is frozen as `results/heldout-first-run.{md,json}` (both hashes are pinned in a test). Later results are `heldout-latest.*`. The frozen JSON's limitation list still carries the older, generic wording ("13 pages", "20 questions"), because it cannot be edited without breaking the record; read it as the development set's text.

**Sample:** 18 pages (46 passages) · 22 answerable + 8 unanswerable questions · 160 labeled citations · 7 gold contradictions and 4 known non-conflicts.

| Measure | Held-out, first run (frozen) | Held-out, after fixes | Development set (now) |
|---|---|---|---|
| Retrieval Recall@3, natural-language | 95.5% (21/22) | 100% (22/22) | 100% (15/15) |
| Retrieval Recall@1, natural-language | 81.8% | 84.1% | 73.3% |
| Retrieval Recall@1, keyword | 88.6% | 88.6% | 66.7% |
| Passage Recall@3 | 95.5% | 100% | 93.3% |
| Baseline (inherited) Recall@3, natural-language | 0% (0/22) | 0% | 0% |
| Abstention signal accuracy (0.5) | 80.0% (24/30) | 80.0% | 100% (20/20) |
| Citation-integrity accuracy | 100% (160/160) | 100% | 100% (24/24) |
| Baseline (slug exists) citation accuracy | 65.0% (104/160) | 65.0% | 83.3% |
| Contradiction recall | 57.1% (4/7) | 71.4% (5/7) | 100% (5/5) |
| Contradiction precision | 100% (4/4) | 100% (5/5) | 83.3% (5/6) |

**What the first run showed**

| Finding | Verdict |
|---|---|
| A paraphrased question ("Did removing fares increase the subsidy needed?") missed its pages: the search matched exact words only, so *fares*≠*fare* and *subsidy*≠*subsidies*. | **Real defect → fixed** (`prefixStems`) |
| "…87 percent of the **2019 level**…" vs "92 percent…" was not flagged: "2019 level" was parsed as a quantity with unit "level", removing "level" from the topic terms and dropping overlap just under the cutoff. | **Real defect → fixed** (`looksLikeYear`) |
| "neighbouring streets" vs "surrounding streets" (critics' claim vs monitoring result) was missed: needs synonyms. | Lexical limit → **not fixed** |
| "cheaper per passenger-kilometre" vs "more expensive per passenger-kilometre" was missed: the detector's opposite-term list does not contain them. | Vocabulary gap → **not fixed** (adding words after seeing the test would be tuning on it) |
| The abstention signal dropped from 100% to 80%: four answerable questions were refused because paraphrasing lowered term coverage, and two unanswerable ones scored exactly 0.5. | The threshold **did not generalize**. It was never a product gate, and now there is evidence it should not become one |
| Citation integrity: 160/160 with no false alarms. | See the caveat below |

**Cost of the fixes.** The word-ending fix slightly *hurt* the development set: keyword Recall@1 fell from 73.3% to 66.7% (one question, a close ranking between two related pages). It was kept because it closed a real gap, and the trade-off is reported rather than tuned away.

**Caveats that apply to all of the above**

- After the fixes, the "after" column is **no longer held-out for those two defects**. Only the frozen first-run column is.
- The author of the held-out set also built the system, and knew its design. This is a set held out from tuning, not an independent one. No second annotator was involved.
- 100% citation integrity is a completeness check, not an accuracy claim: those 160 cases are built from the failure types the validator was designed for, so they cannot show failure types its author did not think of. Only real model output can do that, and it has not been run.
- Sample sizes are small enough that one question moves a rate by 3-7 percentage points.

## Failure-mode tests (no model required)

`packages/eval/src/failure-modes.test.ts` runs the real `queryWiki` and `verifyQueryResponse` against a stub that returns raw text. It covers: fenced JSON; invalid JSON repaired once; invalid JSON twice (clear error); garbage claim entries; a malformed `claims` container (string / null / object / number); a malformed slug in `pagesUsed`; a response with no answer; fabricated quote, ghost page, wrong passage and uncited claim together; two contradictory sources both cited; honest abstention; and a confident, uncited, invented answer. It found two defects, both fixed: a malformed `claims` container or `pagesUsed` slug used to discard an otherwise readable answer.

These show the pipeline copes when a model misbehaves. They say nothing about how often a real model does.

## Limitations

- Tiny, synthetic, single-author data. The numbers are a regression guard, not an estimate of real-world accuracy.
- The gold labels were written by the person who built the system; no inter-annotator agreement.
- Citation cases are hand-written failure modes, not sampled model outputs. They show the validator catches what it was built to catch, not how often models fail.
- Model-behavior metrics have **not been run**. No live-model result exists in this repository.
- Retrieval is evaluated at page level against gold pages; a retrieved page that also answers the question but is not in the gold list counts as a miss.

## Live mode

**Status: not run.** No credentials or local model were available when this was built, so no live-model result exists anywhere in this repository. The runner itself is verified end to end against the offline mock (see below), which proves the plumbing and nothing about any model.

### What it does

It seeds a temporary wiki from the development fixtures (20 questions), runs the real `queryWiki` + `verifyQueryResponse` for each question, and writes `results/live-<model>-<timestamp>.{json,md}` (one run per question; expect variation between runs). Live files are git-ignored.

**`--limit N` is a balanced sample, not "the first N".** The fixture lists every answerable question before any unanswerable one, so a plain slice would never test missing evidence. With a limit, about a quarter of the sample (at least one when N ≥ 2) is unanswerable and the rest are answerable, in original order. `--limit 5` runs `q01 q02 q03 q04 u01`: `q01` and `q04` have conflicting source pages, and `u01` has no answer in the wiki. With only 4 + 1 questions, treat those rates as anecdotes: the denominators are tiny.

**Safety behaviour.** If the provider rejects the key (HTTP 401/403) the run stops at the first question with "Authentication failed … No further requests were made", instead of retrying all 20. Failed questions are recorded with their error class and a *redacted* message (the key, and anything shaped like a key, is removed); the report never contains the key.

**Rate limits and credits (HTTP 429 / 402).** The run stops at the first 429 or 402 and sends nothing more; the report says how many questions were not run. The live client turns off the OpenAI SDK's own automatic retries (the app's client keeps its default), so the number of requests is exactly what the runner decided to send; before this change one question could send up to nine. The report records only non-secret facts about the response: status, `Retry-After`, whether `X-RateLimit-*` headers were present, and the `error_type`, `provider_name`, `provider_code` and a short message from the body. The accompanying explanation is a hint, not a diagnosis: per OpenRouter's documentation, `X-RateLimit-*` headers point to its own limiter and their absence to an upstream provider, and a 402 can also mean a negative balance on a free model. Other failures (for example a 404 for a model that is not available) are recorded per question and the run continues. The app also now honours a server's `Retry-After` on a 429 (read from the SDK's `Headers` object, capped at 60 s), which the old code silently ignored.

### Credentials: how to set them up locally

The live runner reads the key **only from the `OPENROUTER_API_KEY` environment variable**. It does not read the app's keychain entry, never prints the key, and never writes it to disk. Do not paste a key into a chat, an issue, or any file in the repository.

PowerShell (this window only; the variable disappears when you close it):

```powershell
$secure = Read-Host "OpenRouter key" -AsSecureString     # typing is hidden; not saved in history
$env:OPENROUTER_API_KEY = [System.Net.NetworkCredential]::new("", $secure).Password
Remove-Variable secure
pnpm eval --live --model anthropic/claude-haiku-4.5 --limit 5     # try 5 questions first
pnpm eval --live --model anthropic/claude-haiku-4.5               # then all 20
Remove-Item Env:OPENROUTER_API_KEY
```

Git Bash / macOS / Linux:

```bash
read -rs OPENROUTER_API_KEY && export OPENROUTER_API_KEY     # silent prompt
pnpm eval --live --model anthropic/claude-haiku-4.5 --limit 5
unset OPENROUTER_API_KEY
```

Local Ollama instead (no key, no cost):

```bash
ollama pull llama3
pnpm eval --live --provider ollama --model llama3
```

**Cost (an ESTIMATE, not a measurement):** the real prompts were built and measured, then priced with the project's table. Tokens are approximated at 4 characters each and each answer is assumed to use up to 500 output tokens.

| Run | Input tokens (approx.) | `claude-haiku-4.5` | `claude-sonnet-4.6` |
|---|---|---|---|
| `--limit 5` (`q01 q02 q03 q04 u01`) | ~7.4K | about **$0.02** | about **$0.06** |
| all 20 questions | ~26K | about **$0.08** | about **$0.23** |

Actual usage will differ; the report's own numbers are the real figures. (An earlier version of this document said ~6K tokens per question; that was wrong.)

**Which model, and how the id was checked:** on 2026-10-24 the identifiers were looked up in OpenRouter's public model catalogue (a read-only listing that needs no key and runs no model). Both `anthropic/claude-haiku-4.5` ($1 / $5 per million tokens) and `anthropic/claude-sonnet-4.6` ($3 / $15) are listed, with the same prices as the project's table. The catalogue also lists newer Anthropic models (for example `anthropic/claude-haiku-5.5`, `anthropic/claude-sonnet-5.5`) that are **not** in the project's price table, so the app would show their cost as "unknown"; they have not been tried here. The documented command uses Haiku 4.5, the project's default for *ingest*; the app's default for *Research* is Sonnet 4.6. Catalogues change, so re-check before a later run.

**Privacy:** this sends the *synthetic* fixture passages and questions to the provider. It does not touch your own wiki.

### What to send back afterwards

(The result files are in the `results` folder of `packages/eval`.) The result file is named `live-<model>-<timestamp>.md` (and a `.json` next to it). Both contain only synthetic fixture content and metrics, never the key. Send me:

1. The `.md` file's contents, and the `.json` if any run failed (it holds the per-question error class, redacted message, verdict, claim states and citation issue codes).
2. The exact command you ran (so I can tell whether it was `--limit 5` or all 20).
3. Anything odd you saw in the terminal (a rate-limit message, a long pause).

Do **not** send the key, a screenshot showing it, or your shell history. If you think the key was exposed, revoke it on OpenRouter and create a new one.

### Plumbing check with the offline mock

```bash
pnpm eval --live --mock            # faithful mock
pnpm eval --live --mock flawed     # mock that adds fabricated quotes, ghost pages, uncited claims
```

The output is headed **MOCK RUN** and says it describes no model. Its purpose is to prove the runner, schema handling and metric code work end to end before you spend money.

### What to look for in a real run

- **Failed runs** (schema failures, invalid JSON): how often does the model break the format? Look at the error names in the JSON.
- **Citation resolution rate** and **unsupported-claim rate**: how often do citations resolve? Remember this is an integrity proxy, not truth.
- **Abstention** on the 5 unanswerable questions: does it say so, or invent?
- Open a few answers in the app (`pnpm dev`, then Research) and read the passages. Semantic support still needs your eyes.

## Demo without a key

`pnpm demo` seeds the same synthetic corpus into a throwaway wiki, starts a mock model server and launches the app against both. `pnpm demo -- --mode flawed` makes the mock add a fabricated quote, a citation to a page that does not exist, and an uncited claim, all labeled "high confidence", so the warning states are visible. The mock is not a language model and proves nothing about LLM quality; it never touches your real wiki or `~/.llm-wiki`.
