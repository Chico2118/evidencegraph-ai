// Generates heldout/citation-cases.json from heldout/corpus.json.
//
// Every label is fixed BY CONSTRUCTION (a quote copied verbatim is valid; the
// same quote with one number changed is a fabrication; a quote moved to a
// different passage number is a wrong-passage citation, and so on). None of
// them depend on what the validator answers, and none were adjusted after
// seeing validator output.
//
//   node packages/eval/fixtures/heldout/generate-citation-cases.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const corpus = JSON.parse(readFileSync(join(HERE, "corpus.json"), "utf8"));
const passagesOf = (slug) => corpus.pages.find((p) => p.slug === slug).content.split("\n\n");

// Passages chosen because they contain a number (so a number-swap fabrication
// is possible) and cover several pages.
const BASES = [
  ["bus-rapid-transit", 1], ["bus-rapid-transit", 2], ["bus-rapid-transit", 3],
  ["light-rail", 1], ["light-rail", 2], ["fare-policy", 1], ["electric-buses", 2],
  ["bike-lanes", 1], ["congestion-pricing", 1], ["transit-oriented-development", 1],
  ["accessibility", 1], ["ridership-recovery", 1], ["signal-priority", 1], ["maintenance-costs", 3],
];

const NUM = /\d[\d,.]*\d|\d/;

/** A 7-word window that contains the first number in the passage. */
function windowAroundNumber(text) {
  const words = text.replace(/[.]$/, "").split(" ");
  const at = words.findIndex((w) => NUM.test(w));
  const start = Math.max(0, Math.min(at - 3, words.length - 7));
  return words.slice(start, start + 7);
}

function bumpNumber(quote) {
  return quote.replace(NUM, (m) => String(Math.round(Number(m.replace(/,/g, "")) + 7)));
}

const cases = [];
const expectedState = (expected) => (expected === "valid" ? "all_citations_valid" : "no_valid_citations");

for (const [slug, k] of BASES) {
  const passages = passagesOf(slug);
  const words = windowAroundNumber(passages[k - 1]);
  const Q = words.join(" ");
  const n = passages.length;
  const other = (k % n) + 1; // a different, existing passage of the same page

  const items = [
    ["exact quote", { page: slug, passage: `p${k}`, quote: Q }, "valid"],
    [
      "case and punctuation changed",
      { page: slug, passage: `p${k}`, quote: Q.toUpperCase().split(" ").map((w, i) => (i % 3 === 2 ? `${w},` : w)).join(" ") + "." },
      "valid",
    ],
    ["ellipsis gap", { page: slug, passage: `p${k}`, quote: `${words.slice(0, 3).join(" ")} ... ${words.slice(-3).join(" ")}` }, "valid"],
    ["page level only", { page: slug }, "valid"],
    ["quote only, no passage id", { page: slug, quote: Q }, "valid"],
    ["one number changed in the quote", { page: slug, passage: `p${k}`, quote: bumpNumber(Q) }, "invalid"],
    ["one word replaced in the quote", { page: slug, passage: `p${k}`, quote: Q.replace(words.reduce((a, b) => (b.length > a.length ? b : a)), "unrelated") }, "invalid"],
    ["real quote, wrong passage id", { page: slug, passage: `p${other}`, quote: Q }, "invalid"],
    ["passage id past the end", { page: slug, passage: `p${n + 3}`, quote: Q }, "invalid"],
    ["page that does not exist", { page: `ghost-${slug}`, passage: `p${k}`, quote: Q }, "unavailable"],
    ["path traversal slug", { page: `../${slug}`, passage: `p${k}` }, "invalid"],
  ];

  const claims = items.map(([label, citation]) => ({ text: `${label} (${slug} p${k}).`, citations: [citation] }));
  const labels = items.map(([, , expected], i) => ({ claim: i, citation: 0, expected }));
  const states = items.map(([, , expected]) => expectedState(expected));
  const anyValid = items.some(([, , e]) => e === "valid");
  const allValid = items.every(([, , e]) => e === "valid");

  cases.push({
    id: `h-${slug}-p${k}`,
    description: `Eleven constructed citations against ${slug} p${k}.`,
    claims,
    labels,
    claimStates: states,
    verdict: allValid ? "all_claims_verified" : anyValid ? "some_claims_unverified" : "no_valid_evidence",
  });
}

// Pages deleted after the answer was produced.
for (const slug of ["bus-rapid-transit", "fare-policy", "bike-lanes", "accessibility", "maintenance-costs"]) {
  const Q = windowAroundNumber(passagesOf(slug)[0]).join(" ");
  cases.push({
    id: `h-deleted-${slug}`,
    description: `A correct citation to ${slug}, whose page has since been deleted.`,
    removePages: [slug],
    claims: [{ text: `Citation to a page that was deleted (${slug}).`, citations: [{ page: slug, passage: "p1", quote: Q }] }],
    labels: [{ claim: 0, citation: 0, expected: "unavailable" }],
    claimStates: ["no_valid_citations"],
    verdict: "no_valid_evidence",
  });
}

// Abstention and an uncited claim, for claim- and verdict-level checks.
cases.push({ id: "h-abstention", description: "An honest non-answer: no claims.", claims: [], labels: [], claimStates: [], verdict: "no_claims" });
cases.push({
  id: "h-uncited",
  description: "A claim with no citation next to a valid one.",
  claims: [
    { text: "Valid.", citations: [{ page: "bike-lanes", passage: "p1", quote: "linked to a 28 percent drop in cyclist" }] },
    { text: "Uncited.", citations: [] },
  ],
  labels: [{ claim: 0, citation: 0, expected: "valid" }],
  claimStates: ["all_citations_valid", "no_evidence"],
  verdict: "some_claims_unverified",
});

writeFileSync(
  join(HERE, "citation-cases.json"),
  JSON.stringify(
    {
      note: "HELD-OUT. Generated by generate-citation-cases.mjs from corpus.json; every label is fixed by construction, not by validator output.",
      cases,
    },
    null,
    2,
  ) + "\n",
);
console.log(`${cases.length} cases, ${cases.reduce((n, c) => n + c.labels.length, 0)} labeled citations`);
