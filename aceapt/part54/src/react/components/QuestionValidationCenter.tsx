import { useMemo, useState } from "react";

/**
 * Design note (see /mnt/skills/public/frontend-design/SKILL.md, applied here):
 * subject is a reviewer's inspection instrument, not a marketing dashboard — the
 * signature visual is a "Validation Circuit": each validator is a node on a
 * trace, current (a lit line) flows through PASSing nodes and goes dark at the
 * first blocking failure, ending in a stamped seal for the overall verdict.
 * This is Feature 54's answer to the one-bespoke-SVG-per-feature pattern used
 * throughout this series (Feature 4's elevation trail, Feature 28's Evidence
 * Stack, Feature 42's Capability Skyline, Skill Signal's calibration
 * instrument, Feature 35's evidence gauge) — chosen because "does the signal
 * make it all the way through the pipeline" is literally what Feature 54 answers.
 */

const tokens = {
  ink: "#14181C",
  paper: "#F7F5F0",
  paperRaised: "#FFFFFF",
  pass: "#1F7A5C",
  warn: "#B8860B",
  fail: "#A6303E",
  traceDark: "#C9C2B4",
  line: "#DAD4C6",
  muted: "#6B6558",
  sans: 'ui-sans-serif, "Inter", "Helvetica Neue", system-ui, sans-serif',
  mono: 'ui-monospace, "SF Mono", "Menlo", "Consolas", monospace'
};

export type UIValidationState = "PASS" | "PASS_WITH_WARNING" | "FAIL" | "ERROR" | "SKIPPED" | "NOT_APPLICABLE";
export type UISeverity = "NONE" | "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface UIValidationResult {
  validator: string;
  category: string;
  status: UIValidationState;
  severity: UISeverity;
  code: string;
  message: string;
  evidence: Record<string, unknown>;
  validatorVersion: string;
  durationMs: number;
}

export interface UIValidationRun {
  questionId: string;
  versionId: string;
  versionNumber: number;
  overallStatus: "VALID" | "VALID_WITH_WARNINGS" | "REVIEW_REQUIRED" | "INVALID" | "VALIDATION_ERROR" | "STALE";
  results: UIValidationResult[];
  eligibility: { practice: boolean; timed: boolean; assessment: boolean };
}

function nodeColor(status: UIValidationState): string {
  if (status === "PASS") return tokens.pass;
  if (status === "PASS_WITH_WARNING") return tokens.warn;
  if (status === "FAIL" || status === "ERROR") return tokens.fail;
  return tokens.traceDark; // SKIPPED / NOT_APPLICABLE — never reached meaningfully
}

function overallColor(status: UIValidationRun["overallStatus"]): string {
  if (status === "VALID") return tokens.pass;
  if (status === "VALID_WITH_WARNINGS" || status === "REVIEW_REQUIRED") return tokens.warn;
  return tokens.fail; // INVALID / VALIDATION_ERROR / STALE
}

function overallLabel(status: UIValidationRun["overallStatus"]): string {
  switch (status) {
    case "VALID":
      return "Valid";
    case "VALID_WITH_WARNINGS":
      return "Valid, with warnings";
    case "REVIEW_REQUIRED":
      return "Needs review";
    case "INVALID":
      return "Blocked";
    case "VALIDATION_ERROR":
      return "Could not verify";
    case "STALE":
      return "Out of date";
  }
}

/** The signature visual: a vertical trace through every validator node, lit
 *  up to (and including) the first blocking failure, dark beyond it. */
