import { NextResponse } from "next/server";

import { REVIEW_STATUSES, saveReview, scanWikiForContradictions, type ReviewStatus } from "@evidencegraph/core";

import { openWikiContext } from "@/lib/server-wiki";

export const dynamic = "force-dynamic";

// GET  /api/contradictions → deterministic scan of the active wiki (no model call)
// POST /api/contradictions → { id, status, note? } saves a human review decision
export async function GET() {
  const ctx = await openWikiContext();
  try {
    const scan = await scanWikiForContradictions(ctx.wikiPath, ctx.db);
    return NextResponse.json({ ok: true, ...scan });
  } finally {
    ctx.db.close();
  }
}

export async function POST(req: Request) {
  let body: { id?: unknown; status?: unknown; note?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "expected JSON body" }, { status: 400 });
  }
  if (typeof body.id !== "string" || !/^[a-f0-9]{16}$/.test(body.id)) {
    return NextResponse.json({ ok: false, error: "invalid candidate id" }, { status: 400 });
  }
  if (typeof body.status !== "string" || !REVIEW_STATUSES.includes(body.status as ReviewStatus)) {
    return NextResponse.json({ ok: false, error: "invalid review status" }, { status: 400 });
  }
  const note = typeof body.note === "string" ? body.note : undefined;

  const ctx = await openWikiContext();
  try {
    const review = await saveReview(ctx.wikiPath, body.id, {
      status: body.status as ReviewStatus,
      ...(note !== undefined ? { note } : {}),
    });
    return NextResponse.json({ ok: true, review });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 400 });
  } finally {
    ctx.db.close();
  }
}
