import { NextResponse } from "next/server";

import { isDemoMode } from "../../../lib/demo-policy";

export const dynamic = "force-dynamic";

// GET /api/health — for a host's uptime check. Deliberately shallow: it answers if the server is up and
// reports the mode. It opens no database and reads no wiki, so it cannot be slowed down or used to probe data.
export function GET() {
  return NextResponse.json({ ok: true, mode: isDemoMode() ? "demo" : "normal" });
}
