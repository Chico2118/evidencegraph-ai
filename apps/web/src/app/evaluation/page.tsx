import {
  HELDOUT_FIRST_RUN,
  loadHeldoutFixtures,
  METRIC_DEFINITIONS,
  runDeterministicEval,
  type EvalReport,
  type Metric,
  type RetrievalVariant,
} from "@evidencegraph/eval";

import { PageContainer, PageHeader } from "@/components/page-shell";

export const dynamic = "force-dynamic";

export const metadata = { title: "Evaluation lab" };

function pct(m: Metric): string {
  return m.value === null ? "n/a" : `${(m.value * 100).toFixed(1)}%`;
}

function frac(m: Metric): string {
  return `${m.numerator}/${m.denominator}`;
}

// Runs the deterministic suite on every request: it is in-memory, offline and
// takes milliseconds, so what you see is always the current code's behavior.
export default function EvaluationPage() {
  const r = runDeterministicEval();
  const heldNow = runDeterministicEval(loadHeldoutFixtures());
  const heldFirst = HELDOUT_FIRST_RUN;
  const f = r.fixtures;
  const cv = r.citationValidation;
  const ct = r.contradictions;

  return (
    <PageContainer width="lg">
      <PageHeader
        eyebrow="Evaluation lab"
        title="Measured, not claimed"
        description="A reproducible benchmark for the parts of the pipeline that can be checked without a model: retrieval, citation integrity, contradiction detection. Every number shows the sample behind it."
      />

      <div
        role="note"
        className="mb-8 rounded-lg border border-warn/30 bg-warn-soft p-4 text-ui text-warn"
      >
        <p className="font-medium">Read these numbers as a regression guard, not as accuracy.</p>
        <p className="mt-1">
          The corpus is synthetic ({f.corpusPages} pages, {f.corpusPassages} passages), the {f.answerableQuestions + f.unanswerableQuestions}{" "}
          questions and all labels were written by one person, and the system was adjusted after the first run (see below). Model-behavior metrics (does a
          real model cite correctly? does it abstain?) are <strong>not measured here</strong>: they need live mode with a model.
        </p>
      </div>

      <Section title="Retrieval" subtitle="Which pages come back for a question? Baseline is the inherited search; improved removes stop-words, ORs the terms and ranks with bm25.">
        <Compare
          title="Natural-language questions"
          baseline={r.retrieval.naturalLanguage.baseline}
          improved={r.retrieval.naturalLanguage.improved}
        />
        <Compare title="Keyword queries" baseline={r.retrieval.keyword.baseline} improved={r.retrieval.keyword.improved} />
        <p className="mt-3 text-ui text-muted-foreground">
          Passage Recall@3 (improved retriever): <strong>{pct(r.retrieval.improvedPassageRecallAt3)}</strong> ({frac(r.retrieval.improvedPassageRecallAt3)}).
          Caveat: the inherited pipeline also handed the model the full wiki index, so it could sometimes find pages the search step missed. This table
          measures the search step alone.
        </p>
      </Section>

      <Section title="Citation integrity" subtitle="Does a citation resolve to real text? Hand-labeled citations, including fabricated quotes, wrong passages, deleted pages and path-traversal slugs.">
        <Table
          head={["Metric", "Baseline (slug exists)", "Validator"]}
          rows={[
            ["Integrity accuracy", `${pct(cv.baseline.accuracy)} (${frac(cv.baseline.accuracy)})`, `${pct(cv.improved.accuracy)} (${frac(cv.improved.accuracy)})`],
            ["Bad citations flagged", `${pct(cv.baseline.problemDetectionRate)} (${frac(cv.baseline.problemDetectionRate)})`, `${pct(cv.improved.problemDetectionRate)} (${frac(cv.improved.problemDetectionRate)})`],
            ["Good citations wrongly flagged", `${pct(cv.baseline.falseAlarmRate)} (${frac(cv.baseline.falseAlarmRate)})`, `${pct(cv.improved.falseAlarmRate)} (${frac(cv.improved.falseAlarmRate)})`],
          ]}
        />
        <p className="mt-3 text-ui text-muted-foreground">
          Known blind spot: {cv.semanticBlindSpots} labeled citation resolves correctly but does not support its claim. An integrity check cannot catch that —
          it is the difference between a <em>valid</em> citation and a <em>supporting</em> one. These cases are hand-written failure modes; they show what the validator
          is built to catch, not how often real models fail.
        </p>
      </Section>

      <Section title="Abstention signal" subtitle="Can retrieval alone tell that the wiki probably does not cover a question?">
        <Table
          head={["Rule", "Accuracy", "Answerable kept", "Unanswerable detected"]}
          rows={[
            ["Baseline: abstain if the inherited search is empty", `${pct(r.abstentionSignal.baseline.accuracy)}`, `${frac(r.abstentionSignal.baseline.answerableKept)}`, `${frac(r.abstentionSignal.baseline.unanswerableDetected)}`],
            ...r.abstentionSignal.sensitivity.map((s) => [
              `Improved: best page covers ≥ ${s.threshold} of question terms${s.threshold === r.abstentionSignal.threshold ? " (chosen in advance)" : ""}`,
              pct(s.accuracy),
              frac(s.answerableKept),
              frac(s.unanswerableDetected),
            ]),
          ]}
        />
        <p className="mt-3 text-ui text-muted-foreground">
          Only 20 questions: the swing between thresholds shows how fragile this is. It is a signal for future work, not a gate in the product.
        </p>
      </Section>

      <Section title="Contradiction candidates" subtitle="Does the local detector surface the passage pairs a reviewer would want to see?">
        <Table
          head={["Metric", "Value"]}
          rows={[
            ["Gold conflicts found (recall)", `${pct(ct.recall)} (${frac(ct.recall)})`],
            ["Precision against gold", `${pct(ct.precision)} (${frac(ct.precision)})`],
            ["Known non-conflicts wrongly flagged", `${pct(ct.knownNonConflictsFlagged)} (${frac(ct.knownNonConflictsFlagged)})`],
          ]}
        />
        {ct.flaggedNonConflicts.length > 0 ? (
          <p className="mt-3 text-ui text-muted-foreground">
            Still flagged although a reviewer would dismiss it: {ct.flaggedNonConflicts.join("; ")} (liquid vs air cooling — different subjects with similar wording).
            This is why every candidate is a <em>possible</em> conflict awaiting human review.
          </p>
        ) : null}
      </Section>

      <Section
        title="Held-out set"
        subtitle="A second, separate benchmark written after development stopped, in a different domain (urban transit), and run once before any fix. It shows how far the development numbers above carry."
      >
        <Table
          head={["Measure", "Held-out, first run (frozen)", "Held-out, after fixes", "Development set"]}
          rows={heldRows(heldFirst, heldNow, r)}
        />
        <ul className="mt-3 list-disc space-y-1 pl-5 text-ui text-muted-foreground">
          <li>
            Sample: {heldFirst.fixtures.corpusPages} pages, {heldFirst.fixtures.answerableQuestions} answerable + {heldFirst.fixtures.unanswerableQuestions} unanswerable
            questions, {heldFirst.fixtures.labeledCitations} labeled citations, {heldFirst.fixtures.goldContradictions} gold contradictions. About a third of the questions paraphrase the page
            wording on purpose. Fixture files are hash-pinned; the first-run record is pinned too. It is held out from tuning, but it is <strong>not an independent benchmark</strong>: its author also built the system.
          </li>
          <li>
            <strong>The first run found two real defects</strong> (no handling of word endings, so &ldquo;fares&rdquo; missed &ldquo;fare-free&rdquo;; and &ldquo;the 2019 level&rdquo; parsed as a
            quantity). Both were fixed, which is why the &ldquo;after fixes&rdquo; column is no longer held-out for them. The fix slightly lowered the development
            set&apos;s keyword Recall@1 (73.3% to 66.7%, one question) while raising the held-out natural-language Recall@3 (95.5% to 100%).
          </li>
          <li>
            <strong>Not fixed, on purpose:</strong> two conflicts are still missed because they need synonyms (&ldquo;neighbouring&rdquo; vs &ldquo;surrounding&rdquo;) or a word the detector does
            not know (&ldquo;cheaper&rdquo; vs &ldquo;more expensive&rdquo;). Adding words after seeing them would be tuning on the test.
          </li>
          <li>
            The abstention signal fell from 100% to 80% held-out: its 0.5 threshold did not generalize, which confirms it should not be used as a gate.
          </li>
          <li>Citation integrity is 100% on 160 labeled citations, but those cases are constructed from the failure types the validator was designed for, so this is a completeness check, not a measure of how often real models fail.</li>
        </ul>
      </Section>

      <Section title="What changed after the first run" subtitle="The benchmark was run once before any fix. Then two defects it exposed were fixed. The labels were not held out, so the post-fix numbers are optimistic.">
        <ul className="list-disc space-y-1 pl-5 text-ui">
          <li>
            Validator: a good quote that differed from the page only by an inserted dash was rejected (integrity accuracy 95.8%, one false alarm). Quote matching now ignores
            punctuation but never merges numbers (<code>4.5</code> ≠ <code>45</code>). Result: 100% on the same labels.
          </li>
          <li>
            Contradiction detector: recall was 3/5. A 6% numeric gap in near-identical sentences was ignored, and a clause joined by <code>;</code> diluted the match. Near-identical
            wording now flags any differing number, and clauses are split on semicolons. Result: 5/5, with one known false positive remaining.
          </li>
          <li>
            The frozen first-run output is kept in the repository as <code>packages/eval/results/first-run.md</code>.
          </li>
        </ul>
      </Section>

      <Section title="Metric definitions" subtitle="What each number means, its denominator, and how it is produced.">
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-ui">
            <thead className="bg-muted/60 text-caption uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Metric</th>
                <th className="px-3 py-2">Definition</th>
                <th className="px-3 py-2">Denominator</th>
                <th className="px-3 py-2">Produced by</th>
              </tr>
            </thead>
            <tbody>
              {METRIC_DEFINITIONS.map((d) => (
                <tr key={d.name} className="border-t border-border align-top">
                  <th scope="row" className="px-3 py-2 font-medium">{d.name}</th>
                  <td className="px-3 py-2">{d.definition}</td>
                  <td className="px-3 py-2 text-muted-foreground">{d.denominator}</td>
                  <td className="px-3 py-2 text-muted-foreground">{d.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Limitations" subtitle="">
        <ul className="list-disc space-y-1 pl-5 text-ui">
          {r.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <p className="mt-4 text-ui text-muted-foreground">
          Reproduce: <code>pnpm eval</code> (deterministic, offline) · <code>pnpm eval:check</code> (fails if results drift) · live mode:{" "}
          <code>OPENROUTER_API_KEY=… pnpm eval --live --model &lt;slug&gt;</code>. Live mode sends the fixture questions to your model provider.
        </p>
      </Section>
    </PageContainer>
  );
}

function heldRows(first: EvalReport, now: EvalReport, dev: EvalReport): string[][] {
  const f = (m: Metric) => `${pct(m)} (${frac(m)})`;
  const row = (label: string, pick: (r: EvalReport) => Metric) => [label, f(pick(first)), f(pick(now)), f(pick(dev))];
  return [
    row("Retrieval Recall@3, natural-language", (r) => r.retrieval.naturalLanguage.improved.recallAt["@3"] as Metric),
    row("Retrieval Recall@1, natural-language", (r) => r.retrieval.naturalLanguage.improved.recallAt["@1"] as Metric),
    row("Retrieval Recall@1, keyword", (r) => r.retrieval.keyword.improved.recallAt["@1"] as Metric),
    row("Passage Recall@3", (r) => r.retrieval.improvedPassageRecallAt3),
    row("Abstention signal accuracy (0.5)", (r) => r.abstentionSignal.improved.accuracy),
    row("Citation integrity accuracy", (r) => r.citationValidation.improved.accuracy),
    row("Contradiction recall", (r) => r.contradictions.recall),
    row("Contradiction precision", (r) => r.contradictions.precision),
    ["Baseline Recall@3, natural-language", f(first.retrieval.naturalLanguage.baseline.recallAt["@3"] as Metric), f(now.retrieval.naturalLanguage.baseline.recallAt["@3"] as Metric), f(dev.retrieval.naturalLanguage.baseline.recallAt["@3"] as Metric)],
    ["Baseline citation integrity (slug exists)", f(first.citationValidation.baseline.accuracy), f(now.citationValidation.baseline.accuracy), f(dev.citationValidation.baseline.accuracy)],
  ];
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="font-display text-h2 font-semibold tracking-tight">{title}</h2>
      {subtitle ? <p className="mt-1 max-w-2xl text-ui text-muted-foreground">{subtitle}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-ui">
        <thead className="bg-muted/60 text-caption uppercase tracking-wider text-muted-foreground">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="px-3 py-2">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]} className="border-t border-border">
              {row.map((c, i) =>
                i === 0 ? (
                  <th key={i} scope="row" className="px-3 py-2 font-medium">
                    {c}
                  </th>
                ) : (
                  <td key={i} className="px-3 py-2 tabular-nums">
                    {c}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Compare({ title, baseline, improved }: { title: string; baseline: RetrievalVariant; improved: RetrievalVariant }) {
  const rows: string[][] = [
    ...["@1", "@3", "@5"].map((k) => [
      `Recall${k}`,
      `${pct(baseline.recallAt[k] as Metric)} (${frac(baseline.recallAt[k] as Metric)})`,
      `${pct(improved.recallAt[k] as Metric)} (${frac(improved.recallAt[k] as Metric)})`,
    ]),
    ["MRR", (baseline.mrr.value ?? 0).toFixed(3), (improved.mrr.value ?? 0).toFixed(3)],
  ];
  return (
    <div className="mb-5">
      <h3 className="mb-2 text-caption font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      <Table head={["Metric", "Baseline", "Improved"]} rows={rows} />
    </div>
  );
}
