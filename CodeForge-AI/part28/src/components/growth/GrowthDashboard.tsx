import React, { useMemo, useState } from "react";
import type { GrowthSnapshot, GrowthInsight, GrowthMilestone, GrowthDimension, DimensionGrowth } from "../../lib/growth/types.ts";
import { stateMeta, trendGlyph } from "./stateMeta.ts";
import { EvidenceLedgerTag, type EvidenceTick } from "./EvidenceLedgerTag.tsx";
import "./growth-dashboard.css";

export interface GrowthDashboardProps {
  snapshot: GrowthSnapshot | null;
  insights: GrowthInsight[];
  milestones: GrowthMilestone[];
  /** Optional: per-dimension evidence ticks for the ledger tag's discrete
   * points. Omit and the tag still shows count + confidence, just without
   * the tick row. */
  evidenceByDimension?: Partial<Record<GrowthDimension, EvidenceTick[]>>;
  loading?: boolean;
  error?: string | null;
  assessmentMode?: boolean;
  /** Called when the student opens evidence drill-down for a dimension —
   * wire this to `GET /api/growth/evidence?dimension=...`. */
  onRequestEvidence?: (dimension: GrowthDimension) => void;
  /** Growth tracking never picks the next challenge itself — this hands a
   * dimension off to whatever surfaces the adaptive engine's suggestion. */
  onContinuePractice?: (dimension: GrowthDimension) => void;
}

