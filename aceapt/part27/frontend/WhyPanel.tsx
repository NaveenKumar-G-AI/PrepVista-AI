import React from "react";
import type { InterventionPlan, WhyPanelContent } from "./types.js";

export interface WhyPanelProps {
  whyPanel: WhyPanelContent | null;
  /** Prefer this over whyPanel.evidence/.conclusion when present — it's the
   * (optionally AI-polished) narrative string the API already assembled from
   * the same evidence. Falling back to the structured list keeps the panel
   * useful even if that field is absent. */
  narrative?: string | null;
  roadmap?: string[];
}

export function WhyPanel({ whyPanel, narrative, roadmap }: WhyPanelProps) {
  if (!whyPanel) {
    return (
      <div className="af-panel">
        <p className="af-panel__title">Why</p>
        <p className="af-empty">Set a target to see the evidence behind your forecast.</p>
      </div>
    );
  }

  return (
    <div className="af-panel">
      <p className="af-panel__title">Why</p>

      {narrative ? (
        <p className="af-conclusion" style={{ marginBottom: 14 }}>
          {narrative}
        </p>
      ) : (
        <>
          <ul className="af-evidence-list">
            {whyPanel.evidence.map((item, i) => (
              <li className="af-evidence-item" key={i}>
                <span className="af-evidence-item__marker" aria-hidden="true" />
                <span>{item.statement}</span>
              </li>
            ))}
          </ul>
          <p className="af-conclusion">{whyPanel.conclusion}</p>
        </>
      )}

      {roadmap && roadmap.length > 0 && (
        <div className="af-roadmap">
          {roadmap.map((step, i) => (
            <React.Fragment key={step + i}>
              {i > 0 && <span aria-hidden="true">&rarr;</span>}
              <span className="af-roadmap__step">{step}</span>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

export function PlanPanel({ plan }: { plan: InterventionPlan | null }) {
  if (!plan) return null;
  return (
    <div className="af-panel">
      <p className="af-panel__title">Recommended response</p>
      <div className="af-plan">
        {plan.steps.map((step, i) => (
          <div className="af-plan-step" key={i}>
            <span>{step.title}</span>
            <span className="af-plan-step__minutes">{step.minutes} min</span>
          </div>
        ))}
      </div>
      <p className="af-empty" style={{ marginTop: 10, marginBottom: 0 }}>
        Total: {plan.totalMinutes} min
      </p>
    </div>
  );
}
