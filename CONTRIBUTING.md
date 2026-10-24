# Contributing

EvidenceGraph AI is a personal portfolio project built on the open-source [LLM Wiki](https://github.com/ddsyasas/llm-wiki) (MIT). It is not accepting large feature work, but fixes and focused improvements are welcome once the repository is public.

## Set up

```bash
# Node.js 20 or 22 LTS is recommended (see Known limitations in the README)
pnpm install
pnpm demo        # runs the app on a synthetic wiki with a mock model, no API key
```

## Before sending a change

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm eval:check   # fails if evaluation results drifted; rerun `pnpm eval` if the change is intended
```

## Conventions (inherited, still enforced)

- TypeScript strict; no `any` without a comment explaining why.
- Named exports only for shared modules; kebab-case file names; PascalCase components.
- Comments explain *why*, not *what*.
- Every model response must be validated (zod) before use.
- No telemetry, no new database, no new framework without discussion.
- Do not commit secrets, wikis, or `.env` files.

## Changing the evidence layer or the evaluation

- A change to `evidence.ts`, `retrieval.ts` or `contradictions.ts` needs unit tests **and** an evaluation re-run. If results move, say why in the pull request.
- Do not tune thresholds against the fixtures and then report the fixture score as accuracy. If you add labels, add them before running the detector, and note anything the labels were adjusted for.
- Fixtures must stay synthetic (or properly licensed); never paste real documents.

## Where things are

See [`docs/evidencegraph/architecture.md`](docs/evidencegraph/architecture.md) and [`NOTICE.md`](NOTICE.md) for what is inherited and what is new.
