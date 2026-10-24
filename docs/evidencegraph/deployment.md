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
| `OPENROUTER_API_KEY` | **Not read by the app**; `pnpm eval --live` only |

## Decisions that need the owner's approval before anything is published or created

- Which platform or host to use, and any cost (none has been chosen or priced).
- The authentication layer (the two code changes above are already made).
- Anything that publishes code (GitHub), creates a cloud resource, sets a domain, or makes the app reachable by others.
