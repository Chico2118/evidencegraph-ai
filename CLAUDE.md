# Project Brief for Claude Code

You are working on **EvidenceGraph AI — Research You Can Verify**, an evidence-first, local-first AI research workspace by Shivam Jani. It is a derivative of **LLM Wiki** by Yasas (MIT), which implements a pattern by Andrej Karpathy. Read `NOTICE.md` before touching attribution, licensing or naming.

## Read this first

1. `README.md` — what the product does, commands, limitations.
2. `docs/evidencegraph/architecture.md` — the evidence layer, data flow and security boundaries.
3. `docs/evidencegraph/evaluation.md` — what is measured, how, and what is not.
4. `docs/01-*.md` … `docs/14-*.md` — the **inherited** LLM Wiki design docs. They describe the upstream product; useful context for the wiki engine, ingest and storage, not a spec for the new features.

## Core principles, do not violate

1. **Everything is a file.** Pages, chats, schema, log, and user data such as research history and contradiction reviews live as files in the wiki folder. SQLite is a rebuildable metadata cache only.
2. **Local-first, BYOK.** No telemetry, no remote storage, no auth. Say plainly in the UI when content is sent to a model provider.
3. **One language:** TypeScript everywhere.
4. **Cross-platform:** Mac, Windows, Linux.
5. **Evidence honesty.** Never present a valid citation as proof a claim is true. *Integrity* (does it resolve?) is deterministic and tested; *support* is "not assessed" unless a measured, evaluated assessor exists. Never fabricate quotations, passages, titles or metrics.
6. **Every model output is untrusted.** Validate with zod before use; parse list items individually so one bad entry cannot hide the rest.

## Stack lock-in

Next.js 14 App Router · Tailwind + shadcn-style primitives · `better-sqlite3` · `openai` SDK (OpenRouter and Ollama) · pnpm · vitest · tsx (for the eval CLI only) · TypeScript strict. Do not introduce new frameworks without asking.

## Working conventions

- TypeScript strict mode; no `any` without a comment explaining why.
- Functions over classes where possible; named exports for shared modules.
- File names kebab-case; React components PascalCase.
- Comments explain *why*, not *what*.
- Domain logic in `packages/core`; UI in `apps/web`; no filesystem or SQLite imports in client components (type-only imports are fine).
- Slugs and passage ids from a model or a request are untrusted: validate before they reach a path.
- Keep tests deterministic: no network, no real model calls in `pnpm test`.

## Commands

```bash
pnpm install        # Node 20 or 22 LTS (Node 23 on Windows needs a C++ toolchain)
pnpm dev            # app on http://localhost:3000
pnpm demo           # app + synthetic wiki + mock model, no API key
pnpm test           # vitest, all packages
pnpm typecheck && pnpm lint
pnpm eval           # deterministic evaluation; pnpm eval:check to verify against committed results
```

## Don't do these things

- Don't claim benchmark results, usage, deployment or publication that did not happen.
- Don't tune a threshold on the evaluation fixtures and then report the fixture score as accuracy.
- Don't add telemetry, analytics or external tracking.
- Don't put an API key in a file that could be committed.
- Don't add a database other than SQLite, or introduce Electron/Tauri/React Native.
- Don't write large monolithic files; split by responsibility.
- Don't delete or rename the compatibility identifiers listed in `NOTICE.md` (`.llm-wiki/`, `~/.llm-wiki/`, keychain service name, `LLM_WIKI_*`).

## Attribution

EvidenceGraph AI is developed by Shivam Jani. The inherited code is by Yasas (MIT), implementing a pattern by Andrej Karpathy. Keep the upstream copyright line in `LICENSE`; keep `NOTICE.md` accurate when adding or changing modules.
