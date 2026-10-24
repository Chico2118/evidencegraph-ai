// Evidence layer: claim-level citations and deterministic citation-integrity
// checks.
//
// Two different questions, kept deliberately separate:
//
//   1. Citation INTEGRITY — does the citation resolve? Page exists, passage
//      exists, any quoted text really appears there. Decided here,
//      deterministically, with no model involved.
//   2. Semantic SUPPORT — does the passage actually back the claim? That needs
//      judgment. This module never decides it; every claim reports
//      `support.status === "not_assessed"`. The union also has room for
//      human/model verdicts so the UI contract does not change when an
//      evaluated assessor is added later.
//
// A valid citation is therefore never presented as proof that a claim is true.

import { z } from "zod";

import { isPassageId, quoteAppearsIn, normalizeForQuote, type Passage } from "./passages";

// ---- public types ---------------------------------------------------------

export type CitationIntegrity = "valid" | "invalid" | "unavailable";

export type CitationIssueCode =
  | "malformed_citation"
  | "invalid_slug"
  | "invalid_passage_id"
  | "page_not_found"
  | "page_unreadable"
  | "passage_not_found"
  | "quote_not_found"
  | "quote_found_in_other_passage";

export type CitationWarningCode =
  | "page_level_only"
  | "passage_inferred_from_quote"
  | "quote_too_short"
  | "duplicate_citation";

export type CitationIssue = { code: CitationIssueCode; message: string };
export type CitationWarning = { code: CitationWarningCode; message: string };

/** Raw citation exactly as supplied (after coercion to strings). Never trusted. */
export type CitationRef = {
  page: string;
  passage?: string;
  quote?: string;
};

export type EvidenceSourceRef = {
  id: string;
  title: string;
  format: string;
};

export type ResolvedEvidence = {
  pageSlug: string;
  pageTitle: string;
  pageUpdated: string | null;
  /** Null when the citation is page-level (no passage given or inferable). */
  passageId: string | null;
  passageText: string | null;
  heading: string | null;
  /** Raw sources the cited wiki page was compiled from (lineage). */
  sources: EvidenceSourceRef[];
};

export type CitationCheck = {
  ref: CitationRef;
  integrity: CitationIntegrity;
  issues: CitationIssue[];
  warnings: CitationWarning[];
  granularity: "passage" | "page" | null;
  resolved: ResolvedEvidence | null;
  isDuplicate: boolean;
};

export type SupportStatus = "not_assessed" | "supported" | "contradicted" | "inconclusive";

export type SupportAssessment = {
  status: SupportStatus;
  /** Who produced the verdict. "none" for the default, unassessed state. */
  basis: "none" | "human" | "model";
};

export type ClaimEvidenceState =
  /** The claim cites nothing. */
  | "no_evidence"
  /** Every (non-duplicate) citation resolves. */
  | "all_citations_valid"
  /** At least one citation resolves and at least one does not. */
  | "some_citations_valid"
  /** Citations were given but none resolve. */
  | "no_valid_citations";

export type ClaimEvidence = {
  id: string;
  text: string;
  /** "model": the model returned structured claims. "derived": split from the answer text. */
  origin: "model" | "derived";
  citations: CitationCheck[];
  evidenceState: ClaimEvidenceState;
  support: SupportAssessment;
};

export type MalformedClaim = { index: number; reason: string };

export type EvidenceVerdict =
  /** The answer made no checkable claims (e.g. an honest "the wiki doesn't cover this"). */
  | "no_claims"
  | "all_claims_verified"
  | "some_claims_unverified"
  | "no_valid_evidence";

export type EvidenceSummary = {
  claims: number;
  claimsWithValidEvidence: number;
  claimsWithoutValidEvidence: number;
  citations: number;
  validCitations: number;
  invalidCitations: number;
  unavailableCitations: number;
  duplicateCitations: number;
  /** valid / (valid + invalid + unavailable); null when there are no citations. */
  citationResolutionRate: number | null;
};

export type PagesUsedCheck = {
  slug: string;
  status: "exists" | "missing" | "unreadable";
  citedByClaim: boolean;
};

export type EvidenceReport = {
  claims: ClaimEvidence[];
  malformedClaims: MalformedClaim[];
  pagesUsed: PagesUsedCheck[];
  summary: EvidenceSummary;
  verdict: EvidenceVerdict;
  /** True when the model reported "high" confidence but not every claim is verified. */
  confidenceMismatch: boolean;
};

