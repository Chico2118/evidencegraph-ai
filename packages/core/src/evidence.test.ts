import { describe, expect, it } from "vitest";

import {
  checkCitation,
  collectCitedSlugs,
  deriveClaimsFromAnswer,
  parseRawClaims,
  validateEvidence,
  type CorpusPage,
  type EvidenceCorpus,
} from "./evidence";
import { segmentPassages } from "./passages";

function page(slug: string, title: string, body: string): CorpusPage {
  return {
    slug,
    title,
    updated: "2026-01-01",
    passages: segmentPassages(body),
    sources: [{ id: "src-1", title: "Aging study", format: "pdf" }],
  };
}

const corpus: EvidenceCorpus = new Map<string, CorpusPage | null | "unreadable">([
  [
    "cell-aging",
    page(
      "cell-aging",
      "Cell aging",
      "Capacity fade accelerates above 45 degrees Celsius.\n\nCalendar aging is slower than cycle aging in the tested cells.",
    ),
  ],
  ["broken-page", "unreadable"],
]);

describe("checkCitation - integrity states", () => {
  it("valid: page, passage and quote all resolve", () => {
    const c = checkCitation(
      { page: "cell-aging", passage: "p1", quote: "fade accelerates above 45 degrees" },
      corpus,
    );
    expect(c.integrity).toBe("valid");
    expect(c.granularity).toBe("passage");
    expect(c.resolved?.passageText).toContain("45 degrees");
    expect(c.resolved?.sources[0]?.id).toBe("src-1");
    expect(c.issues).toEqual([]);
  });

  it("valid at page level, with a warning, when no passage or quote is given", () => {
    const c = checkCitation({ page: "cell-aging" }, corpus);
    expect(c.integrity).toBe("valid");
    expect(c.granularity).toBe("page");
    expect(c.resolved?.passageText).toBeNull();
    expect(c.warnings.map((w) => w.code)).toContain("page_level_only");
  });

  it("infers the passage from a verifiable quote", () => {
    const c = checkCitation(
      { page: "cell-aging", quote: "Calendar aging is slower than cycle aging" },
      corpus,
    );
    expect(c.integrity).toBe("valid");
    expect(c.resolved?.passageId).toBe("p2");
    expect(c.warnings.map((w) => w.code)).toContain("passage_inferred_from_quote");
  });

  it("unavailable: page does not exist (deleted or hallucinated)", () => {
    const c = checkCitation({ page: "no-such-page", passage: "p1" }, corpus);
    expect(c.integrity).toBe("unavailable");
    expect(c.issues[0]?.code).toBe("page_not_found");
    expect(c.resolved).toBeNull();
  });

  it("unavailable: page exists but cannot be read", () => {
    const c = checkCitation({ page: "broken-page" }, corpus);
    expect(c.integrity).toBe("unavailable");
    expect(c.issues[0]?.code).toBe("page_unreadable");
  });

  it("invalid: passage id does not exist on the page", () => {
    const c = checkCitation({ page: "cell-aging", passage: "p9" }, corpus);
    expect(c.integrity).toBe("invalid");
    expect(c.issues[0]?.code).toBe("passage_not_found");
    expect(c.resolved?.pageTitle).toBe("Cell aging"); // page still identified for the UI
  });

  it("invalid: fabricated quote", () => {
    const c = checkCitation(
      { page: "cell-aging", passage: "p1", quote: "fade stops entirely at 80 degrees" },
      corpus,
    );
    expect(c.integrity).toBe("invalid");
    expect(c.issues[0]?.code).toBe("quote_not_found");
    // The real passage is still returned so a reader can see what it says.
    expect(c.resolved?.passageId).toBe("p1");
    expect(c.resolved?.passageText).toContain("45 degrees");
  });

  it("invalid: quote is real but belongs to a different passage", () => {
    const c = checkCitation(
      { page: "cell-aging", passage: "p1", quote: "Calendar aging is slower than cycle aging" },
      corpus,
    );
    expect(c.integrity).toBe("invalid");
    expect(c.issues[0]?.code).toBe("quote_found_in_other_passage");
  });

  it("invalid: quote with no passage that appears nowhere on the page", () => {
    const c = checkCitation({ page: "cell-aging", quote: "completely invented sentence here" }, corpus);
    expect(c.integrity).toBe("invalid");
    expect(c.issues[0]?.code).toBe("quote_not_found");
  });

  it("warns when a quote is too short to mean anything", () => {
    const c = checkCitation({ page: "cell-aging", passage: "p1", quote: "capacity" }, corpus);
    expect(c.integrity).toBe("valid");
    expect(c.warnings.map((w) => w.code)).toContain("quote_too_short");
  });

  it.each([
    ["not an object", "cell-aging"],
    ["null", null],
    ["missing page", { passage: "p1" }],
    ["page is a number", { page: 7 }],
    ["quote is an object", { page: "cell-aging", quote: { text: "x" } }],
  ])("invalid: malformed citation (%s)", (_label, raw) => {
    const c = checkCitation(raw, corpus);
    expect(c.integrity).toBe("invalid");
    expect(c.issues[0]?.code).toBe("malformed_citation");
  });

  it.each(["../etc/passwd", "Cell-Aging", "cell aging", "a/b", "", "x".repeat(101)])(
    "invalid: unsafe or malformed slug %j never reaches a lookup",
    (slug) => {
      const c = checkCitation({ page: slug }, corpus);
      expect(c.integrity).toBe("invalid");
      expect(c.issues[0]?.code).toBe("invalid_slug");
    },
  );

  it("invalid: malformed passage id", () => {
    const c = checkCitation({ page: "cell-aging", passage: "paragraph 2" }, corpus);
    expect(c.issues[0]?.code).toBe("invalid_passage_id");
  });
});

