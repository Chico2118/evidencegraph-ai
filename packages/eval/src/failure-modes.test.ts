// What the pipeline does with the ways real models misbehave. The model is a
// stub that returns raw text, so every scenario is deterministic and free. It
// does NOT tell us how often a real model does any of this (that is what
// `pnpm eval --live` is for) — only that we handle it when it happens.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openInMemoryDb, queryWiki, verifyQueryResponse, type Db } from "@evidencegraph/core";
import { InvalidJsonError, SchemaValidationError, type LlmClient } from "@evidencegraph/llm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { seedWikiFromFixtures } from "./seed";

let wikiPath: string;
let db: Db;

beforeEach(async () => {
  wikiPath = await mkdtemp(join(tmpdir(), "evidencegraph-failure-test-"));
  db = openInMemoryDb();
  await seedWikiFromFixtures(wikiPath, db);
});
afterEach(async () => {
  db.close();
  await rm(wikiPath, { recursive: true, force: true });
});

/** A client that returns the given raw strings, one per call. */
function rawClient(...contents: string[]): { client: LlmClient; calls: () => number } {
  const queue = [...contents];
  const create = vi.fn(async () => {
    const content = queue.shift();
    if (content === undefined) throw new Error("stub: no response left");
    return {
      id: "stub",
      model: "stub",
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    };
  });
  return { client: { chat: { completions: { create } } } as unknown as LlmClient, calls: () => create.mock.calls.length };
}

const BASE = {
  answer: "Ceramic-coated separators delay internal short circuits [[battery-safety]].",
  pagesUsed: ["battery-safety"],
  suggestedNewPage: null,
  confidence: "medium",
  caveats: [],
};
const GOOD_CLAIM = {
  text: "Separators with ceramic coating delay internal short circuits.",
  citations: [{ page: "battery-safety", passage: "p3", quote: "ceramic coating delay internal short circuits" }],
};

async function run(...contents: string[]) {
  const { client, calls } = rawClient(...contents);
  const response = await queryWiki({ question: "How do ceramic-coated separators help safety?", wikiPath, db, client, model: "stub" });
  const report = await verifyQueryResponse({ wikiPath, db, response });
  return { response, report, calls };
}

describe("malformed model output", () => {
  it("accepts JSON wrapped in a markdown fence", async () => {
    const { report } = await run("```json\n" + JSON.stringify({ ...BASE, claims: [GOOD_CLAIM] }) + "\n```");
    expect(report.verdict).toBe("all_claims_verified");
  });

  it("repairs once after invalid JSON, then succeeds", async () => {
    const { report, calls } = await run("Sure! Here is the answer: {not json", JSON.stringify({ ...BASE, claims: [GOOD_CLAIM] }));
    expect(calls()).toBe(2);
    expect(report.verdict).toBe("all_claims_verified");
  });

  it("gives up with a clear error after two invalid responses (no crash, no fabricated answer)", async () => {
    await expect(run("nope", "still nope")).rejects.toBeInstanceOf(InvalidJsonError);
  });

  it("keeps the answer when individual claims are garbage", async () => {
    const { report } = await run(JSON.stringify({ ...BASE, claims: [42, null, "x", { text: 1 }, GOOD_CLAIM] }));
    expect(report.malformedClaims).toHaveLength(4);
    expect(report.claims).toHaveLength(1);
    expect(report.verdict).toBe("all_claims_verified");
  });

  it.each([
    ["claims is a string", "none"],
    ["claims is null", null],
    ["claims is an object", { text: "x", citations: [] }],
    ["claims is a number", 3],
  ])("keeps the answer when %s (a malformed container must not discard it)", async (_label, claims) => {
    const { response, report } = await run(JSON.stringify({ ...BASE, claims }));
    expect(response.answer).toContain("separators");
    // With no usable claims we fall back to claims derived from the answer text.
    expect(report.claims[0]?.origin).toBe("derived");
  });

  it("keeps the answer when pagesUsed contains a malformed slug, and reports it as missing", async () => {
    const { report } = await run(JSON.stringify({ ...BASE, pagesUsed: ["battery-safety", "Battery Safety", "../../etc/passwd"], claims: [GOOD_CLAIM] }));
    expect(report.claims[0]?.evidenceState).toBe("all_citations_valid");
    const byStatus = Object.fromEntries(report.pagesUsed.map((p) => [p.slug, p.status]));
    expect(byStatus["battery-safety"]).toBe("exists");
    expect(byStatus["Battery Safety"]).toBe("missing");
    expect(byStatus["../../etc/passwd"]).toBe("missing");
  });

  it("still rejects a response with no answer at all", async () => {
    await expect(run(JSON.stringify({ pagesUsed: [], claims: [] }))).rejects.toBeInstanceOf(SchemaValidationError);
  });
});

