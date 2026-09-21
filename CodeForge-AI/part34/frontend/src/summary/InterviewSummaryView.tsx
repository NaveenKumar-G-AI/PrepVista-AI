// ============================================================================
// Phase 58 — post-interview UI. Shows technical performance, verified
// skills, strengths, gaps, evidence confidence, feedback, and what still
// needs verification. "Avoid fake numerical precision" — nothing here
// renders a percentage or point score; every value shown is one of the
// product's actual typed categories (EvidenceState, correctness tiers,
// etc.), never a number invented to look more precise than the underlying
// evidence actually is.
// ============================================================================

import { useEffect, useState } from "react";
import { interviewApi, type InterviewSummary } from "../shared/apiClient";
import { EvidenceBadge, type EvidenceState } from "../shared/EvidenceVocabulary";
import "../shared/tokens.css";
import "./InterviewSummaryView.css";

export interface InterviewSummaryViewProps {
  sessionId: string;
  roleLabel: string;
  skillLabels: Record<string, string>;
  /** Pass this when arriving directly from InterviewSessionView.onComplete — avoids a redundant fetch. Omit when deep-linking to results for an already-completed session (e.g. from history); the component fetches via the read-only summary endpoint instead. */
  preloadedSummary?: InterviewSummary;
}

const TIER_COPY: Record<string, string> = {
  STRONG: "Strong",
  ADEQUATE: "Adequate",
  WEAK: "Needs work",
  CLEAR: "Clear",
  UNCLEAR: "Needs work",
  INSUFFICIENT_EVIDENCE: "Not enough evidence yet",
  NOT_APPLICABLE: "Not applicable to this interview",
};

function skillState(summary: InterviewSummary, skillId: string): EvidenceState {
  if (summary.verifiedSkills.includes(skillId)) return "VERIFIED";
  if (summary.partiallyVerifiedSkills.includes(skillId)) return "PARTIALLY_VERIFIED";
  if (summary.uncertainSkills.includes(skillId)) return "UNCERTAIN";
  return "UNASSESSED";
}

export function InterviewSummaryView({ sessionId, roleLabel, skillLabels, preloadedSummary }: InterviewSummaryViewProps) {
  const [summary, setSummary] = useState<InterviewSummary | null>(preloadedSummary ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (preloadedSummary) return; // already have it — this is a read-only view, not a place to re-trigger completion
    interviewApi
      .getSummary(sessionId)
      .then((res) => setSummary(res.summary))
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load your results."));
  }, [sessionId, preloadedSummary]);

  if (error) {
    return (
      <div className="ti-summary ti-summary--error" role="alert">
        {error}
      </div>
    );
  }
  if (!summary) {
    return <div className="ti-summary ti-summary--loading">Putting your results together…</div>;
  }

  const allSkillIds = [...new Set([...summary.verifiedSkills, ...summary.partiallyVerifiedSkills, ...summary.uncertainSkills, ...summary.technicalGaps])];

  return (
    <div className="ti-summary">
      <header className="ti-summary__header">
        <span className="ti-summary__eyebrow">Interview results — {roleLabel}</span>
        <h1 className="ti-summary__title">{summary.assessmentComplete ? "Here's what the evidence shows" : "Here's what the evidence shows so far"}</h1>
        {!summary.assessmentComplete && (
          <p className="ti-summary__incomplete-note">
            Not every required skill got enough coverage in this session — treat this as a partial read, not a final one.
          </p>
        )}
      </header>

      {summary.technicalStrengths.length > 0 && (
        <section className="ti-summary__section">
          <h2 className="ti-summary__section-title">What came through clearly</h2>
          <ul className="ti-summary__strength-list">
            {summary.technicalStrengths.map((skillId) => (
              <li key={skillId}>{skillLabels[skillId] ?? skillId}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="ti-summary__section">
        <h2 className="ti-summary__section-title">Coverage map</h2>
        <div className="ti-summary__coverage-map">
          {allSkillIds.map((skillId) => (
            <div key={skillId} className="ti-summary__coverage-row">
              <span className="ti-summary__coverage-label">{skillLabels[skillId] ?? skillId}</span>
              <EvidenceBadge state={skillState(summary, skillId)} />
            </div>
          ))}
        </div>
      </section>

      <section className="ti-summary__section ti-summary__grid">
        <div className="ti-summary__metric">
          <span className="ti-summary__metric-label">Reasoning</span>
          <span className="ti-summary__metric-value">{TIER_COPY[summary.reasoningStrength] ?? summary.reasoningStrength}</span>
        </div>
        {summary.debuggingStrength !== "NOT_APPLICABLE" && (
          <div className="ti-summary__metric">
            <span className="ti-summary__metric-label">Debugging</span>
            <span className="ti-summary__metric-value">{TIER_COPY[summary.debuggingStrength] ?? summary.debuggingStrength}</span>
          </div>
        )}
        {summary.projectUnderstanding !== "NOT_APPLICABLE" && (
          <div className="ti-summary__metric">
            <span className="ti-summary__metric-label">Project understanding</span>
            <span className="ti-summary__metric-value">{TIER_COPY[summary.projectUnderstanding] ?? summary.projectUnderstanding}</span>
          </div>
        )}
        <div className="ti-summary__metric">
          <span className="ti-summary__metric-label">Technical communication</span>
          <span className="ti-summary__metric-value">{TIER_COPY[summary.technicalCommunication] ?? summary.technicalCommunication}</span>
        </div>
      </section>

      {summary.additionalVerificationRequired.length > 0 && (
        <section className="ti-summary__section">
          <h2 className="ti-summary__section-title">Worth another look</h2>
          <p className="ti-summary__section-note">
            These skills didn't get a clear read this time — not a fail, just not settled either way yet.
          </p>
          <ul className="ti-summary__gap-list">
            {summary.additionalVerificationRequired.map((skillId) => (
              <li key={skillId}>{skillLabels[skillId] ?? skillId}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
