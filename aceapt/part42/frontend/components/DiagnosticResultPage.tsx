import type { StudentDiagnosticProfile } from "../../src/types/domain.js";
import { AptitudeStartingPoint } from "./AptitudeStartingPoint.js";
import { StrengthsAndOpportunities } from "./StrengthsAndOpportunities.js";
import { PerformancePatternPanel } from "./PerformancePatternPanel.js";
import { WhyExplanationPanel } from "./WhyExplanationPanel.js";
import { NextBestStepPanel } from "./NextBestStepPanel.js";
import "../styles/diagnosticResult.css";

/**
 * Module 22/45: the full result experience, end to end. This composes the
 * five panels in the order Module 45's UX flow specifies. Restyle with
 * ACEAPT's real design tokens on integration (Module: "reuse existing
 * design language") — the CSS file this imports is intentionally a plain,
 * portable stylesheet using custom properties rather than a framework, so
 * it's a straightforward re-skin rather than a rewrite.
 */
export function DiagnosticResultPage({ profile, onStartPersonalizedPath }: { profile: StudentDiagnosticProfile; onStartPersonalizedPath?: () => void }) {
  return (
    <div className="diag-root">
      <AptitudeStartingPoint profile={profile} />
      <StrengthsAndOpportunities strengths={profile.strengths} weaknesses={profile.weaknesses} />
      <PerformancePatternPanel profile={profile} />
      <WhyExplanationPanel traces={profile.evidenceTraces} />
      <NextBestStepPanel recommendations={profile.recommendedNextStep} onStart={onStartPersonalizedPath} />
    </div>
  );
}
