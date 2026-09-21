import React, { useState } from "react";
import { ReadinessCard } from "./ReadinessCard.js";
import { ReadinessProfile } from "./ReadinessProfile.js";
import { TrajectoryChart } from "./TrajectoryChart.js";
import { PlanPanel, WhyPanel } from "./WhyPanel.js";
import { RISK_TYPE_LABELS } from "./types.js";
import type { ForecastScreenData, InterventionPlan } from "./types.js";

export interface ForecastScreenProps {
  data: ForecastScreenData;
  /** Wire this to POST /students/:id/fix-my-readiness (see useForecastApi.ts).
   * Omit to hide the "Fix my readiness" CTA entirely. */
  onFixMyReadiness?: () => Promise<InterventionPlan | null>;
  fixReadinessLoading?: boolean;
}

/**
 * Drop-in composition of the full Forecast screen. Import
 * "./aceapt-forecast.css" once at your app root, then:
 *
 *   const { data, fixMyReadiness, fixingReadiness } = useForecastApi({ studentId });
 *   if (data) return <ForecastScreen data={data} onFixMyReadiness={fixMyReadiness} fixReadinessLoading={fixingReadiness} />;
 *
 * Each piece (ReadinessCard, ReadinessProfile, TrajectoryChart, WhyPanel,
 * PlanPanel) is also exported individually if you'd rather compose your own
 * layout around your existing design system.
 */
export function ForecastScreen({ data, onFixMyReadiness, fixReadinessLoading }: ForecastScreenProps) {
  const [showWhy, setShowWhy] = useState(false);
  const [plan, setPlan] = useState<InterventionPlan | null>(null);

  const topRisk = data.risks[0];
  const mainRiskLabel = topRisk ? RISK_TYPE_LABELS[topRisk.type] : null;

  async function handleFixReadiness() {
    if (!onFixMyReadiness) return;
    const result = await onFixMyReadiness();
    setPlan(result);
  }

  return (
    <div className="af-root">
      <ReadinessCard
        currentOverall={data.readiness.currentOverall}
        status={data.readiness.status}
        forecast={data.forecast}
        mainRiskLabel={mainRiskLabel}
        onWhy={() => setShowWhy((s) => !s)}
        onFixReadiness={onFixMyReadiness ? handleFixReadiness : undefined}
        fixReadinessLoading={fixReadinessLoading}
      />

      <div className="af-grid">
        <ReadinessProfile capability={data.readiness.capability} />
        <TrajectoryChart
          history={data.trajectoryHistory ?? []}
          target={data.forecast?.target ?? null}
          projectedRange={data.forecast?.projectedRange ?? null}
          daysRemaining={data.forecast?.daysRemaining ?? null}
        />
      </div>

      {showWhy && <WhyPanel whyPanel={data.whyPanel} narrative={data.whyNarrative} roadmap={data.roadmap} />}
      {plan && <PlanPanel plan={plan} />}
    </div>
  );
}

export { ReadinessCard } from "./ReadinessCard.js";
export { ReadinessProfile } from "./ReadinessProfile.js";
export { TrajectoryChart } from "./TrajectoryChart.js";
export { WhyPanel, PlanPanel } from "./WhyPanel.js";
export { useForecastApi } from "./useForecastApi.js";
export * from "./types.js";
