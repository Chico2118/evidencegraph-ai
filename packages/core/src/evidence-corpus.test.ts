import { mkdtemp, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openInMemoryDb, type Db } from "./db";
import { linkPageSource, upsertPage } from "./db-pages";
import { insertSource } from "./db-sources";
import { loadEvidenceCorpus, verifyQueryResponse } from "./evidence-corpus";
import { initWikiFolder, writePage } from "./wiki";

let wikiPath: string;
let db: Db;

beforeEach(async () => {
  wikiPath = await mkdtemp(join(tmpdir(), "evidencegraph-evidence-test-"));
  await initWikiFolder(wikiPath);
  db = openInMemoryDb();

  await writePage(wikiPath, {
    slug: "cell-aging",
    frontmatter: {
      title: "Cell aging",
      slug: "cell-aging",
      type: "concept",
      created: "2026-01-01",
      updated: "2026-02-01",
    },
    content: "Capacity fade accelerates above 45 degrees Celsius.\n\nCalendar aging is slower than cycle aging.",
  });
  upsertPage(db, {
    slug: "cell-aging",
    title: "Cell aging",
    type: "concept",
    created_at: "2026-01-01",
    updated_at: "2026-02-01",
    word_count: 14,
    tags: [],
  });
  insertSource(db, {
    id: "src-1",
    filename: "aging.pdf",
    original_name: "Aging study.pdf",
    format: "pdf",
    size_bytes: 10,
    added_at: "2026-01-01",
    ingested_at: "2026-01-01",
    url: null,
    title: "Aging study",
  });
  linkPageSource(db, "cell-aging", "src-1");
});

afterEach(async () => {
  db.close();
  await rm(wikiPath, { recursive: true, force: true });
});

describe("loadEvidenceCorpus", () => {
  it("loads passages and source lineage for existing pages", async () => {
    const corpus = await loadEvidenceCorpus(wikiPath, db, ["cell-aging"]);
    const page = corpus.get("cell-aging");
    expect(page).toBeTruthy();
    if (!page || page === "unreadable") throw new Error("expected a loaded page");
    expect(page.passages).toHaveLength(2);
    expect(page.sources).toEqual([{ id: "src-1", title: "Aging study", format: "pdf" }]);
  });

  it("never reads outside the wiki folder for traversal-style slugs", async () => {
    const corpus = await loadEvidenceCorpus(wikiPath, db, ["../../CLAUDE", "..%2Fx", "a/b"]);
    for (const v of corpus.values()) expect(v).toBeNull();
  });

  it("reports a deleted page as missing, not as an error", async () => {
    await unlink(join(wikiPath, "wiki", "cell-aging.md"));
    const corpus = await loadEvidenceCorpus(wikiPath, db, ["cell-aging"]);
    expect(corpus.get("cell-aging")).toBeNull();
  });
});

describe("verifyQueryResponse", () => {
  it("uses model claims when present and verifies them against the real page", async () => {
    const report = await verifyQueryResponse({
      wikiPath,
      db,
      response: {
        answer: "Fade accelerates above 45 C [[cell-aging]].",
        pagesUsed: ["cell-aging"],
        confidence: "medium",
        claims: [
          {
            text: "Fade accelerates above 45 C.",
            citations: [{ page: "cell-aging", passage: "p1", quote: "accelerates above 45 degrees" }],
          },
          {
            text: "Fabricated.",
            citations: [{ page: "cell-aging", passage: "p1", quote: "stops at 80 degrees" }],
          },
        ],
      },
    });
    expect(report.claims.every((c) => c.origin === "model")).toBe(true);
    expect(report.claims.map((c) => c.evidenceState)).toEqual(["all_citations_valid", "no_valid_citations"]);
    expect(report.claims[0]?.citations[0]?.resolved?.sources[0]?.title).toBe("Aging study");
  });

  it("falls back to derived claims when the model returns no structure", async () => {
    const report = await verifyQueryResponse({
      wikiPath,
      db,
      response: {
        answer: "Fade accelerates above 45 C [[cell-aging]]. Recycling is easy and cheap [[recycling]].",
        pagesUsed: [],
        confidence: "low",
      },
    });
    expect(report.claims.every((c) => c.origin === "derived")).toBe(true);
    expect(report.claims.map((c) => c.evidenceState)).toEqual(["all_citations_valid", "no_valid_citations"]);
  });

  it("survives completely malformed claims without throwing", async () => {
    const report = await verifyQueryResponse({
      wikiPath,
      db,
      response: {
        answer: "Nothing to see here at all.",
        pagesUsed: [],
        confidence: "low",
        claims: [42, null, { text: 1 }],
      },
    });
    expect(report.malformedClaims).toHaveLength(3);
    expect(report.verdict).toBe("no_claims"); // low confidence + nothing cited = abstention
  });

  it("does not excuse a confident answer that cites nothing", async () => {
    const report = await verifyQueryResponse({
      wikiPath,
      db,
      response: {
        answer: "Lithium cells always last twenty years in every climate.",
        pagesUsed: [],
        confidence: "high",
        claims: [],
      },
    });
    expect(report.verdict).toBe("no_valid_evidence");
    expect(report.claims[0]?.evidenceState).toBe("no_evidence");
    expect(report.confidenceMismatch).toBe(true);
  });
});
