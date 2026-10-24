// Read-only public demo mode (EVIDENCEGRAPH_DEMO=1): the single place that decides what a visitor may do.
//
// Why a policy and not just hidden buttons: every endpoint in this app is unauthenticated and most of them
// write to the server's one shared wiki. In demo mode the decision is made in middleware, on the request,
// from an ALLOW-LIST: a route that is not listed here is refused, so a route added later is closed by
// default. Pure functions only (no Node APIs) so it also runs in the Edge middleware runtime and in tests.

export const DEMO_ENV = "EVIDENCEGRAPH_DEMO";

export function isDemoMode(env: Record<string, string | undefined> = process.env): boolean {
  return env[DEMO_ENV] === "1";
}

export const DEMO_DENY_MESSAGE =
  "This is a read-only public demo. Saving, editing, importing, settings and model configuration are turned off.";

/** The only API calls a visitor can make. Everything else under /api is refused in demo mode. */
const ALLOWED_API: ReadonlyArray<{ methods: readonly string[]; pattern: RegExp }> = [
  { methods: ["GET"], pattern: /^\/api\/health$/ },
  { methods: ["GET"], pattern: /^\/api\/index$/ },
  { methods: ["GET"], pattern: /^\/api\/pages$/ },
  { methods: ["GET"], pattern: /^\/api\/pages\/[^/]+$/ },
  { methods: ["GET"], pattern: /^\/api\/pages\/[^/]+\/backlinks$/ },
  { methods: ["GET"], pattern: /^\/api\/sources$/ },
  { methods: ["GET"], pattern: /^\/api\/sources\/[^/]+$/ },
  { methods: ["GET"], pattern: /^\/api\/contradictions$/ },
  { methods: ["GET"], pattern: /^\/api\/research$/ },
  { methods: ["GET"], pattern: /^\/api\/lint\/history$/ },
  { methods: ["GET"], pattern: /^\/api\/schema$/ },
  // Read-only, and redacted in demo mode (no server path). The Research screen loads it for its cost hint.
  { methods: ["GET"], pattern: /^\/api\/settings$/ },
  // Answered by the built-in mock, never by a real model, and never saved (see api/query/route.ts).
  { methods: ["POST"], pattern: /^\/api\/query$/ },
];

/** Screens that expose server paths or configuration, or only make sense with writes. */
const BLOCKED_PAGES = ["/settings", "/dashboard", "/local-models", "/chats"] as const;

export const DEMO_NOTICE_PAGE = "/demo-disabled";

export type Decision =
  | { action: "allow" }
  | { action: "deny"; status: 403 | 405; message: string }
  | { action: "rewrite"; to: string }
  | { action: "rate-limited"; retryAfterSeconds: number };

export function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export function isBlockedPage(pathname: string): boolean {
  return BLOCKED_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isAllowedApi(method: string, pathname: string): boolean {
  return ALLOWED_API.some((rule) => rule.methods.includes(method) && rule.pattern.test(pathname));
}

// ---- rate limiting ---------------------------------------------------------------------------------------

export type RateLimit = { limit: number; windowMs: number };

/** Per client and minute. Questions cost the most (retrieval plus verification), so they get the tightest cap. */
export const DEMO_LIMITS = {
  query: { limit: 8, windowMs: 60_000 },
  api: { limit: 120, windowMs: 60_000 },
  page: { limit: 240, windowMs: 60_000 },
} as const satisfies Record<string, RateLimit>;

/** Best-effort, in memory, per server instance: it resets on restart and is not shared between instances. */
export class FixedWindowLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(private readonly maxKeys = 5000) {}

  /** Records one hit. `retryAfterSeconds` is 0 when allowed. */
  hit(key: string, rule: RateLimit, now: number): { allowed: boolean; retryAfterSeconds: number } {
    let w = this.windows.get(key);
    if (!w || now - w.start >= rule.windowMs) {
      if (this.windows.size >= this.maxKeys) this.evictExpired(now, rule.windowMs);
      w = { start: now, count: 0 };
      this.windows.set(key, w);
    }
    w.count++;
    if (w.count <= rule.limit) return { allowed: true, retryAfterSeconds: 0 };
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((w.start + rule.windowMs - now) / 1000)) };
  }

  /** Drops finished windows; if the table is still full, clears it so memory cannot grow without bound. */
  private evictExpired(now: number, windowMs: number): void {
    for (const [k, w] of this.windows) if (now - w.start >= windowMs) this.windows.delete(k);
    if (this.windows.size >= this.maxKeys) this.windows.clear();
  }
}

/** First address in X-Forwarded-For (set by the host's proxy), else X-Real-IP, else one shared bucket. */
export function clientKey(headers: { get(name: string): string | null }): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}

// ---- the decision ------------------------------------------------------------------------------------------

export function decideDemoRequest(args: {
  method: string;
  pathname: string;
  client: string;
  now: number;
  limiter: FixedWindowLimiter;
}): Decision {
  const { method, pathname, client, now, limiter } = args;
  const m = method.toUpperCase();

  if (isApiPath(pathname)) {
    if (!isAllowedApi(m, pathname)) {
      // 405 for a known-read endpoint called with a write verb is still a refusal; one status keeps it simple.
      return { action: "deny", status: 403, message: DEMO_DENY_MESSAGE };
    }
    if (pathname === "/api/health") return { action: "allow" }; // uptime checks must never be throttled
    const isQuery = pathname === "/api/query";
    const rule = isQuery ? DEMO_LIMITS.query : DEMO_LIMITS.api;
    const r = limiter.hit(`${isQuery ? "q" : "a"}:${client}`, rule, now);
    return r.allowed ? { action: "allow" } : { action: "rate-limited", retryAfterSeconds: r.retryAfterSeconds };
  }

  // Pages: reading only. Anything that is not a plain GET/HEAD is refused.
  if (m !== "GET" && m !== "HEAD") return { action: "deny", status: 405, message: DEMO_DENY_MESSAGE };
  if (isBlockedPage(pathname)) return { action: "rewrite", to: DEMO_NOTICE_PAGE };
  const r = limiter.hit(`p:${client}`, DEMO_LIMITS.page, now);
  return r.allowed ? { action: "allow" } : { action: "rate-limited", retryAfterSeconds: r.retryAfterSeconds };
}
