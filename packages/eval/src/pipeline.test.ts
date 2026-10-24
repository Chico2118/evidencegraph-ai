// End-to-end: real retrieval + real prompt + real response schema + real
// verifier, with a deterministic mock in place of the model. This guards the
// contract between the prompt format, the parser and the validator.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openInMemoryDb, queryWiki, verifyQueryResponse, type Db } from "@evidencegraph/core";
import type { LlmClient } from "@evidencegraph/llm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mockQueryResponse, parsePromptPassages, type MockMode } from "./mock-llm";
import { seedWikiFromFixtures } from "./seed";

let wikiPath: string;
let db: Db;

beforeEach(async () => {
  wikiPath = await mkdtemp(join(tmpdir(), "evidencegraph-pipeline-test-"));
  db = openInMemoryDb();
  await seedWikiFromFixtures(wikiPath, db);
});

afterEach(async () => {
  db.close();
  await rm(wikiPath, { recursive: true, force: true });
});

function mockClient(mode: MockMode, captured: { system?: string } = {}): LlmClient {
  return {
    chat: {
      completions: {
        create: vi.fn(async (req: { messages: Array<{ role: string; content: string }> }) => {
          const system = req.messages.find((m) => m.role === "system")?.content ?? "";
          const user = req.messages.find((m) => m.role === "user")?.content ?? "";
          captured.system = system;
          return {
            id: "mock",
            model: "mock",
            choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(mockQueryResponse(system, user, mode)) }, finish_reason: "stop" }],
            usage: { prompt_tokens: 100, completion_tokens: 50 },
          };
        }),
      },
    },
  } as unknown as LlmClient;
}

async function ask(question: string, mode: MockMode, captured?: { system?: string }) {
  const response = await queryWiki({ question, wikiPath, db, client: mockClient(mode, captured), model: "mock" });
  const report = await verifyQueryResponse({ wikiPath, db, response });
  return { response, report };
}

describe("query -> verify pipeline", () => {
  it("sends numbered passages to the model, and the best one is the gold passage", async () => {
    const captured: { system?: string } = {};
    await ask("How do ceramic-coated separators help safety?", "faithful", captured);
    const passages = parsePromptPassages(captured.system ?? "");
    expect(passages.length).toBeGreaterThan(0);
    expect(passages.some((p) => p.page === "battery-safety" && p.id === "p3")).toBe(true);
  });

  it("a faithful answer verifies end to end, with source lineage attached", async () => {
    const { report } = await ask("How do ceramic-coated separators help safety?", "faithful");
    expect(report.verdict).toBe("all_claims_verified");
    expect(report.claims[0]?.origin).toBe("model");
    const resolved = report.claims[0]?.citations[0]?.resolved;
    expect(resolved?.pageSlug).toBe("battery-safety");
    expect(resolved?.passageId).toBe("p3");
    expect(resolved?.sources.map((s) => s.id)).toContain("src-safety-guide");
    // Integrity, not support: the claim still reports unassessed support.
    expect(report.claims[0]?.support.status).toBe("not_assessed");
  });

  it("flawed answers expose fabricated quotes, ghost pages, uncited claims and overconfidence", async () => {
    const { report, response } = await ask("How do ceramic-coated separators help safety?", "flawed");
    expect(response.confidence).toBe("high");
    expect(report.claims.map((c) => c.evidenceState)).toEqual([
      "all_citations_valid",
      "no_valid_citations", // fabricated quote
      "no_valid_citations", // page does not exist
      "no_evidence", // cites nothing
    ]);
    expect(report.claims[1]?.citations[0]?.issues[0]?.code).toBe("quote_not_found");
    expect(report.claims[2]?.citations[0]?.integrity).toBe("unavailable");
    expect(report.verdict).toBe("some_claims_unverified");
    expect(report.confidenceMismatch).toBe(true);
    expect(report.pagesUsed.find((p) => p.slug === "independent-replication-study")?.status).toBe("missing");
  });

  it("an unanswerable question yields an abstention, which is not flagged as a failure", async () => {
    const { report, response } = await ask("What is the capital of France?", "flawed");
    expect(response.claims).toEqual([]);
    expect(report.verdict).toBe("no_claims");
    expect(report.confidenceMismatch).toBe(false);
  });

  it("a page deleted after the answer shows up as unavailable on re-verification", async () => {
    const { response } = await ask("How do ceramic-coated separators help safety?", "faithful");
    await rm(join(wikiPath, "wiki", "battery-safety.md"));
    const again = await verifyQueryResponse({ wikiPath, db, response });
    expect(again.claims[0]?.citations[0]?.integrity).toBe("unavailable");
    expect(again.verdict).toBe("no_valid_evidence");
  });
});
