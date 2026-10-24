import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CONTRADICTION_REVIEWS_FILE,
  findContradictionCandidates,
  loadReviews,
  saveReview,
  scanWikiForContradictions,
  type ContradictionPage,
} from "./contradictions";
import { openInMemoryDb } from "./db";
import { upsertPage } from "./db-pages";
import { segmentPassages } from "./passages";
import { initWikiFolder, writePage, WIKI_PATHS } from "./wiki";

function page(slug: string, updated: string, body: string): ContradictionPage {
  return { slug, title: slug, updated, passages: segmentPassages(body) };
}

describe("findContradictionCandidates", () => {
  it("flags a numeric mismatch on the same quantity and explains the context", () => {
    const found = findContradictionCandidates([
      page("new-study", "2026-03-01", "Capacity fade accelerates above 45 degrees Celsius in the tested cells."),
      page("old-notes", "2024-02-01", "Capacity fade accelerates above 60 degrees Celsius in the tested cells."),
    ]);
    expect(found).toHaveLength(1);
    const c = found[0];
    expect(c?.classification).toBe("possible_conflict");
    expect(c?.reasons.map((r) => r.code)).toContain("numeric_mismatch");
    expect(c?.contextNotes.join(" ")).toMatch(/Different page dates/);
    expect([c?.a.pageSlug, c?.b.pageSlug].sort()).toEqual(["new-study", "old-notes"]);
  });

  it("does not flag consistent statements or unrelated topics", () => {
    const found = findContradictionCandidates([
      page("a", "2026-01-01", "Liquid cooling keeps pack temperature differences under 3 degrees Celsius across cells."),
      page("b", "2026-01-02", "Liquid cooling keeps pack temperature differences under 3 degrees Celsius across cells."),
      page("c", "2026-01-03", "Hydrometallurgical recycling recovers over 95% of cobalt and nickel from spent cells."),
    ]);
    expect(found).toEqual([]);
  });

  it("flags a negation mismatch on the same topic", () => {
    const found = findContradictionCandidates([
      page("a", "2026-01-01", "Solid-state cells are expected to reach commercial manufacturing at scale before 2030."),
      page("b", "2026-01-02", "Solid-state cells are not expected to reach commercial manufacturing at scale before 2030."),
    ]);
    expect(found[0]?.reasons.map((r) => r.code)).toContain("negation_mismatch");
  });

  it("treats a small numeric gap in near-identical wording as worth a look, but not in loosely related text", () => {
    const near = findContradictionCandidates([
      page("a", "2026-01-01", "After 500 charge cycles at 1C, the cells retained 88% of their initial capacity."),
      page("b", "2026-01-02", "After 500 charge cycles at 1C, the cells retained 94% of their initial capacity."),
    ]);
    expect(near).toHaveLength(1);

    const loose = findContradictionCandidates([
      page("a", "2026-01-01", "Cells retained 88% of capacity in the first aging study of NMC chemistry samples."),
      page("b", "2026-01-02", "Customer surveys show 94% of capacity planners prefer longer warranty terms for cells."),
    ]);
    expect(loose).toEqual([]);
  });

  it("surfaces differing conditions as context rather than hiding them", () => {
    const [c] = findContradictionCandidates([
      page("lab", "2026-01-01", "LFP cells retain 90% of capacity after 3000 cycles in laboratory tests."),
      page("field", "2026-01-02", "LFP cells retain 80% of capacity after 3000 cycles in fleet operation."),
    ]);
    expect(c?.contextNotes.join(" ")).toMatch(/Different conditions stated/);
  });

  it("splits clauses on semicolons so each statement is compared on its own", () => {
    const found = findContradictionCandidates([
      page("lab", "2026-01-01", "LFP cathodes tolerate more charge cycles; LFP cells retain 90% of capacity after 3000 cycles in laboratory tests."),
      page("field", "2026-01-02", "LFP cells retain 80% of capacity after 3000 cycles in fleet operation."),
    ]);
    expect(found).toHaveLength(1);
  });

  it("does not read 'the 2019 level' as a quantity, so topic overlap is not diluted", () => {
    const found = findContradictionCandidates([
      page("city", "2026-03-22", "Weekday ridership recovered to 87 percent of the 2019 level by the end of 2025."),
      page("region", "2026-03-30", "Weekday ridership in the region reached 92 percent of the 2019 level by the end of 2025."),
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]?.contextNotes.join(" ")).not.toMatch(/different years/);
  });

  it("still treats '3000 cycles' as a quantity, not a year", () => {
    const [c] = findContradictionCandidates([
      page("a", "2026-01-01", "LFP cells retain 90% of capacity after 3000 cycles in laboratory tests."),
      page("b", "2026-01-02", "LFP cells retain 80% of capacity after 2000 cycles in laboratory tests."),
    ]);
    expect(c?.reasons.map((r) => r.message).join(" ")).toMatch(/cycle|%/);
  });

  it("is deterministic with stable ids", () => {
    const pages = [
      page("a", "2026-01-01", "Capacity fade accelerates above 45 degrees Celsius in the tested cells."),
      page("b", "2026-01-02", "Capacity fade accelerates above 60 degrees Celsius in the tested cells."),
    ];
    const one = findContradictionCandidates(pages);
    const two = findContradictionCandidates([...pages].reverse());
    expect(one[0]?.id).toMatch(/^[a-f0-9]{16}$/);
    expect(one[0]?.id).toBe(two[0]?.id);
  });
});

