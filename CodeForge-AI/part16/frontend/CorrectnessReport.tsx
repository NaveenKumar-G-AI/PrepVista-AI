import React from "react";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Sparkles,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
} from "lucide-react";

/**
 * ============================================================================
 * DESIGN TOKENS — override these to match CodeForge's real design system.
 * Kept as a single object (rather than scattered Tailwind arbitrary values)
 * so re-theming this component into an existing product is a one-place
 * edit, not a find-and-replace across the file.
 * ============================================================================
 *
 * Rationale for the palette (see design brief in commit message / PR):
 *  - "Verified" (deterministic evidence) and "AI Analysis" (inference) use
 *    DIFFERENT hue families on purpose — teal vs indigo — so trust level is
 *    encoded visually, not just in a label, per the spec's TRUST UI
 *    requirement. Nothing in this file lets an AI-derived value render
 *    inside a "Verified" block or vice versa — that separation is
 *    structural in the component tree below, mirroring the same
 *    separation enforced in the backend (ai.result is never authoritative).
 */
const tokens = {
  surface: "#FAFAF9",
  card: "#FFFFFF",
  border: "#E4E4E0",
  textPrimary: "#1C1C1A",
  textMuted: "#6B6B65",
  verified: { fg: "#0E6B5C", bg: "#EAF6F3", border: "#BFE4DC" },
  analysis: { fg: "#4C3FB6", bg: "#F1EFFC", border: "#D8D3F5" },
  warning: { fg: "#8A5A00", bg: "#FDF3E0", border: "#F0DBA8" },
  danger: { fg: "#A32B1E", bg: "#FBEAE7", border: "#F0C4BC" },
  mono: "ui-monospace, SFMono-Regular, 'IBM Plex Mono', Menlo, monospace",
  sans: "'Inter', ui-sans-serif, system-ui, sans-serif",
};

type ConfidenceLevel = "LOW" | "MEDIUM" | "HIGH";
type CorrectnessStatus =
  | "UNKNOWN"
  | "LIKELY_CORRECT"
  | "PARTIALLY_VALIDATED"
  | "LIKELY_INCORRECT"
  | "DEFINITIVELY_INCORRECT"
  | "ACCEPTED";

export interface CorrectnessReportData {
  status: CorrectnessStatus;
  confidence: ConfidenceLevel;
  deterministic: {
    summary: string;
    passed: number;
    failed: number;
    totalAvailable: number;
    clusters: Array<{ id: string; sharedTags: string[]; hypothesis: string; observedFact: string; testIds: string[] }>;
  };
  requirementCoverage: Array<{
    requirement: { id: string; description: string };
    status: "VALIDATED" | "PARTIALLY_VALIDATED" | "NOT_VALIDATED" | "VIOLATED" | "UNKNOWN";
  }>;
  ai: {
    available: boolean;
    degradationReason: string;
    result: {
      summary: string;
      rootCause: { layer: string; description: string } | null;
      recommendedNextAction: string;
      explanationConfidence: ConfidenceLevel;
    } | null;
  };
  delta: { improvement: boolean; regression: boolean; previousPassRate: number | null; currentPassRate: number | null } | null;
}

const STATUS_META: Record<CorrectnessStatus, { label: string; tone: keyof typeof tokens & string; Icon: typeof CheckCircle2 }> = {
  ACCEPTED: { label: "Accepted", tone: "verified", Icon: CheckCircle2 },
  LIKELY_CORRECT: { label: "Likely Correct", tone: "verified", Icon: CheckCircle2 },
  PARTIALLY_VALIDATED: { label: "Partially Correct", tone: "warning", Icon: AlertTriangle },
  LIKELY_INCORRECT: { label: "Likely Incorrect", tone: "danger", Icon: XCircle },
  DEFINITIVELY_INCORRECT: { label: "Incorrect", tone: "danger", Icon: XCircle },
  UNKNOWN: { label: "Not Yet Evaluated", tone: "border", Icon: HelpCircle },
};

