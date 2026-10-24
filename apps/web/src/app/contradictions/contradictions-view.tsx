"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { ClaimSide, ReviewStatus, ReviewedCandidate } from "@evidencegraph/core";

import { PageHeader } from "@/components/page-shell";
import { Badge } from "@/components/research/badges";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Scan = { candidates: ReviewedCandidate[]; pagesScanned: number; pagesSkipped: number };
type Filter = "all" | ReviewStatus;

const STATUS_LABEL: Record<ReviewStatus, string> = {
  unreviewed: "Unreviewed",
  confirmed_contradiction: "Confirmed contradiction",
  explained_difference: "Explained difference",
  not_a_conflict: "Not a conflict",
};

const STATUS_TONE: Record<ReviewStatus, "neutral" | "bad" | "ok" | "warn"> = {
  unreviewed: "warn",
  confirmed_contradiction: "bad",
  explained_difference: "ok",
  not_a_conflict: "neutral",
};

const STRENGTH_LABEL = { high: "Strong signal", medium: "Moderate signal", low: "Weak signal" } as const;

const REASON_LABEL = {
  numeric_mismatch: "Numbers differ",
  negation_mismatch: "One side negated",
  opposite_terms: "Opposite terms",
} as const;

function statusOf(c: ReviewedCandidate): ReviewStatus {
  return c.review?.status ?? "unreviewed";
}

