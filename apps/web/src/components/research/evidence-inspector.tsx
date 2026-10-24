"use client";

import Link from "next/link";
import { X } from "lucide-react";

import type { CitationCheck, ClaimEvidence } from "@evidencegraph/core";
import { CitationBadge, ClaimStateBadge, SupportBadge } from "@/components/research/badges";

// Builds the deep link used by the wiki page's passage highlighter.
function passageHref(slug: string, passageId: string | null, passageText: string | null): string {
  if (!passageId || !passageText) return `/wiki/${slug}`;
  const q = encodeURIComponent(passageText.slice(0, 80));
  return `/wiki/${slug}?passage=${passageId}&q=${q}`;
}

export function EvidenceInspector({
  claim,
  onClose,
}: {
  claim: ClaimEvidence | null;
  onClose: () => void;
}) {
  if (!claim) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-ui text-muted-foreground">
        <p className="font-medium text-foreground">Evidence inspector</p>
        <p className="mt-1">
          Select a claim to see the exact passages it cites, whether each citation resolves, and which
          sources the page was compiled from.
        </p>
      </div>
    );
  }

  const counted = claim.citations.filter((c) => !c.isDuplicate);

  return (
    <section aria-label="Evidence for the selected claim" className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-caption uppercase tracking-wider text-muted-foreground">
            Claim {claim.id.slice(1)}
            {claim.origin === "derived" ? " · split from answer text" : ""}
          </p>
          <p className="mt-1 font-serif text-body leading-snug">{claim.text}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden"
          aria-label="Close evidence inspector"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </header>

      <div className="flex flex-wrap gap-1.5">
        <ClaimStateBadge state={claim.evidenceState} />
        <SupportBadge support={claim.support} />
      </div>

      {counted.length === 0 ? (
        <div className="rounded-md border border-bad/30 bg-bad-soft p-4 text-ui text-bad">
          <p className="font-medium">No evidence cited</p>
          <p className="mt-1">
            The model made this claim without pointing at any page. Treat it as unsupported until you find a
            source for it.
          </p>
        </div>
      ) : (
        <ol className="space-y-3">
          {claim.citations.map((c, i) => (
            <li key={i}>
              <CitationCard check={c} />
            </li>
          ))}
        </ol>
      )}

      <p className="border-t border-border pt-3 text-caption normal-case tracking-normal text-muted-foreground">
        A valid citation only means the reference resolves to real text. It does not mean the passage
        supports the claim — read it and judge for yourself.
      </p>
    </section>
  );
}

function CitationCard({ check }: { check: CitationCheck }) {
  const r = check.resolved;
  const title = r?.pageTitle ?? (check.ref.page || "(no page given)");
  const location = [r?.passageId ?? check.ref.passage, r?.heading ? `section “${r.heading}”` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={"rounded-lg border bg-card p-3 " + (check.isDuplicate ? "opacity-60" : "border-border")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{title}</p>
          {location ? <p className="text-caption normal-case tracking-normal text-muted-foreground">{location}</p> : null}
        </div>
        <CitationBadge check={check} />
      </div>

      {check.issues.length > 0 ? (
        <ul className="mt-2 space-y-1 text-ui text-bad">
          {check.issues.map((issue) => (
            <li key={issue.code}>{issue.message}</li>
          ))}
        </ul>
      ) : null}

      {r?.passageText ? (
        <p className="mt-2 text-caption uppercase tracking-wider text-muted-foreground">
          {check.integrity === "valid" ? "Cited passage" : "Cited passage — as the page actually reads"}
        </p>
      ) : null}
      {r?.passageText ? (
        <blockquote
          className={
            "mt-1 whitespace-pre-wrap rounded-md border-l-2 bg-muted/50 p-3 font-serif text-ui " +
            (check.integrity === "valid" ? "border-ok" : "border-border")
          }
        >
          {r.passageText}
        </blockquote>
      ) : null}

      {check.ref.quote ? (
        <div className="mt-2 text-ui">
          <p className="text-caption uppercase tracking-wider text-muted-foreground">
            {check.integrity === "valid" ? "Quoted by the model — found in passage" : "Quoted by the model — not verified"}
          </p>
          <p className={"mt-0.5 italic " + (check.integrity === "valid" ? "" : "text-muted-foreground line-through decoration-1")}>
            “{check.ref.quote}”
          </p>
        </div>
      ) : null}

      {check.warnings.length > 0 ? (
        <ul className="mt-2 space-y-0.5 text-caption normal-case tracking-normal text-muted-foreground">
          {check.warnings.map((w) => (
            <li key={w.code}>• {w.message}</li>
          ))}
        </ul>
      ) : null}

      {r ? (
        <div className="mt-3 space-y-2 border-t border-border pt-2 text-ui">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {check.integrity === "valid" && r.passageId ? (
              <Link
                href={passageHref(r.pageSlug, r.passageId, r.passageText)}
                className="text-primary underline underline-offset-2"
              >
                Open passage in page →
              </Link>
            ) : null}
            <Link href={`/wiki/${r.pageSlug}`} className="text-primary underline underline-offset-2">
              Open page
            </Link>
          </div>
          <div>
            <p className="text-caption uppercase tracking-wider text-muted-foreground">Compiled from</p>
            {r.sources.length > 0 ? (
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {r.sources.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/sources/${s.id}`}
                      className="rounded-full border border-border bg-background px-2.5 py-0.5 text-xs hover:border-primary/40 hover:bg-accent"
                    >
                      {s.title} <span className="text-muted-foreground">· {s.format}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-0.5 text-muted-foreground">
                No raw source is linked to this page (it may have been written by hand or from a chat).
              </p>
            )}
          </div>
          {r.pageUpdated ? (
            <p className="text-caption normal-case tracking-normal text-muted-foreground">
              Page last updated {r.pageUpdated}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
