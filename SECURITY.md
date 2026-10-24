# Security Policy

EvidenceGraph AI is a local-first application. It runs on the user's machine and sends content only to the model provider the user configured (OpenRouter, or a local Ollama server). The attack surface is small but not zero: it parses uploaded files and fetched web pages, builds file paths from data, and stores an API key.

This is a portfolio/learning project maintained by one person; it is not production software and has no formal support commitments.

## Supported versions

| Version | Status |
|---|---|
| 0.1.x (current) | Best-effort fixes |
| Upstream LLM Wiki 1.x | Not covered here; report to the [upstream project](https://github.com/ddsyasas/llm-wiki) |

## Reporting a vulnerability

Please do not open a public issue for security problems.

- Email **shivam21jani@gmail.com** with a description, reproduction steps and the impact you expect.
- Once the repository is published, GitHub's private vulnerability reporting will be enabled and preferred.

Expect an acknowledgement within about a week; there is no SLA.

## In scope

- API routes under `apps/web/src/app/api/`
- The evidence layer (`packages/core/src/evidence*.ts`, `passages.ts`, `contradictions.ts`, `research-history.ts`) — especially anything that turns model-supplied text into a file path
- Upload, pasted-text and URL ingestion (`packages/ingestion`, `/api/ingest`)
- Handling of API keys (keychain, the file fallback, outbound requests)
- The CLI and the on-disk formats

## Out of scope

- Vulnerabilities in third-party dependencies that are not reachable through this project (report them upstream)
- Outbound calls to the configured model provider — that is the product working as described
- Attacks that need physical or shell access to a machine already running the app
- Denial of service by a user against their own local instance

## Design choices that matter for security

- **Model output is untrusted.** Responses are validated with zod; claims are parsed one by one so a bad entry cannot hide the rest; every citation is checked against real page text.
- **Model-supplied slugs never reach the filesystem unchecked.** They must match `^[a-z0-9-]{1,100}$` in the validator and again in the loader, covered by tests that use `../../etc/passwd`, backslash and embedded-`..` slugs.
- **Imported documents are data.** The query prompt tells the model to ignore instructions inside page text, and the model has no tools, so a hostile document cannot trigger actions; at worst it distorts an answer, which the citation check then exposes.
- **Input limits.** Uploads over 25 MB, pasted text over 2 MB and fetched pages over 10 MB are rejected before processing; only `http`/`https` URLs are fetched; stored file extensions are allowlisted.
- **No filesystem paths in API responses** for the library and source pages.
- **Keys stay server-side**, in the OS keychain when available, otherwise a `chmod 600` file at `~/.llm-wiki/config.json` (the folder name is kept from the upstream project so existing keys keep working). The evaluation lab reads `OPENROUTER_API_KEY` from the environment only and never prints it.
- **No authentication.** The server binds to localhost by default. Do not expose the port without adding your own authentication layer.
- **URL ingestion refuses private and local addresses by default** (loopback, private ranges, link-local including the cloud metadata address, carrier-grade NAT, multicast and reserved ranges, and their IPv6 equivalents). The name is resolved and every address must be public; up to 5 redirects are followed by hand and each hop is checked again. Set `EVIDENCEGRAPH_ALLOW_PRIVATE_URLS=1` to ingest pages from your own machine or network. **Remaining gap:** a hostile DNS server could answer differently when the connection is actually made (DNS rebinding); closing that needs a custom connector, which would add a dependency.
- **Read-only public demo mode** (`EVIDENCEGRAPH_DEMO=1`, see README). Middleware refuses, on the request, every API call that is not on a short allow-list (reading pages, sources, contradictions and research history, and asking a question), so a newly added endpoint is closed by default; `apps/web/src/lib/demo-policy.test.ts` checks the allow-list against every route in the source tree. Settings, workspaces, chats, key management and export are refused; questions are answered by an in-process mock, never a model, and are not saved. Rate limits are in memory per server instance (they reset on restart and are not shared), and the client address comes from `X-Forwarded-For`, so they are only as reliable as the host's proxy. This mode has no login because it holds nothing private and writes nothing a visitor can keep; it is not a substitute for authentication on a real workspace.
- **The API key can come from the environment.** If `EVIDENCEGRAPH_OPENROUTER_API_KEY` is set, the app uses it, never writes it to the keychain or `config.json`, and refuses to save or remove a key from Settings (HTTP 409). Use this on a server with no keychain. It is a different variable from `OPENROUTER_API_KEY`, which only `pnpm eval --live` reads.
- **HTML ingestion uses `jsdom` + `@mozilla/readability`.** Scripts are not executed, but pages are parsed; jsdom vulnerabilities are inherited until upgraded.
- **No telemetry, analytics or update pings.** (The inherited CLI update check was removed.)
