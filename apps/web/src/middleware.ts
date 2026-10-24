import { NextResponse, type NextRequest } from "next/server";

import { clientKey, decideDemoRequest, FixedWindowLimiter, isDemoMode } from "./lib/demo-policy";

// Only does anything when EVIDENCEGRAPH_DEMO=1 (the read-only public demo). In normal local use it passes
// every request straight through. The rules live in lib/demo-policy.ts.
const limiter = new FixedWindowLimiter();

export function middleware(req: NextRequest) {
  if (!isDemoMode()) return NextResponse.next();

  const decision = decideDemoRequest({
    method: req.method,
    pathname: req.nextUrl.pathname,
    client: clientKey(req.headers),
    now: Date.now(),
    limiter,
  });

  switch (decision.action) {
    case "allow":
      return NextResponse.next();
    case "rewrite": {
      const url = req.nextUrl.clone();
      url.pathname = decision.to;
      url.search = "";
      return NextResponse.rewrite(url);
    }
    case "rate-limited":
      return NextResponse.json(
        { ok: false, error: "Too many requests. Please slow down and try again shortly." },
        { status: 429, headers: { "retry-after": String(decision.retryAfterSeconds) } },
      );
    case "deny":
      return NextResponse.json({ ok: false, error: decision.message }, { status: decision.status });
  }
}

export const config = {
  // Everything except Next's static assets and files in /public.
  matcher: ["/((?!_next/static|_next/image|favicon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|woff2?)$).*)"],
};
