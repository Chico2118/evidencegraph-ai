import { extractHtml } from "./html";
import { formatBytes, InputTooLargeError, MAX_URL_BODY_BYTES } from "./limits";
import type { ExtractedTextSource } from "./types";
import { assertPublicUrl, isUrlError, urlError, type GuardOptions } from "./url-guard";

const USER_AGENT =
  "Mozilla/5.0 (compatible; EvidenceGraph-AI/0.1; +https://github.com/Chico2118/evidencegraph-ai)";

const MAX_REDIRECTS = 5;

export type FetchUrlOptions = GuardOptions & {
  /** Override the default timeout (ms). */
  timeoutMs?: number;
};

/**
 * Fetches a URL and runs the response body through the HTML extractor.
 *
 * - Follows up to 5 redirects by hand, so every hop is checked like the first request: a public
 *   page cannot bounce the server to a private address (see url-guard.ts, and its opt-out).
 * - Aborts after a configurable timeout so a slow site can't hang the route.
 * - Throws a typed Error with a `code` property on transport failures so the
 *   route can surface a clean message to the user.
 */
export async function fetchAndExtractUrl(
  url: string,
  opts: FetchUrlOptions = {},
): Promise<ExtractedTextSource> {
  // Only plain web URLs. (fetch would reject file: and similar anyway; failing
  // here gives a clear message and keeps the rule explicit.)
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw urlError("INVALID_URL", "that is not a valid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw urlError("INVALID_URL", "only http and https URLs can be fetched");
  }

  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetchFollowingRedirects(parsed, opts, controller.signal);
  } catch (err) {
    // Our own typed errors (blocked address, too many redirects, ...) pass through unchanged.
    if (isUrlError(err)) throw err;
    throw urlError("FETCH_FAILED", `could not fetch ${url}: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const e = new Error(`URL returned HTTP ${response.status}`);
    (e as Error & { code?: string }).code = "HTTP_ERROR";
    throw e;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("html") && !contentType.includes("xml") && !contentType.includes("text/plain")) {
    const e = new Error(`unsupported content-type for URL fetch: ${contentType || "(none)"}`);
    (e as Error & { code?: string }).code = "UNSUPPORTED_CONTENT_TYPE";
    throw e;
  }

  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_URL_BODY_BYTES) throw new InputTooLargeError("the page", formatBytes(MAX_URL_BODY_BYTES));
  const buf = Buffer.from(await response.arrayBuffer());
  // content-length can be absent or wrong, so check what actually arrived too.
  if (buf.length > MAX_URL_BODY_BYTES) throw new InputTooLargeError("the page", formatBytes(MAX_URL_BODY_BYTES));
  return extractHtml(buf, { url, format: "url" });
}

/** GET with manual redirects: the address check runs before the first request and before every hop. */
async function fetchFollowingRedirects(start: URL, guard: GuardOptions, signal: AbortSignal): Promise<Response> {
  let current = start;
  for (let hop = 0; ; hop++) {
    await assertPublicUrl(current, guard);
    const response = await fetch(current.toString(), {
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "manual",
      signal,
    });

    const location = response.headers.get("location");
    if (response.status < 300 || response.status >= 400 || !location) return response;

    // A redirect: free its connection, then validate the target before following it.
    void response.body?.cancel().catch(() => undefined);
    if (hop >= MAX_REDIRECTS) throw urlError("TOO_MANY_REDIRECTS", "the page redirected too many times");
    let next: URL;
    try {
      next = new URL(location, current);
    } catch {
      throw urlError("FETCH_FAILED", "the page redirected to an address that is not a valid URL");
    }
    if (next.protocol !== "http:" && next.protocol !== "https:") {
      throw urlError("INVALID_URL", "the page redirected to something other than an http or https address");
    }
    current = next;
  }
}
