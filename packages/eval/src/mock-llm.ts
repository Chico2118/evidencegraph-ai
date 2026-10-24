// A deterministic stand-in for a language model, used ONLY for demos and
// offline end-to-end tests of the query -> verify pipeline.
//
// It is not a language model. It reads the numbered passages that the real
// query prompt contains, picks the passage that best overlaps the question,
// and answers by quoting it. Nothing it does says anything about how a real
// LLM behaves.
//
//   "faithful": cites only real passages with exact quotes.
//   "flawed":   adds the failure modes the evidence layer exists to catch —
//               a fabricated quote, a citation to a page that does not
//               exist, and an uncited claim — with a confident "high" label,
//               so the UI's warning states can be seen without a paid model.

import { extractQueryTerms, termCoverage } from "@evidencegraph/core";

export type MockMode = "faithful" | "flawed";

type ParsedPassage = { page: string; title: string; id: string; text: string };

const PAGE_RE = /^### (.+?) \(slug: ([a-z0-9-]+), type: [a-z]+\)$/;
const PASSAGE_RE = /^\[(p\d+)\](?: \(section: [^)]*\))? (.+)$/;

export function parsePromptPassages(system: string): ParsedPassage[] {
  const out: ParsedPassage[] = [];
  let current: { title: string; slug: string } | null = null;
  for (const line of system.split("\n")) {
    const page = PAGE_RE.exec(line);
    if (page) {
      current = { title: page[1] ?? "", slug: page[2] ?? "" };
      continue;
    }
    const passage = PASSAGE_RE.exec(line);
    if (passage && current) out.push({ page: current.slug, title: current.title, id: passage[1] ?? "", text: passage[2] ?? "" });
  }
  return out;
}

export function parseQuestion(user: string): string {
  return user.replace(/^User question:\s*/i, "").trim();
}

function firstWords(text: string, n: number): string {
  return text.replace(/[*_`#>]/g, "").split(/\s+/).slice(0, n).join(" ");
}

/** Returns the JSON object a model would be asked to produce (QueryResponse shape). */
export function mockQueryResponse(system: string, user: string, mode: MockMode): Record<string, unknown> {
  const question = parseQuestion(user);
  const terms = extractQueryTerms(question);
  const passages = parsePromptPassages(system);
  const scored = passages
    .map((p) => ({ p, score: termCoverage(terms, p.text) }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0];

  if (!best || best.score < 0.5) {
    return {
      answer: "The wiki does not contain enough information to answer this question.",
      pagesUsed: [],
      claims: [],
      suggestedNewPage: null,
      confidence: "low",
      caveats: ["No retrieved passage covered the question's key terms."],
    };
  }

  const quote = firstWords(best.p.text, 14);
  const claims: Array<Record<string, unknown>> = [
    { text: best.p.text.replace(/[*_`#>]/g, ""), citations: [{ page: best.p.page, passage: best.p.id, quote }] },
  ];
  let answer = `${best.p.text} [[${best.p.page}]]`;
  const pagesUsed = [best.p.page];

  if (mode === "flawed") {
    claims.push({
      text: "This finding holds in every operating condition.",
      citations: [{ page: best.p.page, passage: best.p.id, quote: "this finding holds in every operating condition without exception" }],
    });
    claims.push({
      text: "Independent replication confirmed the result.",
      citations: [{ page: "independent-replication-study", passage: "p1" }],
    });
    claims.push({ text: "Practitioners widely agree with this.", citations: [] });
    answer += "\n\nThis finding holds in every operating condition. Independent replication confirmed the result. Practitioners widely agree with this.";
    pagesUsed.push("independent-replication-study");
  }

  return {
    answer,
    pagesUsed,
    claims,
    suggestedNewPage: null,
    confidence: mode === "flawed" ? "high" : "medium",
    caveats: mode === "flawed" ? [] : ["Answer quotes a single retrieved passage."],
  };
}
