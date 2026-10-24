// Loads the pages a response cited and runs the pure validator over them.
// All filesystem and SQLite access for evidence checking lives here, so
// `evidence.ts` stays free of I/O and trivially testable.

import type { Db } from "./db";
import { getSource } from "./db-sources";
import { listSourceIdsForPage } from "./db-pages";
import {
  collectCitedSlugs,
  deriveClaimsFromAnswer,
  parseRawClaims,
  validateEvidence,
  type CorpusPage,
  type EvidenceCorpus,
  type EvidenceReport,
  type EvidenceSourceRef,
} from "./evidence";
import { segmentPassages } from "./passages";
import type { QueryResponse } from "./schema";
import { readPage } from "./wiki";

const SAFE_SLUG_RE = /^[a-z0-9-]{1,100}$/;

function sourcesForPage(db: Db, slug: string): EvidenceSourceRef[] {
  const refs: EvidenceSourceRef[] = [];
  for (const id of listSourceIdsForPage(db, slug)) {
    const row = getSource(db, id);
    if (!row) continue; // source deleted since ingest; lineage row is stale
    refs.push({
      id: row.id,
      title: row.title?.trim() || row.original_name?.trim() || row.filename,
      format: row.format,
    });
  }
  return refs;
}

/**
 * Reads each slug from disk. Slugs are re-checked against the safe pattern
 * here as well — `readPage` joins the slug into a path, so this is the last
 * line of defence against path traversal from model-supplied values.
 */
export async function loadEvidenceCorpus(
  wikiPath: string,
  db: Db,
  slugs: string[],
): Promise<EvidenceCorpus> {
  const corpus = new Map<string, CorpusPage | null | "unreadable">();
  await Promise.all(
    slugs.map(async (slug) => {
      if (!SAFE_SLUG_RE.test(slug)) {
        corpus.set(slug, null);
        return;
      }
      try {
        const page = await readPage(wikiPath, slug);
        corpus.set(slug, {
          slug,
          title: page.frontmatter.title,
          updated: page.frontmatter.updated,
          passages: segmentPassages(page.content),
          sources: sourcesForPage(db, slug),
        });
      } catch (err) {
        corpus.set(slug, (err as NodeJS.ErrnoException).code === "ENOENT" ? null : "unreadable");
      }
    }),
  );
  return corpus;
}

/**
 * Builds the evidence report for a query response. Uses the model's
 * structured `claims` when present; otherwise derives page-level claims from
 * the answer's `[[slug]]` links so older/limited models still get checked.
 */
export async function verifyQueryResponse(opts: {
  wikiPath: string;
  db: Db;
  response: Pick<QueryResponse, "answer" | "pagesUsed" | "confidence" | "claims">;
}): Promise<EvidenceReport> {
  const { response } = opts;
  const parsed = parseRawClaims(response.claims);
  const useModelClaims = parsed.claims.length > 0;
  let claims = useModelClaims ? parsed.claims : deriveClaimsFromAnswer(response.answer);

  // A low-confidence answer that cites nothing and uses no pages is the
  // model declining to answer ("the wiki doesn't cover this"). Flagging that
  // sentence as an "unsupported claim" would punish honest abstention. A
  // confident answer with no citations is NOT exempt — that is the risk.
  const looksLikeAbstention =
    !useModelClaims &&
    response.confidence === "low" &&
    response.pagesUsed.length === 0 &&
    claims.every((c) => c.citations.length === 0);
  if (looksLikeAbstention) claims = [];

  const slugs = collectCitedSlugs(claims, response.pagesUsed);
  const corpus = await loadEvidenceCorpus(opts.wikiPath, opts.db, slugs);

  return validateEvidence({
    claims,
    malformed: parsed.malformed,
    origin: useModelClaims ? "model" : "derived",
    pagesUsed: response.pagesUsed,
    modelConfidence: response.confidence,
    corpus,
  });
}