export function ContradictionsView() {
  const [scan, setScan] = useState<Scan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/contradictions", { cache: "no-store" });
      const json = (await res.json()) as Scan & { ok?: boolean; error?: string };
      if (!res.ok || json.ok === false) throw new Error(json.error ?? `HTTP ${res.status}`);
      setScan(json);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      all: 0,
      unreviewed: 0,
      confirmed_contradiction: 0,
      explained_difference: 0,
      not_a_conflict: 0,
    };
    for (const cand of scan?.candidates ?? []) {
      c.all++;
      c[statusOf(cand)]++;
    }
    return c;
  }, [scan]);

  const visible = (scan?.candidates ?? []).filter((c) => filter === "all" || statusOf(c) === filter);

  async function review(id: string, status: ReviewStatus, note: string) {
    const res = await fetch("/api/contradictions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, status, note }),
    });
    const json = (await res.json()) as { ok: boolean; error?: string; review?: ReviewedCandidate["review"] };
    if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
    setScan((prev) =>
      prev
        ? {
            ...prev,
            candidates: prev.candidates.map((c) =>
              c.id === id ? { ...c, review: status === "unreviewed" ? null : (json.review ?? null) } : c,
            ),
          }
        : prev,
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8 sm:px-6">
      <PageHeader
        eyebrow="Review"
        title="Potential contradictions"
        description="Passages that may disagree. These are candidates, not verdicts: a flag can reflect a different date, scope or definition. Only your review can mark one as a confirmed contradiction."
        actions={
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            {loading ? "Scanning…" : "Rescan"}
          </Button>
        }
      />

      <p className="mb-6 text-ui text-muted-foreground">
        Detection is deterministic and runs locally — no model call, no cost. It compares sentences across
        your wiki pages and flags same-topic pairs whose numbers, negation or wording conflict.
      </p>

      {error ? (
        <div role="alert" className="rounded-md border border-bad/30 bg-bad-soft px-3 py-2 text-sm text-bad">
          {error}
        </div>
      ) : null}

      {loading && !scan ? (
        <div className="space-y-3" role="status" aria-label="Scanning wiki pages">
          <div className="h-32 animate-pulse rounded-lg bg-muted" />
          <div className="h-32 animate-pulse rounded-lg bg-muted" />
        </div>
      ) : null}

      {scan ? (
        <>
          <div role="tablist" aria-label="Filter by review status" className="mb-5 flex flex-wrap gap-2">
            {(["all", "unreviewed", "confirmed_contradiction", "explained_difference", "not_a_conflict"] as Filter[]).map((f) => (
              <button
                key={f}
                role="tab"
                aria-selected={filter === f}
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-full border px-3 py-1 text-ui",
                  filter === f ? "border-primary bg-accent-soft text-foreground" : "border-border hover:bg-accent",
                )}
              >
                {f === "all" ? "All" : STATUS_LABEL[f]} <span className="text-muted-foreground">({counts[f]})</span>
              </button>
            ))}
          </div>

          {scan.pagesScanned === 0 ? (
            <Empty
              title="No pages to compare yet"
              body="Add a source in the Library; once the wiki has pages, candidates will appear here."
              href="/sources"
              cta="Open Library →"
            />
          ) : scan.candidates.length === 0 ? (
            <Empty
              title="No potential contradictions found"
              body={`Scanned ${scan.pagesScanned} page${scan.pagesScanned === 1 ? "" : "s"}. That means no same-topic sentences with conflicting numbers or negation were found — not that the wiki is free of contradictions. Subtle or paraphrased conflicts are not detected.`}
            />
          ) : visible.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-ui text-muted-foreground">
              Nothing in this view.
            </p>
          ) : (
            <ul className="space-y-5">
              {visible.map((c) => (
                <li key={c.id}>
                  <CandidateCard candidate={c} onReview={review} />
                </li>
              ))}
            </ul>
          )}
          {scan.pagesSkipped > 0 ? (
            <p className="mt-4 text-caption normal-case tracking-normal text-muted-foreground">
              {scan.pagesSkipped} page{scan.pagesSkipped === 1 ? "" : "s"} could not be read and{" "}
              {scan.pagesSkipped === 1 ? "was" : "were"} skipped.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function Empty({ title, body, href, cta }: { title: string; body: string; href?: string; cta?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-8 text-center">
      <p className="font-display text-h3 font-semibold">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-ui text-muted-foreground">{body}</p>
      {href && cta ? (
        <Link href={href} className="mt-4 inline-block text-ui text-primary underline underline-offset-2">
          {cta}
        </Link>
      ) : null}
    </div>
  );
}

function CandidateCard({
  candidate: c,
  onReview,
}: {
  candidate: ReviewedCandidate;
  onReview: (id: string, status: ReviewStatus, note: string) => Promise<void>;
}) {
  const status = statusOf(c);
  const [note, setNote] = useState(c.review?.note ?? "");
  const [busy, setBusy] = useState<ReviewStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function choose(next: ReviewStatus) {
    setBusy(next);
    setErr(null);
    try {
      await onReview(c.id, next, note);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="rounded-lg border border-border bg-card p-4 sm:p-5" aria-label="Potential contradiction">
      <header className="flex flex-wrap items-center gap-2">
        <Badge tone="warn">Possible conflict</Badge>
        <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
        <span className="text-xs text-muted-foreground">{STRENGTH_LABEL[c.strength]}</span>
      </header>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Side label="Claim A" side={c.a} />
        <Side label="Claim B" side={c.b} />
      </div>

      <div className="mt-4 rounded-md bg-muted/50 p-3 text-ui">
        <p className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">Why this was flagged</p>
        <ul className="mt-1 space-y-1">
          {c.reasons.map((r) => (
            <li key={r.code}>
              <span className="font-medium">{REASON_LABEL[r.code]}:</span> {r.message}
            </li>
          ))}
        </ul>
        {c.contextNotes.length > 0 ? (
          <>
            <p className="mt-3 text-caption font-semibold uppercase tracking-wider text-muted-foreground">
              Differences that might explain it
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {c.contextNotes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </>
        ) : null}
      </div>

      <fieldset className="mt-4" disabled={busy !== null}>
        <legend className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">Your review</legend>
        <label className="mt-2 block text-ui" htmlFor={`note-${c.id}`}>
          Note (optional)
        </label>
        <Textarea
          id={`note-${c.id}`}
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Lab setting vs fleet data — both are correct."
          maxLength={2000}
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant={status === "confirmed_contradiction" ? "default" : "outline"} onClick={() => void choose("confirmed_contradiction")}>
            Confirm contradiction
          </Button>
          <Button size="sm" variant={status === "explained_difference" ? "default" : "outline"} onClick={() => void choose("explained_difference")}>
            Different scope or date
          </Button>
          <Button size="sm" variant={status === "not_a_conflict" ? "default" : "outline"} onClick={() => void choose("not_a_conflict")}>
            Not a conflict
          </Button>
          {status !== "unreviewed" ? (
            <Button size="sm" variant="ghost" onClick={() => void choose("unreviewed")}>
              Reset
            </Button>
          ) : null}
        </div>
        {c.review ? (
          <p className="mt-2 text-xs text-muted-foreground">Reviewed {c.review.reviewedAt.slice(0, 16).replace("T", " ")}</p>
        ) : null}
        {err ? (
          <p role="alert" className="mt-2 text-sm text-bad">
            {err}
          </p>
        ) : null}
      </fieldset>
    </article>
  );
}

function Side({ label, side }: { label: string; side: ClaimSide }) {
  const href = `/wiki/${side.pageSlug}?passage=${side.passageId}&q=${encodeURIComponent(side.passageText.slice(0, 80))}`;
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-serif text-body leading-snug">{side.statement}</p>
      <p className="mt-2 text-ui">
        <Link href={`/wiki/${side.pageSlug}`} className="font-medium text-primary underline underline-offset-2">
          {side.pageTitle}
        </Link>{" "}
        <span className="text-muted-foreground">
          · {side.passageId}
          {side.heading ? ` · ${side.heading}` : ""}
          {side.pageUpdated ? ` · updated ${side.pageUpdated}` : ""}
        </span>
      </p>
      <Link href={href} className="mt-1 inline-block text-ui text-primary underline underline-offset-2">
        Open original passage →
      </Link>
    </div>
  );
}
