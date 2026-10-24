# Deployment assessment

**Status: not deployed.** Nothing has been published, no cloud resource exists, and no deployment URL exists. This page records what was inspected and verified locally, what stands in the way of hosting the app for other people, and the smallest safe path forward. Facts marked *verified* were observed on a local machine; everything else is read from the code.

## What was verified locally

| Check | Result |
|---|---|
| Production build (`pnpm build`) | Passes; produces a Next.js `standalone` server (`output: "standalone"`) |
| Production server (`node apps/web/.next/standalone/apps/web/server.js` with `PORT` and `HOSTNAME` set) | Starts in under a second; every page and `/api/sources` returned 200, after the first request in 0.15–0.5 s each |
| Development server (`pnpm dev`, `pnpm demo`) | Works; the first visit to each route takes up to ~20 s because routes compile on demand |
| Docker | Not verified. Docker Desktop is installed but its engine was not running, and no image was built. **No Dockerfile is provided**, because shipping an untested one would be a claim this project cannot back |

Run the production build locally:

```bash
pnpm build
# point it at a wiki folder (EVIDENCEGRAPH_PATH) and a config folder (LLM_WIKI_CONFIG_DIR) if you do not want the defaults
PORT=3100 HOSTNAME=127.0.0.1 node apps/web/.next/standalone/apps/web/server.js
```

## How the app stores things

- **Wiki = a folder of files** (`wiki/*.md`, `raw/`, `index.md`, `log.md`, `chats/`) plus `.llm-wiki/` inside it (SQLite metadata cache, research history, contradiction reviews, page history). The files are the source of truth; SQLite is rebuildable.
- **Global config** lives in `~/.llm-wiki/` (or `LLM_WIKI_CONFIG_DIR`): the active wiki and, when no OS keychain is available, **the OpenRouter key in plain text** (`packages/core/src/secrets.ts`). On a desktop the key goes to the OS keychain (`keytar`, a native module).
- **The API key can now come from the environment.** If `EVIDENCEGRAPH_OPENROUTER_API_KEY` is set, the app uses it, never writes it anywhere, and refuses to save or remove a key from Settings (HTTP 409). Otherwise it uses the OS keychain, falling back to the plain-text config file. `OPENROUTER_API_KEY` is a different variable, read by `pnpm eval --live` only, so a shell that exports it does not change the app's key.
- **Native modules:** `better-sqlite3` and `keytar` must be built for the host's OS and Node version.

## Why it should not simply be put on a public URL today