function tone(key: "verified" | "analysis" | "warning" | "danger") {
  return tokens[key];
}

const DEFAULT_SAMPLE: CorrectnessReportData = {
  status: "PARTIALLY_VALIDATED",
  confidence: "HIGH",
  deterministic: {
    summary: "9 of 10 available tests pass; 1 fails.",
    passed: 9,
    failed: 1,
    totalAvailable: 10,
    clusters: [
      {
        id: "cluster-boundary",
        sharedTags: ["boundary"],
        hypothesis: "Possible boundary-handling issue: initialization, off-by-one, or empty/single-element handling.",
        observedFact: "1 failing test shares the \"boundary\" tag.",
        testIds: ["b3"],
      },
    ],
  },
  requirementCoverage: [
    { requirement: { id: "req-boundary", description: "Handles boundary / small inputs correctly" }, status: "PARTIALLY_VALIDATED" },
    { requirement: { id: "req-output", description: "Output format matches specification" }, status: "VALIDATED" },
  ],
  ai: {
    available: true,
    degradationReason: "NONE",
    result: {
      summary: "The remaining failure appears related to how the last boundary element is handled.",
      rootCause: { layer: "implementation", description: "The loop bound likely excludes the final valid index." },
      recommendedNextAction: "Check whether every valid index — including the last one — is processed by the loop.",
      explanationConfidence: "MEDIUM",
    },
  },
  delta: { improvement: true, regression: false, previousPassRate: 0.6, currentPassRate: 0.9 },
};

