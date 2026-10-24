// Support for the LIVE evaluation only: make a rate-limited or out-of-credit run
// stop fast, spend nothing more, and say what the provider told us.
//
// Why this exists: a 429 used to be turned into a fixed message ("rate limited
// by OpenRouter") that threw away the status, headers and body, and the run kept
// retrying (the OpenAI SDK retries by itself, then callLLM retries again, so one
// question could send up to nine requests). None of that is changed for the app;
// it applies only to the client the live runner creates.

import { LlmError, createClient, headerValue, type LlmClient } from "@evidencegraph/llm";

/** Removes the configured key and anything key-shaped from a message, then truncates it. */
export function redactSecrets(message: string, key: string): string {
  let out = message;
  if (key.length >= 8) out = out.split(key).join("[redacted]");
  out = out.replace(/sk-[A-Za-z0-9_-]{6,}/g, "[redacted]");
  return out.slice(0, 300);
}

/**
 * Non-secret facts about an HTTP error from the provider. Deliberately an
 * allowlist: status, a few documented header and metadata fields, and a short
 * message. The provider's `raw` payload and every other field are never copied.
 */
export type ProviderErrorDetails = {
  status: number;
  /** Seconds the server asked us to wait (Retry-After), if it sent one. */
  retryAfterSeconds: number | null;
  /**
   * OpenRouter's docs say a 429 from its OWN rate limiter carries X-RateLimit-*
   * headers. True when any is present. This is a hint, not a verdict.
   */
  platformRateLimitHeaders: boolean;
  rateLimitHeaders: { limit: string | null; remaining: string | null; reset: string | null };
  /** error.metadata.error_type, e.g. "rate_limit_exceeded". */
  errorType: string | null;
  /** error.metadata.provider_code: the upstream provider's own code, when available. */
  providerCode: string | null;
  /** error.metadata.provider_name, when the response names one. */
  providerName: string | null;
  message: string | null;
};

function scalar(value: unknown, key: string, max: number): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = redactSecrets(String(value), key).slice(0, max).trim();
  return text.length > 0 ? text : null;
}

/** Reads the SDK error's status, headers and parsed body. Returns null if it is not an HTTP error. */
export function describeProviderError(err: unknown, key: string): ProviderErrorDetails | null {
  if (!err || typeof err !== "object") return null;
  const e = err as { status?: unknown; headers?: unknown; error?: unknown };
  if (typeof e.status !== "number" || !Number.isFinite(e.status)) return null;

  const body = e.error && typeof e.error === "object" ? (e.error as Record<string, unknown>) : {};
  const metadata = body["metadata"] && typeof body["metadata"] === "object" ? (body["metadata"] as Record<string, unknown>) : {};

  const header = (name: string) => scalar(headerValue(e.headers, name), key, 60);
  const rateLimitHeaders = {
    limit: header("x-ratelimit-limit"),
    remaining: header("x-ratelimit-remaining"),
    reset: header("x-ratelimit-reset"),
  };
  const retryRaw = headerValue(e.headers, "retry-after");
  const retrySeconds = retryRaw !== undefined ? Number.parseInt(retryRaw, 10) : Number.NaN;

  return {
    status: e.status,
    retryAfterSeconds: Number.isNaN(retrySeconds) ? null : retrySeconds,
    platformRateLimitHeaders: Object.values(rateLimitHeaders).some((v) => v !== null),
    rateLimitHeaders,
    errorType: scalar(metadata["error_type"], key, 80),
    providerCode: scalar(metadata["provider_code"], key, 80),
    providerName: scalar(metadata["provider_name"], key, 80),
    message: scalar(body["message"], key, 160),
  };
}

export type StopReason = "rate_limited" | "insufficient_credits";

/**
 * Thrown by the guarded client on the first 429 or 402. It is an LlmError, which
 * the shared retry loop passes through untouched, and every later call fails with
 * the same error WITHOUT sending a request.
 */
export class StopRunError extends LlmError {
  readonly reason: StopReason;
  readonly details: ProviderErrorDetails;
  constructor(reason: StopReason, details: ProviderErrorDetails) {
    super(
      reason === "rate_limited"
        ? "rate limited by OpenRouter (HTTP 429); the run stopped after the first such response"
        : "OpenRouter reports insufficient credits (HTTP 402); the run stopped after the first such response",
    );
    this.name = reason === "rate_limited" ? "RateLimitError" : "InsufficientCreditsError";
    this.reason = reason;
    this.details = details;
  }
}

export type GuardedClient = {
  client: LlmClient;
  /**
   * requests: HTTP requests actually sent. lastError: non-secret details of the most
   * recent HTTP error. Read it because the shared client maps provider errors to
   * generic ones that no longer carry the status, headers or body.
   */
  stats: { requests: number; lastError: ProviderErrorDetails | null };
};

/**
 * Wraps a client so that the first 429/402 stops the run: that error is turned
 * into a StopRunError carrying non-secret details, and any further call rejects
 * immediately without touching the network. Also counts requests sent.
 */
export function guardClient(inner: LlmClient, key: string): GuardedClient {
  const stats: GuardedClient["stats"] = { requests: 0, lastError: null };
  let tripped: StopRunError | null = null;

  const guardedCreate = async (...args: unknown[]): Promise<unknown> => {
    if (tripped) throw tripped;
    stats.requests++;
    try {
      const create = inner.chat.completions.create as unknown as (...a: unknown[]) => Promise<unknown>;
      return await create.apply(inner.chat.completions, args);
    } catch (err) {
      const details = describeProviderError(err, key);
      if (details) stats.lastError = details;
      if (details && (details.status === 429 || details.status === 402)) {
        tripped = new StopRunError(details.status === 429 ? "rate_limited" : "insufficient_credits", details);
        throw tripped;
      }
      throw err;
    }
  };

  // Proxies keep every other property working (baseURL, private fields on the real
  // client) by always binding methods to the real object.
  const wrap = <T extends object>(target: T, overrides: Record<string, unknown>): T =>
    new Proxy(target, {
      get(t, prop) {
        if (typeof prop === "string" && prop in overrides) return overrides[prop];
        const value = Reflect.get(t, prop, t);
        return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(t) : value;
      },
    });

  const completions = wrap(inner.chat.completions, { create: guardedCreate });
  const chat = wrap(inner.chat, { completions });
  return { client: wrap(inner, { chat }), stats };
}

/**
 * The client the live runner uses. Same as the app's, but with the SDK's own
 * automatic retries switched off so the number of requests is exactly the number
 * the runner decides to send. (The app's client keeps its default of 2.)
 */
export function createLiveClient(key: string, provider: "openrouter" | "ollama"): LlmClient {
  const client = createClient(key, provider);
  client.maxRetries = 0;
  return client;
}