describe("review state", () => {
  let wikiPath: string;
  beforeEach(async () => {
    wikiPath = await mkdtemp(join(tmpdir(), "evidencegraph-contra-test-"));
    await initWikiFolder(wikiPath);
  });
  afterEach(async () => {
    await rm(wikiPath, { recursive: true, force: true });
  });

  it("round-trips a review, and 'unreviewed' clears it", async () => {
    const id = "0123456789abcdef";
    expect(await loadReviews(wikiPath)).toEqual({});
    await saveReview(wikiPath, id, { status: "explained_difference", note: "  lab vs field  " });
    const saved = (await loadReviews(wikiPath))[id];
    expect(saved?.status).toBe("explained_difference");
    expect(saved?.note).toBe("lab vs field");
    await saveReview(wikiPath, id, { status: "unreviewed" });
    expect(await loadReviews(wikiPath)).toEqual({});
  });

  it("rejects ids that are not candidate hashes", async () => {
    await expect(saveReview(wikiPath, "../../etc", { status: "not_a_conflict" })).rejects.toThrow(/invalid/);
  });

  it("ignores a corrupt file and corrupt entries", async () => {
    const dir = join(wikiPath, WIKI_PATHS.tooling);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, CONTRADICTION_REVIEWS_FILE), "nope", "utf8");
    expect(await loadReviews(wikiPath)).toEqual({});
    await writeFile(
      join(dir, CONTRADICTION_REVIEWS_FILE),
      JSON.stringify({
        version: 1,
        reviews: { "0123456789abcdef": { status: "bogus", reviewedAt: "t" }, "fedcba9876543210": { status: "not_a_conflict", reviewedAt: "t" } },
      }),
      "utf8",
    );
    expect(Object.keys(await loadReviews(wikiPath))).toEqual(["fedcba9876543210"]);
  });
});

describe("scanWikiForContradictions", () => {
  it("scans real page files and attaches saved reviews", async () => {
    const wikiPath = await mkdtemp(join(tmpdir(), "evidencegraph-scan-test-"));
    try {
      await initWikiFolder(wikiPath);
      const db = openInMemoryDb();
      for (const [slug, updated, body] of [
        ["new-study", "2026-03-01", "Capacity fade accelerates above 45 degrees Celsius in the tested cells."],
        ["old-notes", "2024-02-01", "Capacity fade accelerates above 60 degrees Celsius in the tested cells."],
      ] as const) {
        await writePage(wikiPath, {
          slug,
          frontmatter: { title: slug, slug, type: "concept", created: updated, updated },
          content: body,
        });
        upsertPage(db, { slug, title: slug, type: "concept", created_at: updated, updated_at: updated, word_count: 12, tags: [] });
      }
      const first = await scanWikiForContradictions(wikiPath, db);
      expect(first.pagesScanned).toBe(2);
      expect(first.candidates).toHaveLength(1);
      expect(first.candidates[0]?.review).toBeNull();

      await saveReview(wikiPath, first.candidates[0]?.id ?? "", { status: "confirmed_contradiction" });
      const second = await scanWikiForContradictions(wikiPath, db);
      expect(second.candidates[0]?.review?.status).toBe("confirmed_contradiction");
      db.close();
    } finally {
      await rm(wikiPath, { recursive: true, force: true });
    }
  });
});
