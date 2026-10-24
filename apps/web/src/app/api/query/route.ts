import { NextResponse } from "next/server";

import { appendResearchRun, getApiKey, queryWiki, verifyQueryResponse } from "@evidencegraph/core";
import { createClient, ContextLengthError, RateLimitError, UnknownModelError } from "@evidencegraph/llm";

import { createDemoClient, DEMO_MODEL } from "@/lib/demo-client";
import { isDemoMode } from "@/lib/demo-policy";
import { openWikiContext } from "@/lib/server-wiki";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type QueryBody = {
  question?: string;
  model?: string;
};

export async function POST(req: Request) {
  let body: QueryBody;
  try {
    body = (await req.json()) as QueryBody;
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  if (typeof body.question !== "string" || body.question.trim().length === 0) {
    return NextResponse.json({ error: "question must be a non-empty string" }, { status: 400 });
  }

  // Public demo: answered in-process by the deterministic mock. No key lookup, no network, nothing saved.
  const demo = isDemoMode();
  const { key } = demo ? { key: null } : await getApiKey();
  const ctx = await openWikiContext();
  const provider = ctx.settings.defaultModels.query.provider;
  if (!demo && provider === "openrouter" && !key) {
    return NextResponse.json(
      { error: "OpenRouter API key not configured. Set one in Settings." },
      { status: 400 },
    );
  }
  const client = demo ? createDemoClient() : createClient(key || "", provider);
  // A visitor cannot pick the model in the demo: only the mock exists.
  const model = demo ? DEMO_MODEL : (body.model ?? ctx.settings.defaultModels.query.model);

  try {
    const response = await queryWiki({
      question: body.question,
      wikiPath: ctx.wikiPath,
      db: ctx.db,
      client,
      model,
    });
    // Citation integrity is checked server-side against the real wiki, so the
    // UI never has to trust the model's own claims about its sources.
    const evidence = await verifyQueryResponse({ wikiPath: ctx.wikiPath, db: ctx.db, response });
    let runId: string | null = null;
    // Demo: visitors share one wiki, so their questions are never written to it.
    if (!demo) {
      try {
        runId = (await appendResearchRun(ctx.wikiPath, { question: body.question, model, response })).id;
      } catch {
        // History is a convenience; never fail an answered question because it could not be saved.
      }
    }
    return NextResponse.json({ ok: true, model, response, evidence, runId });
  } catch (err) {
    const status =
      err instanceof ContextLengthError || err instanceof UnknownModelError
        ? 400
        : err instanceof RateLimitError
          ? 429
          : 500;
    return NextResponse.json(
      {
        ok: false,
        error: (err as Error).message ?? "query failed",
        type: (err as Error).name ?? "Error",
      },
      { status },
    );
  } finally {
    ctx.db.close();
  }
}
