import { useEffect, useState } from 'react';
import { fetchSamplePlanChange, PlanChangeRecommendation } from '../api/behaviorApi';

/**
 * Section 39: "Why did ACEAPT change my plan?" - a major trust feature per
 * the brief. Calls the sample-adaptive-planner endpoint (a demo stand-in
 * for Feature 7, see backend/src/sample-adaptive-planner/planAdapter.ts)
 * and renders its reasons verbatim - this component does not compose or
 * embellish the explanation itself, since every sentence shown here must
 * already be traceable to a specific signal on the backend.
 */
export function PlanChangeExplanation({ studentId, currentPlannedMinutes }: { studentId: string; currentPlannedMinutes: number }) {
  const [recommendation, setRecommendation] = useState<PlanChangeRecommendation | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSamplePlanChange(studentId, currentPlannedMinutes)
      .then((r) => { if (!cancelled) setRecommendation(r); })
      .catch(() => { /* non-critical panel - fails quietly, main profile above still renders */ });
    return () => { cancelled = true; };
  }, [studentId, currentPlannedMinutes]);

  if (!recommendation || !recommendation.changed || recommendation.reasons.length === 0) return null;

  return (
    <div className="abi-plan-change">
      <p className="abi-plan-change-title">Why did ACEAPT change my plan?</p>
      <p className="abi-plan-change-sub">
        {recommendation.previousSessionMinutes} min → {recommendation.recommendedSessionMinutes} min sessions
      </p>
      <ul>
        {recommendation.reasons.map((reason, i) => (
          <li key={i}>{reason}</li>
        ))}
      </ul>
    </div>
  );
}
