# Milestone 1 — Repository audit and baseline

Audit of the downloaded LLM Wiki v1.2.3 snapshot, done before any change was made. It records what existed, what was measured, and the plan that followed.

## Baseline (before modification)

Environment: Windows 11, Node 22.23 LTS (Node 23.4 could not install — see below), pnpm 10.12.1.

| Check | Result |
|---|---|
| `pnpm install` | OK on Node 22 LTS. On Node 23.4 `better-sqlite3` has no prebuilt binary and needs a C++ toolchain; the build failed. Documented in Help → Troubleshooting. |
| `pnpm test` | **195 passed, 1 skipped** (the skipped one is a live-API smoke test that needs a key). 16 files. |
| `pnpm typecheck` | Clean in all 4 workspace packages. |
| `pnpm lint` | Passed with **2 pre-existing warnings** (`react-hooks/exhaustive-deps` in `command-palette.tsx` and `vault-graph.tsx`). The `lint` script of the three library packages is a no-op (`echo`). |
| `next build` | Succeeded. |
| Git metadata | None (ZIP download). Nothing to preserve or protect. |
| Remote dependency | Production build fetches Google Fonts; needs network. |

## Architecture as found

- Monorepo: `apps/web` (Next.js 14 App Router, UI + API routes), `packages/core` (wiki I/O, SQLite, ingest/query/lint), `packages/ingestion` (extractors), `packages/llm` (OpenAI-SDK client for OpenRouter/Ollama, retries, JSON repair).
- Storage: markdown files are the source of truth; SQLite (`better-sqlite3`) is a derived metadata/FTS5 cache.
- Every model call validates its JSON with `zod` (`schema.ts`); a `SchemaValidationError` is **not** retried.
- The query pipeline: FTS5 search → up to 10 pages (first 1000 words each) → prompt → JSON `{answer, pagesUsed, suggestedNewPage, confidence, caveats}`. Citations are `[[slug]]` links in free text.

## Inventory

### 1. Already working (kept, not rebuilt)

Multi-format ingestion with raw-file preservation and per-page source lineage (`page_sources`); markdown wiki with frontmatter, backlinks, history backups and trash; FTS5 search; lint (local scan + model pass); 3D graph; chats; multi-wiki switching; cost tracking; provider abstraction (OpenRouter and Ollama per slot); zod validation at the model boundary; 195 passing tests.

### 2. Worked, but needed improvement

| Finding | Evidence |
|---|---|
| Answers cite **pages**, never passages or quotes, so a claim cannot be traced to text. | `QueryResponseSchema`, `prompts/query.ts` |
| Citations were **never verified**. `pagesUsed` slugs were only regex-checked; the UI linked `/wiki/<slug>` blindly, so a hallucinated or deleted page produced a dead link presented as a source. | `app/query/query-view.tsx` (original) |
| Retrieval ANDs every word of the question (`searchPages` quotes each token → FTS5 implicit AND), including "what", "does", "the". | `db-pages.ts` `sanitizeFtsQuery`; measured in the evaluation: 0/15 natural-language questions retrieve their gold page |
| Lint's contradictions were free-text descriptions with no evidence, not persisted, not reviewable. | `lint.ts`, `lint-view.tsx` |
| `GET /api/sources` and the source detail page sent the **absolute filesystem path** to the browser. | `api/sources/route.ts`, `sources/[id]/page.tsx` |
| **No upload size limit**: `file.arrayBuffer()` on any size; no limit on pasted text or fetched URL bodies; upload extension flowed into a file name unfiltered. | `api/ingest/route.ts`, `ingestion/url.ts` |
| The CLI's update check queried the **upstream npm package** and would tell users to install it. | `bin/*.mjs` |
| Debug `console.log` of source titles in the browser. | `components/sources/sources-list.tsx` |

### 3. Genuinely missing

Claim-level structure; citation validation; passage addressing; contradiction review state; any evaluation harness or labeled data; research history; CI.

### 4. Postponed (deliberately)

| Item | Why |
|---|---|
| Model-assisted support assessment ("does this passage support the claim?") | The task requires evaluating it against labeled examples first; shipping an unmeasured score would imply a verdict the system cannot back. |
| Embedding/semantic retrieval | New dependency and infrastructure; measured keyword retrieval is already strong on the fixtures. |
| Applying the new retrieval to chat and ingest | Both have their own copy of the AND search. Ingest changes carry data-integrity risk and need their own evaluation. |
| Authentication, multi-user, cloud storage | No requirement; the app is single-user and local by design. |
| Model-assisted contradiction scan (reusing lint) | The deterministic detector comes first; a model pass would need quote validation and its own evaluation. |
| CI, Dockerfile | Out of scope for this phase. |

## Plan that was followed

1. Audit and baseline (this document).
2. Rebrand: names, packages, CLI, docs, assets, attribution, compatibility decisions.
3. Evidence integrity: passages → validator → corpus loader → API → tests.
4. Research interface and library.
5. Contradiction explorer.
6. Evaluation lab with a baseline run kept unedited.
7. Security hardening, documentation, final quality run.
