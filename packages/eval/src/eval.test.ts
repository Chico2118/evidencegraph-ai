import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { runDeterministicEval } from "./deterministic";
import { loadFixtures } from "./fixtures";
import { hitAtK, macroAverage, ratio, recallAtK, reciprocalRank } from "./metrics";
import { formatReportMarkdown } from "./report";

describe("metric primitives", () => {
  it("ratio keeps numerator and denominator and handles an empty denominator", () => {
    expect(ratio(1, 3)).toEqual({ value: 0.3333, numerator: 1, denominator: 3 });
    expect(ratio(0, 0).value).toBeNull();
  });

  it("recall, hit-rate and reciprocal rank", () => {
    const ranked = ["a", "b", "c", "d"];
    expect(recallAtK(ranked, ["b", "z"], 2)).toBe(0.5);
    expect(recallAtK(ranked, ["b", "z"], 1)).toBe(0);
    expect(recallAtK(ranked, [], 5)).toBe(0);
    expect(hitAtK(ranked, ["c"], 2)).toBe(0);
    expect(hitAtK(ranked, ["c"], 3)).toBe(1);
    expect(reciprocalRank(ranked, ["c", "d"])).toBeCloseTo(1 / 3);
    expect(reciprocalRank(ranked, ["zzz"])).toBe(0);
  });

  it("macroAverage reports the sample size as its denominator", () => {
    expect(macroAverage([1, 0, 0.5])).toEqual({ value: 0.5, numerator: 1.5, denominator: 3 });
    expect(macroAverage([]).value).toBeNull();
  });
});

describe("fixtures", () => {
  it("load and satisfy their referential-integrity checks", () => {
    const f = loadFixtures();
    expect(f.corpus.pages.length).toBeGreaterThan(5);
    expect(f.questions.filter((q) => !q.answerable).length).toBeGreaterThan(0);
    expect(f.corpus.note).toMatch(/SYNTHETIC/);
  });

  it("every gold passage id exists in the corpus", () => {
    const f = loadFixtures();
    const passageCounts = new Map(f.corpus.pages.map((p) => [p.slug, p.content.split(/\n\n+/).filter((b) => !/^#{1,6}\s/.test(b.trim())).length]));
    for (const q of f.questions) {
      for (const g of q.gold) {
        for (const p of g.passages) {
          expect(Number(p.slice(1))).toBeLessThanOrEqual(passageCounts.get(g.page) ?? 0);
        }
      }
    }
  });
});

describe("runDeterministicEval", () => {
  const report = runDeterministicEval();

  it("is fully reproducible", () => {
    expect(JSON.stringify(runDeterministicEval())).toBe(JSON.stringify(report));
  });

  it("matches the committed results/latest.json (rerun `pnpm eval` after an intended change)", async () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const committed = await readFile(join(dir, "..", "results", "latest.json"), "utf8");
    expect(JSON.stringify(report, null, 2) + "\n").toBe(committed);
  });

  it("every reported metric carries a denominator", () => {
    expect(report.fixtures.answerableQuestions).toBe(15);
    expect(report.retrieval.naturalLanguage.improved.mrr.denominator).toBe(15);
    expect(report.citationValidation.improved.accuracy.denominator).toBe(report.fixtures.labeledCitations);
  });

  it("the improved pipeline never does worse than the baseline on the shared cases", () => {
    const nl = report.retrieval.naturalLanguage;
    const kw = report.retrieval.keyword;
    expect(nl.improved.mrr.value ?? 0).toBeGreaterThanOrEqual(nl.baseline.mrr.value ?? 0);
    expect(kw.improved.mrr.value ?? 0).toBeGreaterThanOrEqual(kw.baseline.mrr.value ?? 0);
    expect(report.citationValidation.improved.accuracy.value ?? 0).toBeGreaterThanOrEqual(
      report.citationValidation.baseline.accuracy.value ?? 0,
    );
  });

  it("states its limitations and renders to markdown", () => {
    expect(report.limitations.length).toBeGreaterThan(3);
    const md = formatReportMarkdown(report);
    expect(md).toContain("Limitations");
    expect(md).toContain("Recall@3");
  });
});