// ---- corpus (pre-loaded, so validation stays pure) -------------------------

export type CorpusPage = {
  slug: string;
  title: string;
  updated: string | null;
  passages: Passage[];
  sources: EvidenceSourceRef[];
};

/** `null` = page does not exist; "unreadable" = exists but could not be parsed. */
export type EvidenceCorpus = ReadonlyMap<string, CorpusPage | null | "unreadable">;

// ---- model-facing claim shape ----------------------------------------------

const LooseCitationSchema = z.object({
  page: z.string(),
  passage: z.string().nullish(),
  quote: z.string().nullish(),
});

const LooseClaimSchema = z.object({
  text: z.string(),
  citations: z.array(z.unknown()).default([]),
});

/** A claim as the model returned it: `text` is validated, citations are checked later, one by one. */
export type RawClaim = { text: string; citations: unknown[] };

const SLUG_RE = /^[a-z0-9-]{1,100}$/;
const MIN_VERIFIABLE_QUOTE_CHARS = 12;
const MAX_CLAIM_TEXT_CHARS = 1000;
const MAX_QUOTE_CHARS = 1000;

/**
 * Splits an untrusted `claims` value into well-formed raw claims and a list of
 * entries that could not be used. Never throws, so one bad entry cannot hide
 * the rest of the answer.
 */
export function parseRawClaims(value: unknown): { claims: RawClaim[]; malformed: MalformedClaim[] } {
  if (value === undefined || value === null) return { claims: [], malformed: [] };
  if (!Array.isArray(value)) {
    return { claims: [], malformed: [{ index: 0, reason: "`claims` is not an array" }] };
  }
  const claims: RawClaim[] = [];
  const malformed: MalformedClaim[] = [];
  value.forEach((entry, index) => {
    const parsed = LooseClaimSchema.safeParse(entry);
    if (!parsed.success) {
      malformed.push({ index, reason: "claim is not an object with a string `text`" });
      return;
    }
    const text = parsed.data.text.trim();
    if (text.length === 0) {
      malformed.push({ index, reason: "claim text is empty" });
      return;
    }
    claims.push({ text: text.slice(0, MAX_CLAIM_TEXT_CHARS), citations: parsed.data.citations });
  });
  return { claims, malformed };
}

// ---- derived claims (fallback when the model returned no structure) --------

const WIKILINK_RE = /\[\[([a-z0-9-]+)(?:\|[^\]]+)?\]\]/g;

/**
 * Heuristically splits an answer into claim-sized sentences and turns each
 * `[[slug]]` in a sentence into a page-level citation. This is a fallback for
 * models that ignore the structured `claims` field; the report marks these
 * claims `origin: "derived"` so the UI can say so.
 */
