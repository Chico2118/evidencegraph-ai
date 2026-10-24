import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { appendResearchRun, getResearchRun, listResearchRuns, RESEARCH_HISTORY_FILE } from "./research-history";
import type { QueryResponse } from "./schema";
import { initWikiFolder, WIKI_PATHS } from "./wiki";

let wikiPath: string;

const response: QueryResponse = {
  answer: "A.",
  pagesUsed: [],
  suggestedNewPage: null,
  confidence: "low",
  caveats: [],
  claims: [{ text: "A.", citations: [] }],
};

beforeEach(async () => {
  wikiPath = await mkdtemp(join(tmpdir(), "evidencegraph-history-test-"));
  await initWikiFolder(wikiPath);
});

afterEach(async () => {
  await rm(wikiPath, { recursive: true, force: true });
});

describe("research history", () => {
  it("returns [] when no history exists yet", async () => {
    expect(await listResearchRuns(wikiPath)).toEqual([]);
    expect(await getResearchRun(wikiPath, "nope")).toBeNull();
  });

  it("stores runs newest-first and round-trips the structured response", async () => {
    const a = await appendResearchRun(wikiPath, { question: "first?", model: "m", response });
    const b = await appendResearchRun(wikiPath, { question: "second?", model: "m", response });
    const runs = await listResearchRuns(wikiPath);
    expect(runs.map((r) => r.question)).toEqual(["second?", "first?"]);
    expect((await getResearchRun(wikiPath, a.id))?.response.claims).toEqual(response.claims);
    expect(b.id).not.toBe(a.id);
  });

  it("caps history at 100 runs", async () => {
    for (let i = 0; i < 103; i++) {
      await appendResearchRun(wikiPath, { question: `q${i}`, model: "m", response });
    }
    const runs = await listResearchRuns(wikiPath);
    expect(runs).toHaveLength(100);
    expect(runs[0]?.question).toBe("q102");
  });

  it("ignores a corrupt file and corrupt entries instead of throwing", async () => {
    const file = join(wikiPath, WIKI_PATHS.tooling, RESEARCH_HISTORY_FILE);
    await mkdir(join(wikiPath, WIKI_PATHS.tooling), { recursive: true });
    await writeFile(file, "{not json", "utf8");
    expect(await listResearchRuns(wikiPath)).toEqual([]);

    await writeFile(
      file,
      JSON.stringify({
        version: 1,
        runs: [{ id: "x", question: 5 }, { id: "ok", question: "q", model: "m", createdAt: "t", response }],
      }),
      "utf8",
    );
    const runs = await listResearchRuns(wikiPath);
    expect(runs.map((r) => r.id)).toEqual(["ok"]);
  });
});
