import { describe, expect, it } from "vitest";

import { openInMemoryDb } from "./db";
import { indexPageForSearch, searchPages, upsertPage } from "./db-pages";
import { segmentPassages } from "./passages";
import {
  buildOrQuery,
  prefixStems,
  extractQueryTerms,
  rankPassages,
  searchPagesRanked,
  selectPassagesForPrompt,
  termCoverage,
} from "./retrieval";

function seed(db: ReturnType<typeof openInMemoryDb>, slug: string, title: string, content: string) {
  upsertPage(db, {
    slug,
    title,
    type: "concept",
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    word_count: content.split(/\s+/).length,
    tags: [],
  });
  indexPageForSearch(db, { slug, title, content, tags: [] });
}

describe("extractQueryTerms", () => {
  it("drops stop words and duplicates, keeps content words in order", () => {
    expect(extractQueryTerms("What is the temperature that the cell degrades at? Temperature!")).toEqual([
      "temperature",
      "cell",
      "degrades",
    ]);
    expect(extractQueryTerms("what is the")).toEqual([]);
  });
});

describe("buildOrQuery", () => {
  it("quotes every term and prefix-matches longer words, including trimmed stems", () => {
    expect(buildOrQuery(["cell"])).toBe('"cell"');
    expect(buildOrQuery(["degrades"])).toBe('"degrades"* OR "degrad"* OR "degrade"*');
    expect(buildOrQuery(['a"b'])).toBe('"a""b"');
  });

  it("derives inflection stems of at least 3 characters", () => {
    expect(prefixStems("fares")).toEqual(["fares", "far", "fare"]);
    expect(prefixStems("subsidy")).toEqual(["subsidy", "subsid"]);
    expect(prefixStems("buses")).toContain("bus");
    expect(prefixStems("bus")).toEqual(["bus"]);
    expect(prefixStems("uses")).toEqual(["uses"]); // too short to trim safely
  });

  it("lets an inflected question word find the page's other form", () => {
    const db = openInMemoryDb();
    seed(db, "fares", "Fare policy", "Fare-free pilots needed larger operating subsidies.");
    expect(searchPagesRanked(db, "Did removing fares increase the subsidy needed?", 5).map((h) => h.slug)).toEqual(["fares"]);
  });
});

describe("searchPagesRanked vs the legacy AND search", () => {
  it("finds the page for a natural-language question that the legacy search misses", () => {
    const db = openInMemoryDb();
    seed(db, "cell-aging", "Cell aging", "Capacity fade accelerates above 45 degrees Celsius.");
    seed(db, "recycling", "Recycling", "Recycling recovers cobalt and nickel.");

    const q = "At what temperature does capacity fade accelerate in a cell?";
    expect(searchPages(db, q, 5).map((h) => h.slug)).toEqual([]); // implicit AND of every word
    expect(searchPagesRanked(db, q, 5).map((h) => h.slug)).toEqual(["cell-aging"]);
  });

  it("returns [] for a question with no content words, and never throws on syntax characters", () => {
    const db = openInMemoryDb();
    seed(db, "a", "A", "alpha beta");
    expect(searchPagesRanked(db, "what is the", 5)).toEqual([]);
    expect(() => searchPagesRanked(db, 'alpha" OR (NEAR ) *', 5)).not.toThrow();
  });
});

describe("passage ranking and selection", () => {
  const body =
    "Intro text about nothing.\n\nCapacity fade accelerates above 45 degrees Celsius.\n\nRecycling recovers cobalt.";

  it("scores passages by content-term coverage", () => {
    const terms = extractQueryTerms("capacity fade temperature");
    const ranked = rankPassages(segmentPassages(body), terms);
    expect(ranked[0]?.id).toBe("p2");
    expect(termCoverage(terms, "capacity fade")).toBeCloseTo(2 / 3);
  });

  it("keeps passage ids from the full page and returns chosen passages in reading order", () => {
    const ctx = selectPassagesForPrompt(
      { slug: "x", title: "X", type: "concept", content: body },
      extractQueryTerms("capacity fade"),
      8, // tiny budget: only the best passage fits
    );
    expect(ctx.passages[0]?.id).toBe("p2");
    expect(ctx.passages).toHaveLength(1);
    expect(ctx.omittedPassages).toBe(2);
    const ids = ctx.passages.map((p) => Number(p.id.slice(1)));
    expect([...ids].sort((a, b) => a - b)).toEqual(ids);
  });
});
