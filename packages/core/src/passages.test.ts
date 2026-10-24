import { describe, expect, it } from "vitest";

import { isPassageId, normalizeForQuote, quoteAppearsIn, segmentPassages } from "./passages";

describe("segmentPassages", () => {
  it("splits on blank lines and numbers passages in document order", () => {
    const ps = segmentPassages("First paragraph.\n\nSecond paragraph\nstill second.\n\n- a\n- b\n");
    expect(ps.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
    expect(ps[1]?.text).toBe("Second paragraph\nstill second.");
    expect(ps[2]?.text).toBe("- a\n- b");
  });

  it("treats a bare heading as location metadata, not as a passage", () => {
    const ps = segmentPassages(
      "# Title\n\n## Degradation\n\nCells fade above 45 C.\n\n## Safety\n\nVent gas is flammable.",
    );
    expect(ps.map((p) => p.text)).toEqual(["Cells fade above 45 C.", "Vent gas is flammable."]);
    expect(ps[0]?.heading).toBe("Degradation");
    expect(ps[1]?.heading).toBe("Safety");
  });

  it("keeps fenced code together even with blank lines inside", () => {
    const ps = segmentPassages("```\nline 1\n\nline 2\n```\n\nAfter.");
    expect(ps).toHaveLength(2);
    expect(ps[0]?.text).toContain("line 2");
  });

  it("is deterministic and handles CRLF and empty input", () => {
    const a = segmentPassages("One.\r\n\r\nTwo.");
    expect(a.map((p) => p.text)).toEqual(["One.", "Two."]);
    expect(segmentPassages("")).toEqual([]);
    expect(segmentPassages("\n\n  \n")).toEqual([]);
    expect(segmentPassages("x\n\ny")).toEqual(segmentPassages("x\n\ny"));
  });

  it("records offsets that slice back to the passage text", () => {
    const body = "Alpha beta.\n\nGamma delta.";
    for (const p of segmentPassages(body)) {
      expect(body.slice(p.start, p.end).trim()).toBe(p.text);
    }
  });
});

describe("isPassageId", () => {
  it("accepts pN only", () => {
    expect(isPassageId("p1")).toBe(true);
    expect(isPassageId("p42")).toBe(true);
    for (const bad of ["p0", "p", "P1", "1", "p01", "p1; drop", "../p1", "p123456"]) {
      expect(isPassageId(bad)).toBe(false);
    }
  });
});

describe("quoteAppearsIn", () => {
  const passage = "The cell loses **20%** of capacity after 500 cycles — see [[aging-study]].";

  it("ignores case, markdown, wikilinks and dash/quote variants", () => {
    expect(quoteAppearsIn("loses 20% of capacity after 500 cycles", passage)).toBe(true);
    expect(quoteAppearsIn("500 cycles - see aging-study", passage)).toBe(true);
    expect(normalizeForQuote("It’s “fine”")).toBe("it's fine");
  });

  it("matches ellipsis gaps only when fragments appear in order", () => {
    expect(quoteAppearsIn("loses 20% ... 500 cycles", passage)).toBe(true);
    expect(quoteAppearsIn("500 cycles ... loses 20%", passage)).toBe(false);
  });

  it("ignores punctuation differences but never merges numbers", () => {
    const text = "Cobalt content in NMC cathodes drives cost; the price is 4.5 dollars (1,000 units).";
    expect(quoteAppearsIn("COBALT CONTENT in NMC cathodes — drives cost", text)).toBe(true);
    expect(quoteAppearsIn("cathodes, drives cost: the price is 4.5 dollars", text)).toBe(true);
    expect(quoteAppearsIn("the price is 45 dollars", text)).toBe(false);
    expect(quoteAppearsIn("1000 units", text)).toBe(false);
  });

  it("rejects text that is not there, and empty quotes", () => {
    expect(quoteAppearsIn("loses 30% of capacity", passage)).toBe(false);
    expect(quoteAppearsIn("   ", passage)).toBe(false);
    expect(quoteAppearsIn("...", passage)).toBe(false);
  });
});
