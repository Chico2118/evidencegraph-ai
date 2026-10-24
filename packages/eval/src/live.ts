// Live-model suite. Runs the real production pipeline (retrieval -> prompt ->
// model -> verification) on the same fixture questions as the deterministic
// suite. It calls a model, so it is opt-in, can cost money, and its numbers
// depend on the model and the day. It is never part of `pnpm test`.
//
// Credentials: OpenRouter key from the OPENROUTER_API_KEY environment
// variable only (never read from disk, never printed). For a local model use
// `--provider ollama` (OLLAMA_BASE_URL optional).

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openInMemoryDb, queryWiki, verifyQueryResponse, type EvidenceReport } from "@evidencegraph/core";
import { AuthenticationError, type LlmClient } from "@evidencegraph/llm";

import { loadFixtures, type EvalQuestion } from "./fixtures";
import { ratio, type Metric } from "./metrics";
import {
  createLiveClient,
  guardClient,
  redactSecrets,
  StopRunError,
  type ProviderErrorDetails,
  type StopReason,
} from "./provider-errors";
import { seedWikiFromFixtures } from "./seed";

export { redactSecrets };

export type LiveOptions = {
  provider: "openrouter" | "ollama";
  model: string;
  limit?: number | undefined;
  /** True when the "model" is the offline mock: marks the report as a plumbing check. */
  mock?: boolean | undefined;
  /** For tests: use this client instead of creating one. */
  client?: LlmClient | undefined;
};

type LiveRow = {
  id: string;
  answerable: boolean;
  error: string | null;
  /** Redacted, truncated message for a failed run. */
  errorMessage: string | null;
  /** Non-secret facts from the provider's HTTP error (status, rate-limit headers, ...), when there was one. */
  errorDetails: ProviderErrorDetails | null;
  modelConfidence: string | null;
  claimStates: string[];
  issueCodes: string[];
  verdict: EvidenceReport["verdict"] | null;
  claims: number;
  validCitations: number;
  countedCitations: number;
  correctCitations: number;
  unsupportedClaims: number;
};

export type LiveReport = {
  schemaVersion: 1;
  /** True for the offline mock. Such a report verifies the runner, NOT any model. */
  mock: boolean;
  provider: string;
  model: string;
  ranAt: string;
  /** Questions selected for the run; `rows` is shorter when the run stopped early. */
  questions: number;
  /** HTTP requests actually sent to the provider. */
  requestsSent: number;
  /** Set when the first 429 or 402 ended the run: no further questions were attempted. */
  stoppedEarly: { reason: StopReason; afterQuestion: string; questionsNotRun: number } | null;
  rows: LiveRow[];
  metrics: {
    citationResolutionRate: Metric;
    citationCorrectnessVsGold: Metric;
    unsupportedClaimRate: Metric;
    abstentionOnUnanswerable: Metric;
    answeredAnywayOnUnanswerable: Metric;
    falseAbstentionOnAnswerable: Metric;
    failedRuns: Metric;
  };
  notes: string[];
};

/**
 * Picks the questions to run. With a limit, the sample is balanced instead of
 * "the first N": the fixture lists every answerable question before any
 * unanswerable one, so a plain slice(0, 5) would never test missing evidence.
 * About a quarter of the sample (at least one, when N >= 2) is unanswerable;
 * original order is kept.
 */
export function selectQuestions(all: EvalQuestion[], limit: number | undefined): EvalQuestion[] {
  if (limit === undefined) return all;
  if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit must be a positive integer");
  if (limit >= all.length) return all;
  const answerable = all.filter((q) => q.answerable);
  const unanswerable = all.filter((q) => !q.answerable);
  const nUnanswerable = limit >= 2 ? Math.min(unanswerable.length, Math.max(1, Math.round(limit / 4))) : 0;
  const nAnswerable = limit - nUnanswerable;
  const chosen = new Set([...answerable.slice(0, nAnswerable), ...unanswerable.slice(0, nUnanswerable)].map((q) => q.id));
  return all.filter((q) => chosen.has(q.id));
}