describe("parseRawClaims", () => {
  it("keeps good claims and reports bad ones instead of throwing", () => {
    const r = parseRawClaims([
      { text: "Good claim.", citations: [{ page: "cell-aging" }] },
      "just a string",
      { text: "   ", citations: [] },
      { text: "No citations key" },
      { citations: [] },
    ]);
    expect(r.claims.map((c) => c.text)).toEqual(["Good claim.", "No citations key"]);
    expect(r.malformed.map((m) => m.index)).toEqual([1, 2, 4]);
  });

  it("handles missing and non-array values", () => {
    expect(parseRawClaims(undefined)).toEqual({ claims: [], malformed: [] });
    expect(parseRawClaims({ not: "array" }).malformed).toHaveLength(1);
  });
});

describe("deriveClaimsFromAnswer", () => {
  it("makes one claim per sentence and turns [[slug]] into page-level citations", () => {
    const claims = deriveClaimsFromAnswer(
      "## Summary\n\nCapacity fade accelerates above 45 C [[cell-aging]]. Calendar aging is slower. Short.\n\n- Venting is flammable and dangerous [[safety]] and [[safety]].",
    );
    expect(claims.map((c) => c.text)).toEqual([
      "Capacity fade accelerates above 45 C [[cell-aging]].",
      "Calendar aging is slower.",
      "Venting is flammable and dangerous [[safety]] and [[safety]].",
    ]);
    expect(claims[0]?.citations).toEqual([{ page: "cell-aging" }]);
    expect(claims[1]?.citations).toEqual([]);
    expect(claims[2]?.citations).toEqual([{ page: "safety" }]); // de-duplicated
  });
});

describe("collectCitedSlugs", () => {
  it("returns only well-formed slugs, from claims and pagesUsed", () => {
    const slugs = collectCitedSlugs(
      [{ text: "x", citations: [{ page: "a-b" }, { page: "../bad" }, 5, { page: "c" }] }],
      ["d", "BAD SLUG"],
    );
    expect(slugs.sort()).toEqual(["a-b", "c", "d"]);
  });
});

describe("validateEvidence - report", () => {
  const base = { pagesUsed: ["cell-aging", "ghost"], corpus, origin: "model" as const };

  it("all_claims_verified when every claim's citations resolve", () => {
    const r = validateEvidence({
      ...base,
      modelConfidence: "high",
      claims: [{ text: "Fade accelerates above 45 C.", citations: [{ page: "cell-aging", passage: "p1" }] }],
    });
    expect(r.verdict).toBe("all_claims_verified");
    expect(r.summary.citationResolutionRate).toBe(1);
    expect(r.confidenceMismatch).toBe(false);
    expect(r.claims[0]?.support).toEqual({ status: "not_assessed", basis: "none" });
  });

  it("flags unsupported claims, broken citations, and confidence mismatch", () => {
    const r = validateEvidence({
      ...base,
      modelConfidence: "high",
      claims: [
        { text: "Valid one.", citations: [{ page: "cell-aging", passage: "p1" }] },
        { text: "No citation at all.", citations: [] },
        { text: "Cites a ghost.", citations: [{ page: "ghost" }] },
        { text: "Half and half.", citations: [{ page: "cell-aging", passage: "p2" }, { page: "ghost" }] },
      ],
    });
    expect(r.claims.map((c) => c.evidenceState)).toEqual([
      "all_citations_valid",
      "no_evidence",
      "no_valid_citations",
      "some_citations_valid",
    ]);
    expect(r.verdict).toBe("some_claims_unverified");
    expect(r.confidenceMismatch).toBe(true);
    expect(r.summary).toMatchObject({
      claims: 4,
      claimsWithValidEvidence: 2,
      claimsWithoutValidEvidence: 2,
      citations: 4,
      validCitations: 2,
      unavailableCitations: 2,
    });
    expect(r.summary.citationResolutionRate).toBe(0.5);
    expect(r.pagesUsed).toEqual([
      { slug: "cell-aging", status: "exists", citedByClaim: true },
      { slug: "ghost", status: "missing", citedByClaim: true },
    ]);
  });

  it("no_valid_evidence when nothing resolves", () => {
    const r = validateEvidence({ ...base, claims: [{ text: "Invented.", citations: [{ page: "ghost" }] }] });
    expect(r.verdict).toBe("no_valid_evidence");
  });

  it("no_claims (an honest abstention) is not a failure", () => {
    const r = validateEvidence({ ...base, modelConfidence: "high", claims: [], pagesUsed: [] });
    expect(r.verdict).toBe("no_claims");
    expect(r.confidenceMismatch).toBe(false);
    expect(r.summary.citationResolutionRate).toBeNull();
  });

  it("counts a repeated citation on one claim once", () => {
    const dup = { page: "cell-aging", passage: "p1" };
    const r = validateEvidence({ ...base, claims: [{ text: "Dup.", citations: [dup, { ...dup }] }] });
    expect(r.summary.citations).toBe(1);
    expect(r.summary.duplicateCitations).toBe(1);
    expect(r.claims[0]?.citations[1]?.warnings.map((w) => w.code)).toContain("duplicate_citation");
  });

  it("surfaces malformed claim entries", () => {
    const r = validateEvidence({ ...base, claims: [], malformed: [{ index: 2, reason: "bad" }] });
    expect(r.malformedClaims).toEqual([{ index: 2, reason: "bad" }]);
  });
});
