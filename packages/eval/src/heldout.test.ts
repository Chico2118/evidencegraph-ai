import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { runDeterministicEval } from "./deterministic";
import { loadFixtures, loadHeldoutFixtures } from "./fixtures";

const dir = dirname(fileURLToPath(import.meta.url));
const sha = (buf: Buffer) => createHash("sha256").update(buf).digest("hex");

describe("held-out set", () => {
  it("fixture files are unchanged since they were frozen", async () => {
    const frozen = (await readFile(join(dir, "..", "fixtures", "heldout", "FROZEN.sha256"), "utf8")).trim().split("\n");
    expect(frozen).toHaveLength(4);
    for (const line of frozen) {
      const [hash, file] = line.split(/\s+\*?/);
      const actual = sha(await readFile(join(dir, "..", "fixtures", "heldout", file ?? "")));
      expect(actual, file).toBe(hash);
    }
  });

  it("the frozen first-run record has not been edited", async () => {
    const actual = sha(await readFile(join(dir, "..", "results", "heldout-first-run.json")));
    expect(actual).toBe("5a489b79d74a8c73e4035e6fdbc34dee461ae210f7b84d3d666e8dd7d7dfe90a");
  });

  it("the frozen markdown records have not been edited (pinned after a consistency check against the JSON)", async () => {
    const pins: Record<string, string> = {
      "first-run.md": "21b992510211d3932ccbaeb4c47bfd09d5d8e3b630d87f8403b00fc31b8de6dc",
      "heldout-first-run.md": "ec0ee064380244ef2d1085152ef504d8b6fc8082a9e7b2b1b24aeccf5501ea95",
    };
    for (const [file, hash] of Object.entries(pins)) {
      expect(sha(await readFile(join(dir, "..", "results", file))), file).toBe(hash);
    }
  });

  it("is a different corpus from the development set, and every gold passage exists", () => {
    const held = loadHeldoutFixtures();
    const devSlugs = new Set(loadFixtures().corpus.pages.map((p) => p.slug));
    expect(held.corpus.pages.some((p) => devSlugs.has(p.slug))).toBe(false);
    const counts = new Map(held.corpus.pages.map((p) => [p.slug, p.content.split(/\n\n+/).length]));
    for (const q of held.questions) {
      for (const g of q.gold) {
        for (const p of g.passages) expect(Number(p.slice(1))).toBeLessThanOrEqual(counts.get(g.page) ?? 0);
      }
    }
  });

  it("is reproducible and matches the committed heldout-latest.json", async () => {
    const report = runDeterministicEval(loadHeldoutFixtures());
    expect(JSON.stringify(runDeterministicEval(loadHeldoutFixtures()))).toBe(JSON.stringify(report));
    const committed = await readFile(join(dir, "..", "results", "heldout-latest.json"), "utf8");
    expect(JSON.stringify(report, null, 2) + "\n").toBe(committed);
  });

  it("is larger than the development set on citations", () => {
    const report = runDeterministicEval(loadHeldoutFixtures());
    expect(report.fixtures.labeledCitations).toBeGreaterThan(100);
    expect(report.fixtures.answerableQuestions).toBe(22);
    expect(report.fixtures.unanswerableQuestions).toBe(8);
  });
});