export async function runLiveEval(opts: LiveOptions): Promise<LiveReport> {
  const key = process.env["OPENROUTER_API_KEY"] ?? "";
  if (opts.provider === "openrouter" && !key) {
    throw new Error("OPENROUTER_API_KEY is not set. Export it for this shell, or use --provider ollama.");
  }
  // Guarded: the first 429/402 ends the run, and the live client has the SDK's hidden retries off,
  // so the request count is exactly what the runner decided to send.
  const guarded = guardClient(opts.client ?? createLiveClient(key, opts.provider), key);
  const client = guarded.client;
  const fixtures = loadFixtures();
  const wikiPath = await mkdtemp(join(tmpdir(), "evidencegraph-live-eval-"));
  const db = openInMemoryDb();

  try {
    await seedWikiFromFixtures(wikiPath, db, fixtures);

    const questions = selectQuestions(fixtures.questions, opts.limit);
    const rows: LiveRow[] = [];
    let stoppedEarly: LiveReport["stoppedEarly"] = null;
    for (const q of questions) {
      const goldFor = (page: string) => q.gold.find((g) => g.page === page);
      guarded.stats.lastError = null;
      try {
        const response = await queryWiki({ question: q.question, wikiPath, db, client, model: opts.model });
        const report = await verifyQueryResponse({ wikiPath, db, response });
        const counted = report.claims.flatMap((c) => c.citations.filter((x) => !x.isDuplicate));
        const valid = counted.filter((c) => c.integrity === "valid");
        const correct = valid.filter((c) => {
          const g = goldFor(c.ref.page);
          if (!g) return false;
          const passage = c.resolved?.passageId ?? null;
          return passage === null || g.passages.includes(passage);
        });
        rows.push({
          id: q.id, answerable: q.answerable, error: null, errorMessage: null, errorDetails: null, modelConfidence: response.confidence,
          claimStates: report.claims.map((c) => c.evidenceState),
          issueCodes: [...new Set(report.claims.flatMap((c) => c.citations.flatMap((x) => x.issues.map((i) => i.code))))],
          verdict: report.verdict, claims: report.claims.length,
          validCitations: valid.length, countedCitations: counted.length, correctCitations: correct.length,
          unsupportedClaims: report.claims.filter((c) => c.evidenceState !== "all_citations_valid").length,
        });
      } catch (err) {
        // A rejected key will not fix itself on the next question: stop now, say so, spend nothing more.
        if (err instanceof AuthenticationError) {
          throw new Error(`Authentication failed (HTTP ${err.status}): check OPENROUTER_API_KEY. No further requests were made.`);
        }
        rows.push({
          id: q.id, answerable: q.answerable, error: (err as Error).name || "Error",
          errorMessage: redactSecrets((err as Error).message ?? "", key),
          errorDetails: err instanceof StopRunError ? err.details : guarded.stats.lastError,
          modelConfidence: null, claimStates: [], issueCodes: [],
          verdict: null, claims: 0,
          validCitations: 0, countedCitations: 0, correctCitations: 0, unsupportedClaims: 0,
        });
        // Rate limit or no credits: the next question would hit the same wall. Stop and say so.
        if (err instanceof StopRunError) {
          stoppedEarly = { reason: err.reason, afterQuestion: q.id, questionsNotRun: questions.length - rows.length };
          break;
        }
      }
    }

    const ok = rows.filter((r) => r.error === null);
    const answerable = ok.filter((r) => r.answerable);
    const unanswerable = ok.filter((r) => !r.answerable);
    const sum = (rs: LiveRow[], f: (r: LiveRow) => number) => rs.reduce((n, r) => n + f(r), 0);

    return {
      schemaVersion: 1,
      mock: opts.mock ?? false,
      provider: opts.provider,
      model: opts.model,
      ranAt: new Date().toISOString(),
      questions: questions.length,
      requestsSent: guarded.stats.requests,
      stoppedEarly,
      rows,
      metrics: {
        citationResolutionRate: ratio(sum(answerable, (r) => r.validCitations), sum(answerable, (r) => r.countedCitations)),
        citationCorrectnessVsGold: ratio(sum(answerable, (r) => r.correctCitations), sum(answerable, (r) => r.validCitations)),
        unsupportedClaimRate: ratio(sum(answerable, (r) => r.unsupportedClaims), sum(answerable, (r) => r.claims)),
        abstentionOnUnanswerable: ratio(unanswerable.filter((r) => r.verdict === "no_claims").length, unanswerable.length),
        answeredAnywayOnUnanswerable: ratio(unanswerable.filter((r) => r.claims > 0).length, unanswerable.length),
        falseAbstentionOnAnswerable: ratio(answerable.filter((r) => r.verdict === "no_claims").length, answerable.length),
        failedRuns: ratio(rows.length - ok.length, rows.length),
      },
      notes: [
        "Unsupported-claim rate here is an integrity proxy: claims whose citations do not all resolve. True semantic support needs human judgment and is not computed.",
        "Citation correctness compares resolved citations with hand-written gold passages; a correct answer may legitimately cite a passage the gold list omits.",
        "One run per question at the provider's default temperature: expect run-to-run variation.",
      ],
    };
  } finally {
    db.close();
    await rm(wikiPath, { recursive: true, force: true });
  }
}

function cell(m: Metric): string {
  return m.value === null ? "n/a" : `${(m.value * 100).toFixed(1)}% (${m.numerator}/${m.denominator})`;
}

