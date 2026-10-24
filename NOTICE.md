# Notice: provenance, attribution and modifications

EvidenceGraph AI is a **derivative work**. This file states exactly what it is derived from and what was added, so neither the upstream author's work nor the new work is misrepresented.

## Upstream project

| | |
|---|---|
| Project | **LLM Wiki** |
| Author | Yasas ([@ddsyasas](https://github.com/ddsyasas)) |
| Source | <https://github.com/ddsyasas/llm-wiki> |
| Version of the snapshot used | 1.2.3 (as declared in the upstream `apps/web/package.json`) |
| License | MIT — Copyright (c) 2026 Yasas |
| Pattern it implements | Andrej Karpathy's "LLM Wiki" gist: <https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f> |

The MIT license requires the upstream copyright and permission notice to remain in copies and substantial portions of the software. It does: see [`LICENSE`](LICENSE), which keeps the upstream line and adds a second line for the modifications.

EvidenceGraph AI is not affiliated with, endorsed by, or maintained by the upstream author, Andrej Karpathy, or Anthropic.

## What is inherited (not authored by Shivam Jani)

- The monorepo layout and tooling (pnpm workspaces, Next.js App Router app, vitest).
- The ingestion pipeline: format detection and extraction (`packages/ingestion`), raw-source storage, ingest prompts and the ingest/apply/retry flow.
- The markdown wiki model, frontmatter handling, SQLite metadata and FTS5 index, file sync and trash/history backups (`packages/core`).
- The OpenRouter/Ollama client wrapper with retry and JSON repair (`packages/llm`).
- Chats, the lint operation, the schema editor, the 3D graph view, the multi-wiki switcher, cost tracking, onboarding, settings, the CLI and the publish scripts.
- The shadcn-style UI primitives and most page scaffolding.
- The design documents `docs/01-*.md` through `docs/14-*.md`, `docs/dev-log.md`, `docs/dev-setup.md` and `docs/contributor-walkthrough.md`. They describe LLM Wiki as built by the upstream author and are kept as historical design context; where they say "LLM Wiki" they mean the upstream product.

## What was added or changed by Shivam Jani

**New modules**

| Where | What |
|---|---|
| `packages/core/src/passages.ts` | Passage segmentation and stable passage ids; punctuation-tolerant quote matching |
| `packages/core/src/evidence.ts` | Typed citation-integrity validator; claim/evidence report; derived-claim fallback |
| `packages/core/src/evidence-corpus.ts` | Loads cited pages and lineage; verifies a query response (path-traversal safe) |
| `packages/core/src/retrieval.ts` | Stop-word-aware OR/bm25 retrieval; passage scoring and selection |
| `packages/core/src/contradictions.ts` | Deterministic contradiction-candidate detection; persisted human review state |
| `packages/core/src/research-history.ts` | Local research-run history (validated on read) |
| `packages/eval/` | Evaluation lab: development and hash-pinned held-out synthetic fixtures, metrics, deterministic runner, live-model runner, mock model and server, demo seeding, failure-mode tests |
| `.github/workflows/ci.yml`, `.gitattributes` | CI (typecheck, lint, test, evaluation check, build; no secrets) and LF line endings so hash-pinned files stay valid on Windows |
| `packages/ingestion/src/limits.ts` | Upload/pasted-text/URL size limits and extension allowlist |
| `apps/web/src/lib/demo-policy.ts`, `apps/web/src/middleware.ts`, `apps/web/src/lib/demo-client.ts`, `apps/web/src/app/api/health`, `apps/web/scripts/start-demo.mjs` | Read-only public demo mode: allow-list middleware, rate limits, in-process mock model, health check, start script |
| `packages/eval/src/demo-guard.ts` | `pnpm demo` refuses to delete a folder that is not clearly a demo wiki |
| `packages/ingestion/src/url-guard.ts` | Blocks private/local addresses for URL ingestion and re-checks redirects (opt-out `EVIDENCEGRAPH_ALLOW_PRIVATE_URLS`) |
| `packages/core/src/secrets.ts` (modified) | Optional `EVIDENCEGRAPH_OPENROUTER_API_KEY`: the key is read from the environment and never stored |
| `apps/web/src/components/research/`, `app/contradictions/`, `app/evaluation/`, `app/api/research/`, `app/api/contradictions/` | Research workspace pieces, contradiction explorer, evaluation lab page, APIs |

**Changed inherited modules**

- `prompts/query.ts` and `query.ts`: passages are numbered, the model is asked for structured claims with `{page, passage, quote}`; retrieval now uses `retrieval.ts`. The query response schema gained an optional, deliberately loose `claims` field.
- `app/query/query-view.tsx`: rebuilt as the research workspace (claims, evidence inspector, history, mobile sheet).
- `app/api/query/route.ts`: verifies the response and saves the run.
- Library (`components/sources/sources-list.tsx`): search, type/status filters, status badges, empty states; removal of debug logging of source titles.
- `app/api/ingest/route.ts`, `packages/ingestion/src/url.ts`: size limits, URL scheme check, extension allowlist.
- `packages/llm/src/client.ts`, `errors.ts`: a rejected API key (HTTP 401/403) is now a distinct `AuthenticationError` with a fixed message, is not retried, and never carries the SDK's own message (which can echo part of a key). Previously it was a generic error retried three times.
- `packages/core/src/schema.ts`: `claims` and the slugs in `pagesUsed` are validated leniently so a malformed value cannot discard an otherwise readable answer.
- Source detail page and `/api/sources` no longer expose absolute filesystem paths to the browser.
- Dashboard (`app/page.tsx`), header, footer, About, Help, command palette, design tokens, logo and favicon: rebranded and redesigned.
- The CLI was renamed (`evidencegraph`); its upstream npm update check was **removed** (it queried the upstream package and would have pointed users at it).
- Workspace packages renamed from `@llm-wiki/*` to `@evidencegraph/*`.

**Removed**

- The upstream README screenshots (they show the old product), the Product Hunt badge, and links to upstream's marketing/npm pages.

## Identifiers deliberately kept for compatibility

Renaming these would orphan existing users' data or credentials, so they remain even though they carry the old name:

| Kept | Why |
|---|---|
| `.llm-wiki/` folder inside each wiki | Holds the SQLite cache, settings, history and trash of existing wikis |
| `~/.llm-wiki/` global config folder and `LLM_WIKI_CONFIG_DIR` | Existing global config and fallback key file |
| OS keychain service name `llm-wiki` | Existing stored API keys would otherwise become unreadable |
| `LLM_WIKI_PATH`, `LLM_WIKI_PORT` | Still honored; `EVIDENCEGRAPH_PATH` / `EVIDENCEGRAPH_PORT` take precedence |
| Default folder `~/llm-wiki-default` | Existing default wiki location |
| `llm-wiki:theme` browser storage key | Preserves the user's theme choice |
| The upstream design docs and `docs/dev-log.md` | Historical record of the inherited project |

## Third-party software

Dependencies (Next.js, React, Tailwind CSS, better-sqlite3, zod, openai SDK, mammoth, officeparser, @mozilla/readability, three.js, react-force-graph-3d, vitest, tsx and others) are used under their own licenses, listed in `pnpm-lock.yaml` and in each package's metadata. Fonts (Inter, Fraunces, Crimson Pro, JetBrains Mono) are loaded from Google Fonts under the SIL Open Font License.

## Placeholders

None are shown in the product UI. Repository, homepage and issue URLs in `package.json`, templates and the CLI banner point at `github.com/Chico2118/evidencegraph-ai`, the intended location; **that repository has not been created or published yet**.
