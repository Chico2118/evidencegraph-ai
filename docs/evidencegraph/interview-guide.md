# Interview guide — explaining EvidenceGraph AI

For talking about this project truthfully and confidently. Everything here is checkable in the repository.

## The 30-second version

"I took an open-source local-first research wiki (LLM Wiki, MIT, by Yasas) and built an evidence layer on top of it. The original cited whole pages and never checked them. I made the model cite a page, a passage and a verbatim quote for every claim, then verify each citation deterministically against the real text — and show missing, fabricated or deleted evidence in the UI. I also built a contradiction explorer with human review, and a reproducible evaluation lab that measures retrieval, citation integrity and contradiction detection, including where it doesn't work."

## What is mine, and what is not

- **Inherited:** ingestion, wiki storage, SQLite/FTS, model client, chats, lint, graph, most scaffolding. Say so first; it is in [`NOTICE.md`](../../NOTICE.md).
- **Mine:** the passage model, the citation-integrity validator and report, structured claims in the query prompt, the new retrieval, research history, the contradiction detector and review workflow, the evaluation lab, the research workspace and evidence inspector UI, the redesign and rebrand, the upload/URL hardening, and the tests for all of it.

If asked "how much of this did you write?": the inherited app is roughly the base; the new modules in NOTICE's table are the contribution. Don't claim the ingestion pipeline or the wiki engine.

## Design questions and honest answers

**Why separate "citation integrity" from "semantic support"?**
A citation can be perfectly real and still irrelevant. Integrity ("does this resolve to this text?") is decidable by code, so I test it. Support needs judgment; I show "support not assessed" instead of inventing a score. There is a labeled blind-spot case in the benchmark to prove I know the difference.

**Why not just ask another model to judge support?**
It could be added, but the task of evaluating it against labeled data comes first, and I had no labeled data large enough to trust. An unmeasured LLM "confidence" would look like a fact. It's on the roadmap, behind an evaluation.

**Why is the validator a pure function over a pre-loaded map?**
Testability and safety: no I/O in the logic, every failure mode is a one-line test, and the evaluation can run in memory. The disk loader is thin and separately tested, and re-checks slugs for path traversal.

**Why is `claims` typed `unknown[]` in the response schema?**
`callLLM` throws on a schema mismatch and doesn't retry. A strict element schema would let one bad claim discard the whole answer. Loose at the boundary, strict per item afterwards — bad items are reported, good ones survive.

**What happens with malformed model output?**
Invalid JSON → one repair retry (inherited). Valid JSON with garbage claims → reported as "n entries could not be read", the rest still verified. No claims at all → claims derived from `[[slug]]` links, flagged as derived.

**What if a cited page is deleted later?**
Reopening a saved run re-verifies against the current wiki, so it shows "evidence unavailable". There's a test for exactly this.

**How do you stop a model-supplied slug reading arbitrary files?**
Allowlist regex in the validator and again in the loader before `readPage` builds a path; tests with `../../etc/passwd`, backslashes and embedded `..`.

**Why files for research history and reviews, not SQLite tables?**
The project treats SQLite as a rebuildable cache. This is user data that can't be rebuilt, so it's small validated JSON, written atomically. No migration.

**How reliable is the contradiction detector?**
It finds candidates, never verdicts. On 5 labeled conflicts it flagged all 5 with 1 false positive in 6 — after I fixed two defects the first run exposed, using the same labels, so that figure is optimistic. Every result is "possible conflict" with context notes (dates, conditions); only a human review can mark it confirmed.

**Did you test it on data you hadn't tuned on?**
Yes, and it's the part I'm most glad I did. I wrote a second set in a different domain after development stopped, hashed the files, and ran it once. It found two real bugs (no handling of word endings in search; "the 2019 level" parsed as a quantity), which I fixed, and showed that my abstention threshold didn't generalize (100% → 80%), so I never made it a gate. Two contradictions it still misses need synonyms; I left them rather than add words after seeing the test. The fix cost one question on the dev set's keyword ranking and I reported that too. The honest caveat: I wrote both sets and built the system, so it's held out from tuning, not independent.

**Your retrieval went from 0% to 100% — is that real?**
Real but narrow, and I explain it rather than boast: the inherited search ANDs every word including "what" and "the" (FTS5 semantics). On natural-language questions it can't match (0%). On keyword queries it does fine: at rank 1 / rank 3 it scores 70% / 83% on the dev set and 89% / 100% on the held-out set. Mine reaches 100% at rank 3 on both, but on the dev set it is slightly *behind* at rank 1 (66.7% vs 70%, one question) after the word-ending fix. Synthetic corpora, so it's a regression guard, not an accuracy claim.

**What would you do next?**
Run live mode across a few models and record results; collect a larger human-labeled support set and evaluate a model-based support assessor before shipping one; move chat and ingest onto the new retrieval; add embeddings only if keyword retrieval is shown to be the bottleneck.

## Things to demonstrate live

1. `pnpm demo -- --mode flawed` → ask a question → show the verdict banner, a fabricated quote struck through, a ghost page marked "Not found", and the high-confidence warning.
2. Click a valid claim → "Open passage in page" highlights the passage in context; follow "Compiled from" to the raw source.
3. Contradictions → review one as "different scope or date" with a note; reload; it persists.
4. Evaluation → point at the "What changed after the first run" section and the limitations.
5. `pnpm test` and `pnpm eval:check`.

## Things not to claim

- That support/accuracy of answers is measured — it isn't; live-model results do not exist yet.
- That the benchmark proves general accuracy — it's synthetic and tiny.
- That the project is deployed, published, or used by anyone.
- That CI is green: the workflow has never run on GitHub.
- That a real model's behavior has been measured: live mode has not been run with a real model.
- That you wrote the ingestion pipeline, wiki engine, graph or chats.