function describeDetails(d: ProviderErrorDetails): string[] {
  const lines = [`- HTTP status: ${d.status}`];
  if (d.retryAfterSeconds !== null) lines.push(`- Retry-After: ${d.retryAfterSeconds} s`);
  const h = d.rateLimitHeaders;
  if (d.platformRateLimitHeaders) {
    lines.push(`- X-RateLimit headers: limit ${h.limit ?? "?"}, remaining ${h.remaining ?? "?"}, reset ${h.reset ?? "?"}`);
  }
  if (d.errorType) lines.push(`- Error type: ${d.errorType}`);
  if (d.providerName) lines.push(`- Provider named in the response: ${d.providerName}`);
  if (d.providerCode) lines.push(`- Provider code: ${d.providerCode}`);
  if (d.message) lines.push(`- Message: ${d.message}`);
  return lines;
}

/** What the stop means, hedged: the response headers are a hint about who limited the request, not proof. */
function stoppedSection(r: LiveReport): string[] {
  const s = r.stoppedEarly;
  if (!s) return [];
  const details = r.rows.find((row) => row.id === s.afterQuestion)?.errorDetails ?? null;
  const total = r.questions;
  if (s.reason === "insufficient_credits") {
    return [
      "## Run stopped early: insufficient credits",
      "",
      `The run stopped after the first insufficient-credits response (HTTP 402) on ${s.afterQuestion}. ${s.questionsNotRun} of ${total} questions were not run. ${r.requestsSent} request(s) were sent in total and none were retried.`,
      "",
      ...(details ? describeDetails(details) : []),
      "",
      "OpenRouter's documentation says a negative balance can cause this even for free models. Check the account's credit balance; nothing here can tell which applies.",
      "",
    ];
  }
  const hint = details?.platformRateLimitHeaders
    ? "The response carried X-RateLimit headers, which OpenRouter documents for its own limiter, so this looks like OpenRouter's own limit rather than the model's upstream provider. That is a hint from the headers, not proof."
    : "The response carried no X-RateLimit headers. OpenRouter's documentation says that can mean the upstream provider rate-limited the request (free models are served with shared capacity). That is a hint from the missing headers, not proof.";
  return [
    "## Run stopped early: rate limited",
    "",
    `The run stopped after the first rate-limit response (HTTP 429) on ${s.afterQuestion}. ${s.questionsNotRun} of ${total} questions were not run. ${r.requestsSent} request(s) were sent in total and none were retried.`,
    "",
    ...(details ? describeDetails(details) : []),
    "",
    hint,
    "",
  ];
}

function failedRunsSection(r: LiveReport): string[] {
  if (r.stoppedEarly) return [];
  const failed = r.rows.filter((row) => row.error !== null);
  if (failed.length === 0) return [];
  return [
    "## Failed runs",
    "",
    ...failed.map((row) => {
      const d = row.errorDetails;
      const status = d ? ` (HTTP ${d.status}${d.message ? `: ${d.message}` : ""})` : "";
      return `- ${row.id}: ${row.error}${status}`;
    }),
    "",
  ];
}

export function formatLiveMarkdown(r: LiveReport): string {
  const m = r.metrics;
  return [
    r.mock
      ? `# MOCK RUN — plumbing check only (${r.model})

> The "model" here is a deterministic stand-in, not a language model. These numbers verify that the live runner works end to end. They say NOTHING about any real model.`
      : `# Live evaluation — ${r.provider} / ${r.model}`,
    "",
    r.stoppedEarly
      ? `Attempted ${r.rows.length} of ${r.questions} questions at ${r.ranAt}; ${r.requestsSent} request(s) sent.`
      : `Ran ${r.questions} questions at ${r.ranAt}; ${r.requestsSent} request(s) sent.`,
    "",
    ...stoppedSection(r),
    ...failedRunsSection(r),
    "| Metric | Value |",
    "|---|---|",
    `| Citation resolution rate (answerable) | ${cell(m.citationResolutionRate)} |`,
    `| Citation correctness vs gold (resolving citations) | ${cell(m.citationCorrectnessVsGold)} |`,
    `| Unsupported-claim rate, integrity proxy (answerable) | ${cell(m.unsupportedClaimRate)} |`,
    `| Abstained on unanswerable questions | ${cell(m.abstentionOnUnanswerable)} |`,
    `| Made claims anyway on unanswerable questions | ${cell(m.answeredAnywayOnUnanswerable)} |`,
    `| Falsely abstained on answerable questions | ${cell(m.falseAbstentionOnAnswerable)} |`,
    `| Failed runs (error / schema failure) | ${cell(m.failedRuns)} |`,
    "",
    ...r.notes.map((n) => `- ${n}`),
    "",
  ].join("\n");
}