export default function CorrectnessReport({ data = DEFAULT_SAMPLE }: { data?: CorrectnessReportData }) {
  const meta = STATUS_META[data.status];
  const statusTone = meta.tone === "verified" || meta.tone === "analysis" || meta.tone === "warning" || meta.tone === "danger"
    ? tone(meta.tone)
    : { fg: tokens.textMuted, bg: tokens.surface, border: tokens.border };

  return (
    <div
      style={{ fontFamily: tokens.sans, background: tokens.surface, color: tokens.textPrimary }}
      className="w-full max-w-2xl mx-auto rounded-2xl p-6 space-y-5"
    >
      {/* Status header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <meta.Icon size={28} color={statusTone.fg} strokeWidth={2} aria-hidden="true" />
          <div>
            <div className="text-xs uppercase tracking-wide font-medium" style={{ color: tokens.textMuted }}>
              Correctness
            </div>
            <div className="text-xl font-semibold" style={{ color: statusTone.fg }}>
              {meta.label}
            </div>
          </div>
        </div>
        <span
          className="text-xs font-medium px-2.5 py-1 rounded-full border"
          style={{ color: statusTone.fg, background: statusTone.bg, borderColor: statusTone.border }}
        >
          Confidence: {data.confidence}
        </span>
      </div>

      {data.delta && (data.delta.improvement || data.delta.regression) && (
        <div
          className="flex items-center gap-2 text-sm rounded-lg px-3 py-2 border"
          style={
            data.delta.improvement
              ? { color: tone("verified").fg, background: tone("verified").bg, borderColor: tone("verified").border }
              : { color: tone("danger").fg, background: tone("danger").bg, borderColor: tone("danger").border }
          }
        >
          {data.delta.improvement ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
          <span>
            {data.delta.improvement ? "Improved" : "Regressed"} since last submission
            {data.delta.previousPassRate !== null && data.delta.currentPassRate !== null
              ? ` — ${Math.round(data.delta.previousPassRate * 100)}% → ${Math.round(data.delta.currentPassRate * 100)}% of available tests passing`
              : ""}
          </span>
        </div>
      )}

      {/* VERIFIED — deterministic evidence only. Nothing AI-derived ever renders in this block. */}
      <section
        className="rounded-xl border p-4 space-y-3"
        style={{ background: tone("verified").bg, borderColor: tone("verified").border }}
      >
        <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: tone("verified").fg }}>
          <ShieldCheck size={16} />
          <span>Verified</span>
        </div>
        <p className="text-sm" style={{ color: tokens.textPrimary }}>
          {data.deterministic.summary}
        </p>
        <div className="flex items-center gap-1 text-xs" style={{ fontFamily: tokens.mono, color: tokens.textMuted }}>
          {Array.from({ length: data.deterministic.totalAvailable }).map((_, i) => (
            <span
              key={i}
              className="inline-block w-2.5 h-2.5 rounded-sm"
              style={{ background: i < data.deterministic.passed ? tone("verified").fg : tone("danger").fg, opacity: i < data.deterministic.passed ? 1 : 0.55 }}
              aria-hidden="true"
            />
          ))}
          <span className="ml-2">
            {data.deterministic.passed}/{data.deterministic.totalAvailable} available tests
          </span>
        </div>

        {data.requirementCoverage.length > 0 && (
          <ul className="space-y-1 pt-1">
            {data.requirementCoverage.map((rc) => (
              <li key={rc.requirement.id} className="flex items-start gap-2 text-sm">
                {rc.status === "VALIDATED" ? (
                  <CheckCircle2 size={15} className="mt-0.5 shrink-0" color={tone("verified").fg} />
                ) : rc.status === "VIOLATED" ? (
                  <XCircle size={15} className="mt-0.5 shrink-0" color={tone("danger").fg} />
                ) : (
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" color={tone("warning").fg} />
                )}
                <span style={{ color: tokens.textPrimary }}>{rc.requirement.description}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Potential issue clusters — deterministic clustering, hypothesis-worded. */}
      {data.deterministic.clusters.length > 0 && (
        <section className="rounded-xl border p-4 space-y-2" style={{ background: tone("warning").bg, borderColor: tone("warning").border }}>
          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: tone("warning").fg }}>
            <AlertTriangle size={16} />
            <span>Potential Issue</span>
          </div>
          {data.deterministic.clusters.map((c) => (
            <div key={c.id} className="text-sm space-y-0.5">
              <div style={{ color: tokens.textPrimary }}>{c.hypothesis}</div>
              <div className="text-xs" style={{ color: tokens.textMuted, fontFamily: tokens.mono }}>
                {c.observedFact} ({c.testIds.length} test{c.testIds.length === 1 ? "" : "s"})
              </div>
            </div>
          ))}
        </section>
      )}

      {/* AI ANALYSIS — visually and structurally separate from "Verified" above. */}
      <section className="rounded-xl border p-4 space-y-2" style={{ background: tone("analysis").bg, borderColor: tone("analysis").border }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: tone("analysis").fg }}>
            <Sparkles size={16} />
            <span>Analysis</span>
          </div>
          {data.ai.available && data.ai.result && (
            <span className="text-xs" style={{ color: tokens.textMuted }}>
              confidence: {data.ai.result.explanationConfidence}
            </span>
          )}
        </div>

        {data.ai.available && data.ai.result ? (
          <div className="space-y-2 text-sm" style={{ color: tokens.textPrimary }}>
            <p>{data.ai.result.summary}</p>
            {data.ai.result.rootCause && (
              <p className="text-xs" style={{ color: tokens.textMuted }}>
                Likely layer: <span style={{ fontFamily: tokens.mono }}>{data.ai.result.rootCause.layer}</span> — {data.ai.result.rootCause.description}
              </p>
            )}
            <div className="pt-1 border-t" style={{ borderColor: tone("analysis").border }}>
              <div className="text-xs font-medium uppercase tracking-wide pt-2" style={{ color: tone("analysis").fg }}>
                Next Investigation
              </div>
              <p className="text-sm pt-0.5">{data.ai.result.recommendedNextAction}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm" style={{ color: tokens.textMuted }}>
            Deeper analysis isn't available right now ({data.ai.degradationReason.toLowerCase().replace("_", " ")}).
            Verified results above are unaffected.
          </p>
        )}
      </section>
    </div>
  );
}
