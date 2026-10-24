# Publishing checklist (not done yet)

Nothing here has been run. No Git repository exists, no remote is configured, and nothing has been pushed. Do these in order, in a separate session, when you decide to publish.

## 0. Before anything else

- [ ] Use **Node 22 LTS** (or 20). Node 23 on Windows cannot build `better-sqlite3` without C++ build tools. The least invasive way to get Node 22 without administrator rights, without uninstalling anything and without touching the system PATH: unzip the official Windows x64 zip of Node 22 into a folder in your user profile and, in each PowerShell window where you work on this project, put that folder first on PATH for that window only (`$env:Path = "<folder>;" + $env:Path`). Then check `node -v` and `where.exe node`. Closing the window undoes it.
- [ ] Optional but recommended: run the live evaluation once with a real model ([how](evaluation.md#live-mode)) so the README can say what a real model did, or keep saying that it has not been measured.
- [ ] Read the evidence layer once (`packages/core/src/evidence.ts`, `passages.ts`, `contradictions.ts`) and the [interview guide](interview-guide.md).

## 1. Rename the folder

The project root is the *inner* `llm-wiki-main` (the ZIP extracted into a folder of the same name). The renamed layout was verified: a copy named `evidencegraph-ai` passed a clean frozen install, typecheck, lint, 308 tests, `eval:check` and the production build. (That check predates two later changes, so the suite has since grown to 322 tests; typecheck, lint, tests, `eval:check` and the build were re-run in place afterwards and passed.)

Close editors and terminals that are inside the folder, then, in PowerShell:

```powershell
cd "C:\Users\Shivam Jani\Downloads\llm-wiki-main"
# node_modules holds absolute-path links, so remove it; pnpm recreates it
Remove-Item -Recurse -Force .\llm-wiki-main\node_modules, .\llm-wiki-main\apps\web\node_modules, .\llm-wiki-main\packages\*\node_modules, .\llm-wiki-main\apps\web\.next -ErrorAction SilentlyContinue
Rename-Item .\llm-wiki-main\llm-wiki-main evidencegraph-ai
Move-Item .\llm-wiki-main\evidencegraph-ai "C:\Users\Shivam Jani\Downloads\evidencegraph-ai"
cd "C:\Users\Shivam Jani\Downloads\evidencegraph-ai"
pnpm install --frozen-lockfile
pnpm typecheck; pnpm lint; pnpm test; pnpm eval:check
```

Nothing is lost by this: user wikis live elsewhere (`~/llm-wiki-default`, or the folders you chose), the global config is in `~/.llm-wiki/`, `LICENSE` and `NOTICE.md` move with the folder, and the old outer folder can be deleted afterwards.

## 2. Final local review

- [ ] `git`-free scan for secrets: search the folder for `sk-or-`, `OPENROUTER_API_KEY=` followed by a value, and any `.env*` file other than `.env.example`.
- [ ] `LICENSE` still has both copyright lines; `NOTICE.md` is accurate.
- [ ] `packages/eval/results/` contains only `latest.*`, `heldout-latest.*`, `first-run.md`, `heldout-first-run.*` (no `live-*` files).
- [ ] README says the project is unpublished until it is.

## 3. Initialize Git locally

```bash
git init -b main
git add -A
git status            # read the list; nothing under node_modules, .next, .env, or results/live-*
git commit -m "EvidenceGraph AI: evidence-first research workspace (derived from LLM Wiki, MIT)"
```

`.gitattributes` forces LF line endings. That matters: the held-out fixtures are hash-pinned and result files are compared byte for byte, so CRLF would break `pnpm test` on a Windows checkout.

## 4. Publish

1. On GitHub, signed in as `Chico2118`, create a **new empty** repository named `evidencegraph-ai` (no README, no license, no .gitignore: they already exist locally). Public or private is your choice.
2. Then:
   ```bash
   git remote add origin https://github.com/Chico2118/evidencegraph-ai.git
   git push -u origin main
   ```
3. Open the **Actions** tab and watch the first CI run. It has never executed. It runs on Node 20 and 22; only Node 22 has been exercised locally, so a Node 20 failure is plausible. Fix what it shows.
4. Settings → Security: enable **private vulnerability reporting** (SECURITY.md says it will be preferred once available).
5. Add a repository description, topics, and a social-preview image (GitHub wants a 1280×640 PNG; `apps/web/public/logo-hero.svg` is the source).

## 5. After publishing

- [x] Change the README status note from "has not been published" to the truth.
- [ ] Add a CI badge only after CI is green.
- [ ] Keep `NOTICE.md` accurate when adding modules.
- [ ] Do not claim users, stars, deployments or benchmark results that do not exist.