function friendlyDimension(dim: string): string {
  const stripped = dim.replace(/^role:[^:]+:/, "");
  return stripped
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function GrowthDashboard(props: GrowthDashboardProps) {
  if (props.loading) return <LoadingSkeleton />;
  if (props.error) return <ErrorState message={props.error} />;
  if (!props.snapshot || props.snapshot.dimensions.every((d) => d.state === "NO_EVIDENCE")) {
    return <EmptyState />;
  }

  const { snapshot, insights, milestones, assessmentMode } = props;
  const topImprovement = insights.find((i) => i.insightType === "IMPROVEMENT" || i.insightType === "RECOVERY" || i.insightType === "TRANSFER_GAIN");
  const topDevelopmentArea = !assessmentMode ? insights.find((i) => i.insightType === "DEVELOPMENT_AREA" || i.insightType === "STAGNATION") : undefined;

  return (
    <div className="gt-root" style={{ maxWidth: 720, padding: 24, borderRadius: "var(--gt-radius-lg)" }}>
      <header style={{ marginBottom: 20 }}>
        <div className="gt-mono" style={{ fontSize: 11, letterSpacing: "0.12em", color: "var(--gt-accent)", marginBottom: 4 }}>
          TECHNICAL GROWTH
        </div>
        <h1 className="gt-display" style={{ fontSize: 22, fontWeight: 600, margin: 0, color: "var(--gt-text)" }}>
          Your engineering capability over time
        </h1>
      </header>

      <OverallGrowthPanel snapshot={snapshot} />

      <section aria-label="Growth areas" style={{ marginTop: 22 }}>
        <SectionLabel>Growth areas</SectionLabel>
        <div role="list" style={{ display: "flex", flexDirection: "column", gap: 1, borderRadius: "var(--gt-radius-md)", overflow: "hidden", border: "1px solid var(--gt-border-soft)" }}>
          {snapshot.dimensions.map((d) => (
            <GrowthAreaRow
              key={d.dimension}
              dimension={d}
              ticks={props.evidenceByDimension?.[d.dimension]}
              onOpenEvidence={assessmentMode ? undefined : () => props.onRequestEvidence?.(d.dimension)}
            />
          ))}
        </div>
      </section>

      <JourneyStages snapshot={snapshot} milestones={milestones} />

      {topImprovement && (
        <Callout label="What changed" tone="positive">
          <p style={{ margin: "0 0 8px 0", lineHeight: 1.5 }}>{topImprovement.claim}</p>
          <EvidenceLedgerTag
            evidenceCount={topImprovement.evidenceRefs.length}
            confidence={topImprovement.confidence}
            ticks={props.evidenceByDimension?.[topImprovement.dimension]}
            onOpen={assessmentMode ? undefined : () => props.onRequestEvidence?.(topImprovement.dimension)}
          />
        </Callout>
      )}

      {topDevelopmentArea && (
        <Callout label="Next development area" tone="neutral">
          <p style={{ margin: "0 0 10px 0", lineHeight: 1.5 }}>{topDevelopmentArea.claim}</p>
          <button
            type="button"
            className="gt-focus-visible"
            onClick={() => props.onContinuePractice?.(topDevelopmentArea.dimension)}
            style={{
              background: "var(--gt-accent-soft)",
              color: "var(--gt-accent-strong)",
              border: "1px solid transparent",
              borderRadius: "var(--gt-radius-sm)",
              padding: "7px 12px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Continue practice
          </button>
        </Callout>
      )}

      {assessmentMode && (
        <p className="gt-mono" style={{ marginTop: 16, fontSize: 12, color: "var(--gt-text-tertiary)" }}>
          Growth detail is limited during an active assessment.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="gt-mono"
      style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--gt-text-tertiary)", marginBottom: 8 }}
    >
      {children}
    </div>
  );
}

function OverallGrowthPanel({ snapshot }: { snapshot: GrowthSnapshot }) {
  const meta = stateMeta(snapshot.overallState);
  return (
    <section
      className="gt-animate-in"
      style={{
        background: "var(--gt-surface)",
        border: "1px solid var(--gt-border)",
        borderRadius: "var(--gt-radius-lg)",
        padding: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <div>
        <div className="gt-display" style={{ fontSize: 28, fontWeight: 700, color: meta.colorVar, display: "flex", alignItems: "center", gap: 10 }}>
          <span aria-hidden="true">{meta.glyph}</span>
          {meta.label}
        </div>
        <div className="gt-mono" style={{ fontSize: 12, color: "var(--gt-text-secondary)", marginTop: 6 }}>
          confidence: {snapshot.overallConfidence.toLowerCase()}
        </div>
      </div>
      {/* Activity is shown but visually separated from the growth readout —
          the spec is explicit that activity volume must never be read as
          growth on its own. */}
      <div style={{ textAlign: "right" }}>
        <div className="gt-mono" style={{ fontSize: 11, color: "var(--gt-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          activity
        </div>
        <div className="gt-mono" style={{ fontSize: 15, color: "var(--gt-text-secondary)" }}>
          {snapshot.activityLevel.toLowerCase()}
        </div>
      </div>
    </section>
  );
}

function GrowthAreaRow({ dimension, ticks, onOpenEvidence }: { dimension: DimensionGrowth; ticks?: EvidenceTick[]; onOpenEvidence?: () => void }) {
  const meta = stateMeta(dimension.state);
  return (
    <div
      role="listitem"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "12px 14px",
        background: "var(--gt-surface)",
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 180 }}>
        <span aria-hidden="true" style={{ color: meta.colorVar, width: 14, textAlign: "center" }}>
          {trendGlyph(dimension.trend)}
        </span>
        <span style={{ fontSize: 14 }}>{friendlyDimension(dimension.dimension)}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          className="gt-mono"
          style={{
            fontSize: 11,
            padding: "3px 8px",
            borderRadius: 999,
            background: meta.softVar,
            color: meta.colorVar,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          {meta.label}
        </span>
        <EvidenceLedgerTag evidenceCount={dimension.evidenceCount} confidence={dimension.confidence.level} ticks={ticks} onOpen={onOpenEvidence} />
      </div>
    </div>
  );
}

function JourneyStages({ snapshot, milestones }: { snapshot: GrowthSnapshot; milestones: GrowthMilestone[] }) {
  // Every stage below is derived from real snapshot/milestone data — never
  // rendered as "reached" just to fill out the sequence (spec: "do not show
  // fake progress stages simply for visual appeal").
  const hasAnyEvidence = snapshot.dimensions.some((d) => d.state !== "NO_EVIDENCE");
  const hasMeaningfulPractice = snapshot.dimensions.reduce((sum, d) => sum + d.evidenceCount, 0) >= 3;
  const hasTransfer = snapshot.dimensions.some((d) => d.transferEvidenceCount > 0) || milestones.some((m) => m.milestoneType === "FIRST_TRANSFER_SUCCESS");
  const hasApplication = snapshot.dimensions.some((d) => d.state === "STRONG" || d.state === "MASTERED");

  const stages = [
    { label: "Baseline", reached: hasAnyEvidence },
    { label: "Practice", reached: hasMeaningfulPractice },
    { label: "Transfer", reached: hasTransfer },
    { label: "Application", reached: hasApplication },
  ];

  return (
    <section aria-label="Growth journey" style={{ marginTop: 22 }}>
      <SectionLabel>Your journey</SectionLabel>
      <div style={{ display: "flex", alignItems: "center" }}>
        {stages.map((stage, i) => (
          <React.Fragment key={stage.label}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, opacity: stage.reached ? 1 : 0.4 }}>
              <div
                aria-hidden="true"
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: stage.reached ? "var(--gt-accent)" : "transparent",
                  border: `1.5px solid ${stage.reached ? "var(--gt-accent)" : "var(--gt-text-tertiary)"}`,
                }}
              />
              <span className="gt-mono" style={{ fontSize: 11, color: stage.reached ? "var(--gt-text-secondary)" : "var(--gt-text-tertiary)" }}>
                {stage.label}
              </span>
            </div>
            {i < stages.length - 1 && (
              <div
                aria-hidden="true"
                style={{ flex: 1, height: 1, background: stages[i + 1]!.reached ? "var(--gt-accent)" : "var(--gt-border)", margin: "0 6px 18px" }}
              />
            )}
          </React.Fragment>
        ))}
      </div>
    </section>
  );
}

function Callout({ label, tone, children }: { label: string; tone: "positive" | "neutral"; children: React.ReactNode }) {
  return (
    <section
      className="gt-animate-in"
      style={{
        marginTop: 16,
        padding: 16,
        borderRadius: "var(--gt-radius-md)",
        border: `1px solid ${tone === "positive" ? "var(--gt-state-improving)" : "var(--gt-border)"}`,
        borderLeftWidth: 3,
        background: "var(--gt-surface)",
      }}
    >
      <SectionLabel>{label}</SectionLabel>
      {children}
    </section>
  );
}

export function EvidenceDrilldown({ dimension, evidence }: { dimension: GrowthDimension; evidence: { evidenceId: string; occurredAt: string; outcome: string; challengeFamily: string | null }[] }) {
  return (
    <div className="gt-root" style={{ padding: 16, borderRadius: "var(--gt-radius-md)", border: "1px solid var(--gt-border)" }}>
      <SectionLabel>{friendlyDimension(dimension)} — evidence</SectionLabel>
      {evidence.length === 0 ? (
        <p style={{ color: "var(--gt-text-secondary)", fontSize: 13 }}>No individual evidence records available for this view.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          {evidence.map((e) => (
            <li key={e.evidenceId} className="gt-mono" style={{ fontSize: 12, display: "flex", justifyContent: "space-between", color: "var(--gt-text-secondary)" }}>
              <span>{new Date(e.occurredAt).toISOString().slice(0, 10)}</span>
              <span>{e.challengeFamily ?? "—"}</span>
              <span style={{ color: e.outcome === "SUCCESS" ? "var(--gt-state-improving)" : e.outcome === "FAILURE" ? "var(--gt-state-regressing)" : "var(--gt-state-stagnating)" }}>
                {e.outcome}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="gt-root" style={{ maxWidth: 720, padding: 32, borderRadius: "var(--gt-radius-lg)", textAlign: "center" }}>
      <div className="gt-display" style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
        Your technical growth profile is still being established
      </div>
      <p style={{ color: "var(--gt-text-secondary)", fontSize: 14, lineHeight: 1.6, maxWidth: 460, margin: "0 auto" }}>
        As you complete challenges, debugging sessions, and reviews, this page will start showing evidence-backed growth across each skill area — not before there's real evidence to show.
      </p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="gt-root" style={{ maxWidth: 720, padding: 24, borderRadius: "var(--gt-radius-lg)", border: "1px solid var(--gt-state-regressing)" }}>
      <div className="gt-display" style={{ fontSize: 16, fontWeight: 600, color: "var(--gt-state-regressing)", marginBottom: 6 }}>
        We couldn&apos;t load your latest growth analysis
      </div>
      <p className="gt-mono" style={{ color: "var(--gt-text-secondary)", fontSize: 12 }}>
        {message}
      </p>
    </div>
  );
}

function LoadingSkeleton() {
  const bar = (w: string, h = 14) => (
    <div
      style={{ width: w, height: h, borderRadius: 6, background: "var(--gt-surface-raised)" }}
      className="gt-animate-in"
    />
  );
  return (
    <div className="gt-root" style={{ maxWidth: 720, padding: 24, borderRadius: "var(--gt-radius-lg)", display: "flex", flexDirection: "column", gap: 14 }} aria-busy="true" aria-label="Loading growth data">
      {bar("40%", 12)}
      {bar("100%", 64)}
      {bar("100%", 44)}
      {bar("100%", 44)}
      {bar("100%", 44)}
    </div>
  );
}
