import { AlertTriangle, CheckCircle2, CircleHelp, MinusCircle, XCircle, type LucideIcon } from "lucide-react";

import type {
  CitationCheck,
  ClaimEvidenceState,
  EvidenceReport,
  SupportAssessment,
} from "@evidencegraph/core";
import { cn } from "@/lib/utils";

// Citation and claim statuses are communicated by icon + words + color, never color alone.

type Tone = "ok" | "warn" | "bad" | "neutral";

const TONE: Record<Tone, string> = {
  ok: "border-ok/30 bg-ok-soft text-ok",
  warn: "border-warn/30 bg-warn-soft text-warn",
  bad: "border-bad/30 bg-bad-soft text-bad",
  neutral: "border-border bg-muted text-muted-foreground",
};

export function Badge({
  tone,
  icon: Icon,
  children,
  title,
  className,
}: {
  tone: Tone;
  icon?: LucideIcon;
  children: React.ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium",
        TONE[tone],
        className,
      )}
    >
      {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
      {children}
    </span>
  );
}

export function CitationBadge({ check }: { check: CitationCheck }) {
  if (check.integrity === "valid") {
    return (
      <Badge
        tone="ok"
        icon={CheckCircle2}
        title="The page and passage exist, and any quoted text appears in the passage. This does not mean the passage supports the claim."
      >
        {check.granularity === "page" ? "Valid citation · page level" : "Valid citation"}
      </Badge>
    );
  }
  if (check.integrity === "unavailable") {
    return (
      <Badge tone="warn" icon={AlertTriangle} title="The cited page is missing or unreadable.">
        Evidence unavailable
      </Badge>
    );
  }
  return (
    <Badge tone="bad" icon={XCircle} title="The citation does not resolve to the page text.">
      Invalid citation
    </Badge>
  );
}

const CLAIM_STATE: Record<ClaimEvidenceState, { tone: Tone; label: string; icon: LucideIcon }> = {
  all_citations_valid: { tone: "ok", label: "Citations valid", icon: CheckCircle2 },
  some_citations_valid: { tone: "warn", label: "Partly verified", icon: AlertTriangle },
  no_valid_citations: { tone: "bad", label: "No valid citation", icon: XCircle },
  no_evidence: { tone: "bad", label: "No evidence cited", icon: XCircle },
};

export function ClaimStateBadge({ state }: { state: ClaimEvidenceState }) {
  const s = CLAIM_STATE[state];
  return (
    <Badge tone={s.tone} icon={s.icon}>
      {s.label}
    </Badge>
  );
}

export function SupportBadge({ support }: { support: SupportAssessment }) {
  if (support.status === "not_assessed") {
    return (
      <Badge
        tone="neutral"
        icon={CircleHelp}
        title="Whether the passage actually backs the claim has not been judged. Read the passage."
      >
        Support not assessed
      </Badge>
    );
  }
  const label = { supported: "Support: yes", contradicted: "Contradicted", inconclusive: "Inconclusive" }[
    support.status
  ];
  return (
    <Badge tone={support.status === "supported" ? "ok" : support.status === "contradicted" ? "bad" : "neutral"} icon={MinusCircle}>
      {label} ({support.basis})
    </Badge>
  );
}

const VERDICT: Record<EvidenceReport["verdict"], { tone: Tone; icon: LucideIcon; title: string }> = {
  all_claims_verified: { tone: "ok", icon: CheckCircle2, title: "Every claim has citations that resolve" },
  some_claims_unverified: { tone: "warn", icon: AlertTriangle, title: "Some claims lack a valid citation" },
  no_valid_evidence: { tone: "bad", icon: XCircle, title: "No claim has a citation that resolves" },
  no_claims: { tone: "neutral", icon: MinusCircle, title: "No factual claims to check" },
};

export function VerdictBanner({ report }: { report: EvidenceReport }) {
  const v = VERDICT[report.verdict];
  const s = report.summary;
  const rate = s.citationResolutionRate === null ? null : Math.round(s.citationResolutionRate * 100);
  return (
    <div
      role="status"
      className={cn("rounded-lg border p-4", TONE[v.tone])}
    >
      <div className="flex flex-wrap items-center gap-2 font-medium">
        <v.icon className="h-4 w-4 shrink-0" aria-hidden />
        <span>{v.title}</span>
      </div>
      <p className="mt-1 text-ui opacity-90">
        {s.claims === 0
          ? "The answer made no checkable factual claims."
          : `${s.claimsWithValidEvidence} of ${s.claims} claims have at least one valid citation` +
            (rate === null ? "." : `; ${s.validCitations} of ${s.citations} citations resolve (${rate}%).`)}
      </p>
      {report.confidenceMismatch ? (
        <p className="mt-1 text-ui">
          The model reported <strong>high</strong> confidence, but not every claim is backed by a valid
          citation. Self-reported confidence is not evidence.
        </p>
      ) : null}
      <p className="mt-1 text-caption normal-case tracking-normal opacity-80">
        Checks citation integrity only: whether each reference resolves to real page text. Whether a passage
        truly supports its claim is not judged.
      </p>
    </div>
  );
}
