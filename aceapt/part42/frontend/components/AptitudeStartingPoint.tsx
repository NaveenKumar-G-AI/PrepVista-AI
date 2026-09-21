import type { StudentDiagnosticProfile } from "../../src/types/domain.js";

const STATUS_LABEL: Record<string, string> = {
  strong: "Strong",
  solid: "Solid",
  developing: "Developing",
  needs_focus: "Needs focus",
  insufficient_evidence: "Still gathering evidence",
  incomplete: "Still gathering evidence",
};

const CONFIDENCE_LABEL: Record<string, string> = {
  high: "High confidence",
  moderate: "Moderate confidence",
  low: "Early read — low confidence",
  conflicted: "Evidence is inconsistent so far",
  incomplete: "Not enough evidence yet",
};

export function AptitudeStartingPoint({ profile }: { profile: StudentDiagnosticProfile }) {
  const topStrength = profile.strengths[0];
  const topWeakness = profile.weaknesses[0];

  return (
    <header>
      <p className="diag-eyebrow">Your aptitude starting point</p>
      <h1 className="diag-h1">
        {STATUS_LABEL[profile.overallStatus] ?? profile.overallStatus}, with{" "}
        {CONFIDENCE_LABEL[profile.overallConfidence]?.toLowerCase() ?? profile.overallConfidence}
      </h1>
      <p className="diag-lede">
        {topStrength && (
          <>
            Your strongest area so far is <strong>{topStrength.nodeLabel}</strong>.{" "}
          </>
        )}
        {topWeakness && (
          <>
            The biggest opportunity right now is <strong>{topWeakness.nodeLabel}</strong>.
          </>
        )}
        {!topStrength && !topWeakness && "We're still building a clear picture — keep going to get a fuller read."}
      </p>
      <span className="diag-confidence-tag">
        <span className="diag-confidence-dot" aria-hidden="true" />
        {CONFIDENCE_LABEL[profile.overallConfidence] ?? profile.overallConfidence}
      </span>
    </header>
  );
}