export function deriveClaimsFromAnswer(answer: string): RawClaim[] {
  const claims: RawClaim[] = [];
  for (const line of answer.replace(/\r\n/g, "\n").split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || /^#{1,6}\s/.test(trimmed) || /^```/.test(trimmed)) continue;
    const body = trimmed.replace(/^([-*+]|\d+[.)])\s+/, "");
    const sentences = body.split(/(?<=[.!?])\s+(?=[A-Z[`"'(])/);
    for (const sentence of sentences) {
      const text = sentence.trim();
      const words = text.replace(WIKILINK_RE, "").split(/\s+/).filter(Boolean);
      if (words.length < 4) continue;
      const slugs = [...new Set([...text.matchAll(WIKILINK_RE)].map((m) => m[1] ?? ""))].filter(Boolean);
      claims.push({
        text: text.slice(0, MAX_CLAIM_TEXT_CHARS),
        citations: slugs.map((page) => ({ page })),
      });
    }
  }
  return claims;
}

/** Slugs that need to be loaded to validate these claims and `pagesUsed`. Invalid slugs are excluded. */
export function collectCitedSlugs(claims: RawClaim[], pagesUsed: string[]): string[] {
  const slugs = new Set<string>();
  for (const claim of claims) {
    for (const c of claim.citations) {
      const parsed = LooseCitationSchema.safeParse(c);
      if (parsed.success && SLUG_RE.test(parsed.data.page)) slugs.add(parsed.data.page);
    }
  }
  for (const s of pagesUsed) if (SLUG_RE.test(s)) slugs.add(s);
  return [...slugs];
}

// ---- the validator ---------------------------------------------------------

export function checkCitation(rawCitation: unknown, corpus: EvidenceCorpus): CitationCheck {
  const parsed = LooseCitationSchema.safeParse(rawCitation);
  if (!parsed.success) {
    return invalidCheck({ page: "" }, [
      { code: "malformed_citation", message: "Citation is not an object with a string `page`." },
    ]);
  }

  const ref: CitationRef = { page: parsed.data.page.trim() };
  const passageInput = parsed.data.passage?.trim();
  const quoteInput = parsed.data.quote?.trim();
  if (passageInput) ref.passage = passageInput;
  if (quoteInput) ref.quote = quoteInput.slice(0, MAX_QUOTE_CHARS);

  // Slug and passage id formats are checked before any lookup: the slug
  // later becomes a file name, so only [a-z0-9-] may ever reach the loader.
  if (!SLUG_RE.test(ref.page)) {
    return invalidCheck(ref, [
      { code: "invalid_slug", message: "Page reference is not a valid kebab-case slug." },
    ]);
  }
  if (ref.passage !== undefined && !isPassageId(ref.passage)) {
    return invalidCheck(ref, [
      { code: "invalid_passage_id", message: `"${ref.passage}" is not a passage id like p3.` },
    ]);
  }

  const entry = corpus.get(ref.page);
  if (entry === undefined || entry === null) {
    return {
      ref,
      integrity: "unavailable",
      issues: [
        {
          code: "page_not_found",
          message: "The cited page does not exist (it may have been deleted or never existed).",
        },
      ],
      warnings: [],
      granularity: null,
      resolved: null,
      isDuplicate: false,
    };
  }
  if (entry === "unreadable") {
    return {
      ref,
      integrity: "unavailable",
      issues: [{ code: "page_unreadable", message: "The cited page exists but could not be read." }],
      warnings: [],
      granularity: null,
      resolved: null,
      isDuplicate: false,
    };
  }

  const page = entry;
  const issues: CitationIssue[] = [];
  const warnings: CitationWarning[] = [];

  let passage: Passage | null = null;
  if (ref.passage !== undefined) {
    passage = page.passages.find((p) => p.id === ref.passage) ?? null;
    if (!passage) {
      issues.push({
        code: "passage_not_found",
        message: `Page "${page.title}" has no passage ${ref.passage} (it has ${page.passages.length}).`,
      });
    }
  }

  if (ref.quote !== undefined) {
    const normalizedLength = normalizeForQuote(ref.quote).replace(/\.\.\./g, "").length;
    if (passage) {
      if (!quoteAppearsIn(ref.quote, passage.text)) {
        const elsewhere = page.passages.find((p) => p.id !== passage?.id && quoteAppearsIn(ref.quote ?? "", p.text));
        issues.push(
          elsewhere
            ? {
                code: "quote_found_in_other_passage",
                message: `The quoted text is not in ${passage.id}; it appears in ${elsewhere.id}.`,
              }
            : { code: "quote_not_found", message: `The quoted text does not appear in ${passage.id}.` },
        );
      } else if (normalizedLength < MIN_VERIFIABLE_QUOTE_CHARS) {
        warnings.push({ code: "quote_too_short", message: "The quote is too short to be meaningful evidence." });
      }
    } else if (ref.passage === undefined) {
      // No passage given: let a verifiable quote locate it.
      const located = page.passages.find((p) => quoteAppearsIn(ref.quote ?? "", p.text));
      if (located) {
        passage = located;
        warnings.push({
          code: "passage_inferred_from_quote",
          message: `No passage was cited; the quote was found in ${located.id}.`,
        });
        if (normalizedLength < MIN_VERIFIABLE_QUOTE_CHARS) {
          warnings.push({ code: "quote_too_short", message: "The quote is too short to be meaningful evidence." });
        }
      } else {
        issues.push({ code: "quote_not_found", message: "The quoted text does not appear anywhere on the cited page." });
      }
    }
    // passage id given but not found: the passage_not_found issue already stands.
  }

  if (issues.length > 0) {
    return {
      ref,
      integrity: "invalid",
      issues,
      warnings,
      granularity: null,
      // Keep the cited passage when it exists, so the UI can show what the
      // page really says next to the claim it was wrongly cited for.
      resolved: resolvedFrom(page, passage),
      isDuplicate: false,
    };
  }

  if (!passage) {
    warnings.push({
      code: "page_level_only",
      message: "Cited at page level; no specific passage or quote identifies the supporting text.",
    });
  }

  return {
    ref,
    integrity: "valid",
    issues,
    warnings,
    granularity: passage ? "passage" : "page",
    resolved: resolvedFrom(page, passage),
    isDuplicate: false,
  };
}

function invalidCheck(ref: CitationRef, issues: CitationIssue[]): CitationCheck {
  return { ref, integrity: "invalid", issues, warnings: [], granularity: null, resolved: null, isDuplicate: false };
}

function resolvedFrom(page: CorpusPage, passage: Passage | null): ResolvedEvidence {
  return {
    pageSlug: page.slug,
    pageTitle: page.title,
    pageUpdated: page.updated,
    passageId: passage?.id ?? null,
    passageText: passage?.text ?? null,
    heading: passage?.heading ?? null,
    sources: page.sources,
  };
}

function citationKey(check: CitationCheck): string {
  return [check.ref.page, check.ref.passage ?? "", normalizeForQuote(check.ref.quote ?? "")].join("|");
}

function claimStateFor(citations: CitationCheck[]): ClaimEvidenceState {
  const counted = citations.filter((c) => !c.isDuplicate);
  if (counted.length === 0) return "no_evidence";
  const valid = counted.filter((c) => c.integrity === "valid").length;
  if (valid === counted.length) return "all_citations_valid";
  if (valid === 0) return "no_valid_citations";
  return "some_citations_valid";
}

export type BuildReportInput = {
  claims: RawClaim[];
  malformed?: MalformedClaim[];
  origin: "model" | "derived";
  pagesUsed: string[];
  modelConfidence?: "high" | "medium" | "low";
  corpus: EvidenceCorpus;
};

/** Validates every citation and assembles the report the UI renders. Pure. */
export function validateEvidence(input: BuildReportInput): EvidenceReport {
  const claims: ClaimEvidence[] = input.claims.map((raw, i) => {
    const seen = new Set<string>();
    const citations = raw.citations.map((c) => {
      const check = checkCitation(c, input.corpus);
      const key = citationKey(check);
      if (seen.has(key)) {
        check.isDuplicate = true;
        check.warnings.push({
          code: "duplicate_citation",
          message: "This exact citation already appears on the same claim.",
        });
      }
      seen.add(key);
      return check;
    });
    return {
      id: `c${i + 1}`,
      text: raw.text,
      origin: input.origin,
      citations,
      evidenceState: claimStateFor(citations),
      support: { status: "not_assessed", basis: "none" },
    };
  });

  const counted = claims.flatMap((c) => c.citations.filter((x) => !x.isDuplicate));
  const validCitations = counted.filter((c) => c.integrity === "valid").length;
  const invalidCitations = counted.filter((c) => c.integrity === "invalid").length;
  const unavailableCitations = counted.filter((c) => c.integrity === "unavailable").length;
  const claimsWithValidEvidence = claims.filter(
    (c) => c.evidenceState === "all_citations_valid" || c.evidenceState === "some_citations_valid",
  ).length;

  const summary: EvidenceSummary = {
    claims: claims.length,
    claimsWithValidEvidence,
    claimsWithoutValidEvidence: claims.length - claimsWithValidEvidence,
    citations: counted.length,
    validCitations,
    invalidCitations,
    unavailableCitations,
    duplicateCitations: claims.reduce((n, c) => n + c.citations.filter((x) => x.isDuplicate).length, 0),
    citationResolutionRate: counted.length === 0 ? null : validCitations / counted.length,
  };

  const everyClaimFullyValid =
    claims.length > 0 && claims.every((c) => c.evidenceState === "all_citations_valid");
  const verdict: EvidenceVerdict =
    claims.length === 0
      ? "no_claims"
      : everyClaimFullyValid
        ? "all_claims_verified"
        : claimsWithValidEvidence === 0
          ? "no_valid_evidence"
          : "some_claims_unverified";

  const citedSlugs = new Set(counted.map((c) => c.ref.page));
  const pagesUsed: PagesUsedCheck[] = [...new Set(input.pagesUsed)].map((slug) => {
    const entry = SLUG_RE.test(slug) ? input.corpus.get(slug) : null;
    return {
      slug,
      status: entry === "unreadable" ? "unreadable" : entry ? "exists" : "missing",
      citedByClaim: citedSlugs.has(slug),
    };
  });

  return {
    claims,
    malformedClaims: input.malformed ?? [],
    pagesUsed,
    summary,
    verdict,
    confidenceMismatch:
      input.modelConfidence === "high" && verdict !== "all_claims_verified" && verdict !== "no_claims",
  };
}
