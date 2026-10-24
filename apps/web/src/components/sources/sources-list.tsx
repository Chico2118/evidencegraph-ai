"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type SourceItem = {
  id: string;
  filename: string;
  originalName: string | null;
  format: string;
  sizeBytes: number;
  addedAt: string;
  ingestedAt: string | null;
  url: string | null;
  title: string | null;
  pageCount: number;
};

// Format icons stay in plain text — easier on the eye than emoji for a
// reading-first product, and matches the rest of the app's chrome.
const FORMAT_LABEL: Record<string, string> = {
  markdown: "MD",
  text: "TXT",
  html: "HTML",
  url: "URL",
  pdf: "PDF",
  docx: "DOCX",
  pptx: "PPTX",
  xlsx: "XLSX",
  image: "IMG",
};

function relativeDate(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toISOString().slice(0, 10);
}

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

type Props = {
  // Bumping this from the parent forces a re-fetch after a successful ingest.
  refreshNonce: number;
};

export function SourcesList({ refreshNonce }: Props) {
  const [sources, setSources] = useState<SourceItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionFlash, setActionFlash] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [formatFilter, setFormatFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState<"all" | "processed" | "pending">("all");

  const fetchSources = useCallback(async () => {
    try {
      const res = await fetch("/api/sources", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { sources: SourceItem[] };
      setSources(data.sources);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await fetchSources();
      void cancelled;
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchSources, refreshNonce]);

  async function onRetry(s: SourceItem) {
    setBusyId(s.id);
    setActionFlash(null);
    setError(null);
    try {
      const res = await fetch(`/api/sources/${s.id}/retry`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        providerUsed?: string;
        modelUsed?: string;
        response?: {
          newPages: Array<{ slug: string; title: string }>;
          pageUpdates: Array<{ slug: string }>;
        };
      };
      if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const newN = json.response?.newPages.length ?? 0;
      const updN = json.response?.pageUpdates.length ?? 0;
      setActionFlash(
        `Ingested. ${newN} new page${newN === 1 ? "" : "s"}, ${updN} updated.`,
      );
      await fetchSources();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(s: SourceItem) {
    const label =
      s.title?.trim() || s.originalName?.trim() || s.url?.trim() || s.filename;
    const isPending = s.ingestedAt === null;
    const cascadeNote = s.pageCount > 0
      ? ` It contributed to ${s.pageCount} wiki page${s.pageCount === 1 ? "" : "s"} — those pages stay (with a dangling source reference that lint can clean up).`
      : "";
    const msg = isPending
      ? `Remove "${label}" (pending ingest)?\n\nThe raw file moves to .llm-wiki/trash/raw/ (recoverable for 30 days).`
      : `Remove "${label}"?${cascadeNote}\n\nThe raw file moves to .llm-wiki/trash/raw/ (recoverable for 30 days).`;
    if (!confirm(msg)) return;

    setBusyId(s.id);
    setActionFlash(null);
    setError(null);
    try {
      const res = await fetch(`/api/sources/${s.id}/delete`, { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setActionFlash(`Removed.`);
      await fetchSources();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  if (error && sources === null) {
    return (
      <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
        Could not load sources: {error}
      </p>
    );
  }

  if (sources === null) {
    return <p className="text-sm text-muted-foreground">Loading sources…</p>;
  }

  if (sources.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center">
        <p className="font-medium">Your library is empty</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Add an article, PDF, notes or a URL below. Each source is compiled into wiki pages, and every
          claim you later research can be traced back to it.
        </p>
      </div>
    );
  }

  // Newest first — most recent ingest is what the user usually wants to see.
  const sorted = [...sources].sort((a, b) =>
    a.addedAt < b.addedAt ? 1 : a.addedAt > b.addedAt ? -1 : 0,
  );

  const pendingCount = sources.filter((s) => s.ingestedAt === null).length;
  const formats = [...new Set(sources.map((s) => s.format))].sort();
  const needle = query.trim().toLowerCase();
  const visible = sorted.filter((s) => {
    if (formatFilter !== "all" && s.format !== formatFilter) return false;
    if (stateFilter === "pending" && s.ingestedAt !== null) return false;
    if (stateFilter === "processed" && s.ingestedAt === null) return false;
    if (!needle) return true;
    return [s.title, s.originalName, s.url, s.filename].some((v) => v?.toLowerCase().includes(needle));
  });

  return (
    <div className="space-y-3">
      {pendingCount > 0 ? (
        <p className="rounded-md border border-warn/30 bg-warn-soft px-3 py-2 text-xs text-warn">
          {pendingCount} source{pendingCount === 1 ? "" : "s"} pending — the
          first ingest didn't complete. Click <strong>Retry</strong> (uses the
          ingest model from Settings) or <strong>Delete</strong> to drop them.
        </p>
      ) : null}

      {actionFlash ? (
        <p role="status" className="rounded-md bg-ok-soft px-3 py-2 text-xs text-ok">
          {actionFlash}
        </p>
      ) : null}
      {error && sources !== null ? (
        <p role="alert" className="rounded-md bg-bad-soft px-3 py-2 text-xs text-bad">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[12rem] flex-1">
          <label htmlFor="library-search" className="block text-[11px] uppercase tracking-wider text-muted-foreground">
            Search library
          </label>
          <input
            id="library-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Title, filename or URL"
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div>
          <label htmlFor="library-format" className="block text-[11px] uppercase tracking-wider text-muted-foreground">
            Type
          </label>
          <select
            id="library-format"
            value={formatFilter}
            onChange={(e) => setFormatFilter(e.target.value)}
            className="mt-1 h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="all">All types</option>
            {formats.map((f) => (
              <option key={f} value={f}>
                {FORMAT_LABEL[f] ?? f.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="library-state" className="block text-[11px] uppercase tracking-wider text-muted-foreground">
            Status
          </label>
          <select
            id="library-state"
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value as typeof stateFilter)}
            className="mt-1 h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="all">All</option>
            <option value="processed">Processed</option>
            <option value="pending">Needs retry</option>
          </select>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground" aria-live="polite">
        Showing {visible.length} of {sources.length} source{sources.length === 1 ? "" : "s"}
      </p>

      {visible.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          No sources match these filters.{" "}
          <button
            type="button"
            className="text-primary underline underline-offset-2"
            onClick={() => {
              setQuery("");
              setFormatFilter("all");
              setStateFilter("all");
            }}
          >
            Clear filters
          </button>
        </p>
      ) : null}

      <ul className="divide-y divide-border">
        {visible.map((s) => {
          const label =
            s.title?.trim() ||
            s.originalName?.trim() ||
            s.url?.trim() ||
            s.filename;
          const formatBadge = FORMAT_LABEL[s.format] ?? s.format.toUpperCase();
          const isPending = s.ingestedAt === null;
          const isBusy = busyId === s.id;
          return (
            <li
              key={s.id}
              className="flex flex-wrap items-baseline justify-between gap-2 py-2.5"
            >
              <div className="min-w-0 flex-1">
                {/* Title area is a link to /sources/[id] — buttons sit
                    outside the link so clicks don't bubble. */}
                <Link
                  href={`/sources/${s.id}`}
                  prefetch
                  className="block min-w-0 hover:text-primary"
                >
                  <p className="truncate text-sm font-medium">{label}</p>
                </Link>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  <span className="font-mono">{formatBadge}</span>
                  {" · "}
                  {formatSize(s.sizeBytes)}
                  {" · added "}
                  {relativeDate(s.addedAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-[11px]">
                {isPending ? (
                  <>
                    <span className="rounded-full border border-warn/30 bg-warn-soft px-2 py-0.5 text-warn">
                      Ingest incomplete
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void onRetry(s)}
                      disabled={busyId !== null}
                    >
                      {isBusy ? "Retrying…" : "Retry"}
                    </Button>
                  </>
                ) : (
                  <span className="rounded-full border border-ok/30 bg-ok-soft px-2 py-0.5 text-ok">
                    Processed · {s.pageCount} page{s.pageCount === 1 ? "" : "s"}
                  </span>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void onDelete(s)}
                  disabled={busyId !== null}
                  title="Remove from the list. Raw file goes to .llm-wiki/trash/raw/."
                >
                  {isBusy && !isPending ? "Removing…" : "Delete"}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