1. **No authentication.** Anyone who can reach the server can read every page and source, ingest content, delete data, and use or replace the stored API key (spending the owner's credit). `SECURITY.md` already says to keep the port off the network.
2. **URL ingestion now refuses private and local addresses and re-checks every redirect** (`packages/ingestion/src/url-guard.ts`), which covers the cloud metadata address. One gap remains: DNS rebinding (the name is resolved once for the check and again when connecting). Closing it needs a custom connector, which means a new dependency, so it was not done. Behind a private network only the owner can trigger it.
3. **Storage needs a persistent, writable disk.** Serverless platforms (including Vercel and Netlify functions) give each invocation an ephemeral file system, so ingested sources, pages and SQLite would be lost or inconsistent. They are not a fit.
4. **Single-user design.** There is one active wiki per server process, no accounts and no per-user data separation.

## Recommended path

1. **Simplest and verified: run it locally** (`pnpm demo` for the synthetic demo, `pnpm dev` or the production command above for real use). This is a local-first tool, and that is the supported mode.
2. **If a private URL is wanted** (for yourself or a few named people): one container or small VM with a **persistent volume** for the wiki and config folders, behind an authentication layer that is not in this repository (for example an identity-aware proxy or a private network such as Tailscale). The two code changes that this needed are done and tested locally (environment-supplied key, private-address blocking). Nothing has been deployed, and the app still has **no login**, which is why the layer in front of it matters.
3. **If a public demo is wanted:** it needs a read-only mode that does not exist yet (ingest, delete and URL fetch disabled; synthetic data and the mock model only, no key). It should not be exposed before that mode is built and reviewed.

## Environment variables the app understands

| Variable | Purpose |
|---|---|
| `EVIDENCEGRAPH_PATH` | Wiki folder to use (older `LLM_WIKI_PATH` still honoured) |
| `LLM_WIKI_CONFIG_DIR` | Global config folder (default `~/.llm-wiki`) |
| `OLLAMA_BASE_URL` | Local Ollama server (default `http://localhost:11434`); `pnpm demo` points it at its mock model |
| `PORT`, `HOSTNAME` | Used by the standalone Next.js server (bind to `127.0.0.1` unless something in front of it handles access) |
| `EVIDENCEGRAPH_PORT` | Port for the packaged `evidencegraph start` CLI |
| `EVIDENCEGRAPH_OPENROUTER_API_KEY` | The app's OpenRouter key for a server with no keychain; never stored, cannot be changed from Settings while set |
| `EVIDENCEGRAPH_ALLOW_PRIVATE_URLS` | `1` allows URL ingestion to reach private and local addresses (blocked by default; leave unset on a server) |
| `EVIDENCEGRAPH_DEMO` | `1` turns on the read-only public demo (set by `pnpm start:demo`) |
| `EVIDENCEGRAPH_DEMO_HOST` | Bind address for `pnpm start:demo` (default `127.0.0.1`) |
| `OPENROUTER_API_KEY` | **Not read by the app**; `pnpm eval --live` only |

## Free public hosting: what was found (October 2026)

The app stores everything in files plus SQLite, has one global workspace, and has no accounts. A public **multi-user** app on a free host is therefore not possible without rewriting storage and adding authentication (large, and not done). What can be hosted free is a **read-only demo** of synthetic data (below). Facts are from each vendor's own documentation fetched on 2026-10-24; "not stated" means the page did not say.

| Host | Verified | Consequence |
|---|---|---|
| Render, free web service | 750 instance hours a month; spins down after 15 minutes idle (about a minute to wake); **no persistent disk** (local changes are lost on restart or redeploy); free Postgres expires after 30 days; without a payment method an exhausted free service is suspended, not billed. Whether sign-up needs a card: not stated (community posts mention an occasional $1 verification). | Runs this Node server. Fine for the read-only demo; the cold start is slow. |
| Vercel Hobby | Free, non-commercial use only; usage limits then a 30-day wait; storage listed is Blob only. Card for Hobby: not stated. | Serverless: the native SQLite module and the writable index are untested risks. |
| Netlify Free | 300 credits a month, a hard limit; at zero all projects are paused, not charged; a production deploy costs 15 credits. | Serverless, same risks as Vercel. |
| Hugging Face Spaces | Docker Spaces "require a paid plan to create"; only static Spaces are free; disk is ephemeral. | Not usable for this server. |
| Koyeb | One free service (512 MB, 0.1 vCPU), but a **card is required** (a $29 hold that is cancelled). | Excluded by a no-card rule. |
| Cloudflare Workers | Free: 100,000 requests a day, 10 ms CPU per request. | Cannot run this app's server code or its SQLite module. |
| Fly.io, Railway, Oracle Always Free, Neon | Vendor pages could not be fetched; secondary sources say Oracle requires a card. | Not assessed. |

Nothing has been created, published or deployed, and none of these hosts has been tested with this app.

## The read-only public demo

`EVIDENCEGRAPH_DEMO=1` (set by `pnpm start:demo`) changes the server as follows:

- **Allow-list in middleware** ([demo-policy.ts](../../apps/web/src/lib/demo-policy.ts)): only reads of pages, sources, contradictions, research history and the schema, `GET /api/health`, and `POST /api/query` are allowed. Everything else under `/api` returns 403, including ingest, edits, deletes, settings, API-key calls, workspace changes, chats, lint, onboarding and the wiki export. A test reads every route in the source tree and checks this list, so a new endpoint is closed by default.
- **Screens replaced by a notice:** Settings, Dashboard (it shows server paths), Chats and Local models.
- **Questions** are answered in-process by the deterministic mock (it quotes the best-matching passage; it is not a language model). They are not written to the research history, and no API key is read.
- **Rate limits** per visitor per minute: 8 questions, 120 other API calls, 240 page loads (HTTP 429 with `Retry-After`). In memory, per instance.
- **Banner** on every page saying it is a read-only demo of synthetic data with a stand-in, not a model.
- **Health check:** `GET /api/health` returns `{ "ok": true, "mode": "demo" }`; it opens no database.
- **Security headers** on every response (`X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`); no `X-Powered-By`. There is no Content-Security-Policy yet.

Build and run: `pnpm install --frozen-lockfile && pnpm build && pnpm demo:seed`, then `pnpm start:demo` (set `PORT`, and `EVIDENCEGRAPH_DEMO_HOST=0.0.0.0` if a host's proxy sits in front). The build and the start must happen on the same machine: the standalone bundle links to that machine's `node_modules`.

**Data, backup, restore.** The demo's data is synthetic and regenerated by `pnpm demo:seed`, so there is nothing to back up; restoring is running it again. The folder must be **writable** while the server runs (the search index is a SQLite file next to the wiki); anything written there is lost on restart on a free host, which is fine because visitors cannot write anything that matters. `pnpm demo:seed` and `pnpm demo` only delete a folder that carries the `.evidencegraph-demo` marker (or the default `evidencegraph-demo` folder in the OS temp directory), so a mistyped `--dir` cannot wipe a real wiki ([demo-guard.ts](../../packages/eval/src/demo-guard.ts)).

**Not covered.** Real accounts, per-user data, and any write by a visitor. A live deployment has not been verified on any host.

## Decisions that need the owner's approval before anything is published or created

- Which platform or host to use, and any cost (none has been chosen or priced).
- The authentication layer (the two code changes above are already made).
- Anything that publishes code (GitHub), creates a cloud resource, sets a domain, or makes the app reachable by others.