function ValidationCircuit({ results, selected, onSelect }: { results: UIValidationResult[]; selected: string | null; onSelect: (name: string) => void }) {
  const rowHeight = 46;
  const width = 280;
  const height = results.length * rowHeight + 24;
  const cx = 34;

  let litUntilIndex = results.length - 1;
  const firstBlockIndex = results.findIndex((r) => r.status === "FAIL" || r.status === "ERROR");
  if (firstBlockIndex !== -1) litUntilIndex = firstBlockIndex;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label="Validation circuit trace">
      {results.map((r, i) => {
        const y = 24 + i * rowHeight;
        const isLit = i <= litUntilIndex;
        const isLast = i === results.length - 1;
        const traceColor = isLit ? nodeColor(results[Math.min(i, litUntilIndex)]!.status) : tokens.traceDark;
        return (
          <g key={r.validator}>
            {!isLast && <line x1={cx} y1={y} x2={cx} y2={y + rowHeight} stroke={i < litUntilIndex ? tokens.pass : tokens.traceDark} strokeWidth={3} />}
            <circle
              cx={cx}
              cy={y}
              r={9}
              fill={isLit ? nodeColor(r.status) : tokens.paper}
              stroke={isLit ? nodeColor(r.status) : tokens.traceDark}
              strokeWidth={2}
              style={{ cursor: "pointer" }}
              onClick={() => onSelect(r.validator)}
            />
            {selected === r.validator && <circle cx={cx} cy={y} r={13} fill="none" stroke={tokens.ink} strokeWidth={1.5} />}
            <text x={cx + 22} y={y + 4} fontFamily={tokens.mono} fontSize={12} fill={isLit ? tokens.ink : tokens.muted} style={{ cursor: "pointer", userSelect: "none" }} onClick={() => onSelect(r.validator)}>
              {formatValidatorLabel(r.validator)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function formatValidatorLabel(name: string): string {
  return name.replace(/_VALIDATOR$/, "").replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());
}

function EligibilityLamp({ label, on }: { label: string; on: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: on ? tokens.pass : tokens.traceDark, display: "inline-block" }} />
      <span style={{ fontFamily: tokens.sans, fontSize: 13, color: on ? tokens.ink : tokens.muted }}>{label}</span>
    </div>
  );
}

function EvidencePanel({ result }: { result: UIValidationResult | null }) {
  if (!result) {
    return (
      <div style={{ fontFamily: tokens.sans, color: tokens.muted, fontSize: 14, padding: "8px 4px" }}>
        Select a validator on the trace to see what it checked and what it found.
      </div>
    );
  }
  const hasEvidence = Object.keys(result.evidence ?? {}).length > 0;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <h3 style={{ fontFamily: tokens.sans, fontSize: 16, fontWeight: 600, color: tokens.ink, margin: 0 }}>{formatValidatorLabel(result.validator)}</h3>
        <span style={{ fontFamily: tokens.mono, fontSize: 11, color: tokens.muted }}>v{result.validatorVersion}</span>
      </div>
      <div style={{ display: "inline-block", fontFamily: tokens.mono, fontSize: 11, color: "#fff", background: nodeColor(result.status), borderRadius: 3, padding: "2px 8px", marginBottom: 10 }}>
        {result.status}
        {result.severity !== "NONE" ? ` · ${result.severity}` : ""}
      </div>
      <p style={{ fontFamily: tokens.sans, fontSize: 14, color: tokens.ink, lineHeight: 1.5, margin: "0 0 10px" }}>{result.message}</p>
      <div style={{ fontFamily: tokens.mono, fontSize: 11, color: tokens.muted, marginBottom: 10 }}>{result.code}</div>
      {hasEvidence && (
        <pre
          style={{
            fontFamily: tokens.mono,
            fontSize: 12,
            background: tokens.paper,
            border: `1px solid ${tokens.line}`,
            borderRadius: 4,
            padding: 12,
            overflowX: "auto",
            color: tokens.ink,
            margin: 0
          }}
        >
          {JSON.stringify(result.evidence, null, 2)}
        </pre>
      )}
    </div>
  );
}

export interface QuestionValidationCenterProps {
  run: UIValidationRun;
  onRevalidate?: () => void;
  revalidating?: boolean;
}

export default function QuestionValidationCenter({ run, onRevalidate, revalidating }: QuestionValidationCenterProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const selectedResult = useMemo(() => run.results.find((r) => r.validator === selected) ?? null, [run.results, selected]);

  return (
    <div style={{ background: tokens.paper, padding: 24, fontFamily: tokens.sans, color: tokens.ink, borderRadius: 6, maxWidth: 760 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: tokens.mono, fontSize: 12, color: tokens.muted, marginBottom: 2 }}>
            {run.questionId} · v{run.versionNumber}
          </div>
          <h2 style={{ fontFamily: tokens.sans, fontSize: 20, fontWeight: 700, margin: 0 }}>Question validation</h2>
        </div>
        <button
          onClick={onRevalidate}
          disabled={revalidating}
          style={{
            fontFamily: tokens.sans,
            fontSize: 13,
            fontWeight: 600,
            padding: "8px 14px",
            borderRadius: 4,
            border: `1px solid ${tokens.ink}`,
            background: revalidating ? tokens.line : tokens.paperRaised,
            color: tokens.ink,
            cursor: revalidating ? "default" : "pointer"
          }}
        >
          {revalidating ? "Checking…" : "Revalidate"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 24 }}>
        <div>
          <ValidationCircuit results={run.results} selected={selected} onSelect={setSelected} />
          <div
            style={{
              marginTop: 8,
              padding: "10px 14px",
              borderRadius: 4,
              border: `1.5px solid ${overallColor(run.overallStatus)}`,
              color: overallColor(run.overallStatus),
              fontFamily: tokens.mono,
              fontSize: 13,
              fontWeight: 600,
              textAlign: "center"
            }}
          >
            {overallLabel(run.overallStatus)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16, paddingTop: 16, borderTop: `1px solid ${tokens.line}` }}>
            <EligibilityLamp label="Practice" on={run.eligibility.practice} />
            <EligibilityLamp label="Timed challenge" on={run.eligibility.timed} />
            <EligibilityLamp label="Formal assessment" on={run.eligibility.assessment} />
          </div>
        </div>
        <div style={{ background: tokens.paperRaised, border: `1px solid ${tokens.line}`, borderRadius: 6, padding: 16 }}>
          <EvidencePanel result={selectedResult} />
        </div>
      </div>
    </div>
  );
}
