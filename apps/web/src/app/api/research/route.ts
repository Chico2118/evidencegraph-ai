import { NextResponse } from "next/server";

import { getResearchRun, listResearchRuns, verifyQueryResponse } from "@evidencegraph/core";

import { openWikiContext } from "@/lib/server-wiki";

export const dynamic = "force-dynamic";

// GET /api/research            → recent runs (summaries only)
// GET /api/research?id=<runId> → one run, with evidence re-verified against
//                                the wiki as it exists right now.
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  const ctx = await openWikiContext();
  try {
    if (!id) {
      const runs = await listResearchRuns(ctx.wikiPath, 50);
      return NextResponse.json({
        ok: true,
        runs: runs.map((r) => ({
          id: r.id,
          question: r.question,
          model: r.model,
          createdAt: r.createdAt,
          confidence: r.response.confidence,
        })),
      });
    }
    const run = await getResearchRun(ctx.wikiPath, id);
    if (!run) return NextResponse.json({ ok: false, error: "run not found" }, { status: 404 });
    const evidence = await verifyQueryResponse({
      wikiPath: ctx.wikiPath,
      db: ctx.db,
      response: run.response,
    });
    return NextResponse.json({
      ok: true,
      model: run.model,
      question: run.question,
      createdAt: run.createdAt,
      response: run.response,
      evidence,
      runId: run.id,
    });
  } finally {
    ctx.db.close();
  }
}
