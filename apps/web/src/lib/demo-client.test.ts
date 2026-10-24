import { QueryResponseSchema } from "@evidencegraph/core";
import { callLLM } from "@evidencegraph/llm";
import { describe, expect, it } from "vitest";

import { createDemoClient, DEMO_MODEL } from "./demo-client";

// The public demo answers questions in-process with the deterministic mock. These tests run it through the REAL
// production call path (callLLM + the QueryResponseSchema validation) with no network and no key.
const SYSTEM = [
  "You answer from the wiki pages below.",
  "### Cell aging (slug: cell-aging, type: concept)",
  "[p1] Capacity fade accelerates above 45 degrees Celsius in the tested NMC cells.",
  "[p2] Cycle life improves with moderate charge rates.",
].join("\n");

describe("createDemoClient", () => {
  it("answers through callLLM with a valid, schema-checked response that quotes a real passage", async () => {
    const result = await callLLM({
      client: createDemoClient(),
      model: DEMO_MODEL,
      system: SYSTEM,
      user: "User question: At what temperature does capacity fade accelerate in NMC cells?",
      schema: QueryResponseSchema,
    });
    expect(result.model).toBe(DEMO_MODEL);
    expect(result.data.answer).toContain("45 degrees");
    expect(result.data.pagesUsed).toContain("cell-aging");
  });

  it("abstains instead of inventing an answer when nothing in the prompt covers the question", async () => {
    const result = await callLLM({
      client: createDemoClient(),
      model: DEMO_MODEL,
      system: SYSTEM,
      user: "User question: Who won the 1998 football world cup?",
      schema: QueryResponseSchema,
    });
    expect(result.data.pagesUsed).toEqual([]);
    expect(result.data.answer).toMatch(/does not contain enough information/i);
  });

  it("has no network address, so it cannot reach a provider", () => {
    expect((createDemoClient() as unknown as { baseURL: string }).baseURL).toBe("demo://mock");
  });
});