describe("invalid citations from a model", () => {
  it("flags fabricated quote, ghost page, wrong passage and an uncited claim together", async () => {
    const { report } = await run(
      JSON.stringify({
        ...BASE,
        confidence: "high",
        claims: [
          GOOD_CLAIM,
          { text: "Fabricated.", citations: [{ page: "battery-safety", passage: "p3", quote: "ceramic coating makes cells explosion-proof" }] },
          { text: "Ghost.", citations: [{ page: "no-such-page", passage: "p1" }] },
          { text: "Wrong passage.", citations: [{ page: "battery-safety", passage: "p1", quote: "ceramic coating delay internal short circuits" }] },
          { text: "Uncited.", citations: [] },
        ],
      }),
    );
    expect(report.claims.map((c) => c.evidenceState)).toEqual([
      "all_citations_valid",
      "no_valid_citations",
      "no_valid_citations",
      "no_valid_citations",
      "no_evidence",
    ]);
    expect(report.claims[3]?.citations[0]?.issues[0]?.code).toBe("quote_found_in_other_passage");
    expect(report.confidenceMismatch).toBe(true);
  });
});

describe("contradictory sources", () => {
  it("lets a model cite both conflicting pages, and both citations verify", async () => {
    const { report } = await run(
      JSON.stringify({
        answer: "One page says 45 degrees, an older page says 60 [[cell-aging]] [[aging-older-notes]].",
        pagesUsed: ["cell-aging", "aging-older-notes"],
        suggestedNewPage: null,
        confidence: "low",
        caveats: ["Sources disagree."],
        claims: [
          { text: "Fade accelerates above 45 C.", citations: [{ page: "cell-aging", passage: "p1", quote: "above 45 degrees Celsius" }] },
          { text: "Fade accelerates above 60 C.", citations: [{ page: "aging-older-notes", passage: "p1", quote: "above 60 degrees Celsius" }] },
        ],
      }),
    );
    expect(report.verdict).toBe("all_claims_verified");
    // Both are real. The conflict itself is the contradiction explorer's job, not the citation validator's.
    expect(report.claims.map((c) => c.citations[0]?.resolved?.pageUpdated)).toEqual(["2026-03-10", "2024-02-14"]);
  });
});

describe("missing evidence", () => {
  it("treats an honest low-confidence non-answer as an abstention, not a failure", async () => {
    const { report } = await run(
      JSON.stringify({ answer: "The wiki does not cover this.", pagesUsed: [], suggestedNewPage: null, confidence: "low", caveats: [], claims: [] }),
    );
    expect(report.verdict).toBe("no_claims");
  });

  it("does not excuse a confident invented answer with no citations", async () => {
    const { report } = await run(
      JSON.stringify({ answer: "Sodium-ion packs cost 41 dollars per kWh in 2026.", pagesUsed: [], suggestedNewPage: null, confidence: "high", caveats: [], claims: [] }),
    );
    expect(report.verdict).toBe("no_valid_evidence");
    expect(report.confidenceMismatch).toBe(true);
  });
});
