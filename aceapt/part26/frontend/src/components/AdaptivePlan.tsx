import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { ActionType, PlanResponse, TopicCapabilityState } from "../types";
import { EvidenceReadout } from "./EvidenceReadout";
import { metricsForBottleneck } from "../lib/bottleneckMetrics";

const ACTION_LABEL: Record<ActionType, string> = {
  LEARN: "Concept walkthrough",
  REVIEW: "Prerequisite review",
  RECALL: "Retention repair",
  PRACTICE: "Focused practice",
  TRANSFER_CHALLENGE: "Transfer challenge",
  METHOD_REPAIR: "Method repair",
  VERIFY: "Quick verification",
  MIX: "Mixed verification",
  CHALLENGE: "Stretch challenge",
  TIMED_PRACTICE: "Timed practice",
  ASSESS: "Assessment",
  REST: "Break"
};

interface AdaptivePlanProps {
  planResponse: PlanResponse;
  topics: TopicCapabilityState[];
  activeActionId?: string;
  onStartItem: (candidateActionId: string) => void;
  busy: boolean;
}

export function AdaptivePlan({ planResponse, topics, activeActionId, onStartItem, busy }: AdaptivePlanProps) {
  const { plan, fatigueSuspected, fatigueMessage } = planResponse;
  const [expandedId, setExpandedId] = useState<string | null>(plan.items[0]?.action.id ?? null);

  if (plan.items.length === 0) {
    return (
      <div className="rounded-2xl border border-line-soft bg-ink-900/60 p-5 text-sm text-muted">
        Nothing fits in that window right now.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {plan.exceedsBudget && (
        <div className="flex items-start gap-2 rounded-xl border border-priority/40 bg-priority/10 px-3.5 py-2.5 text-sm text-priority">
          <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
          <span>
            The highest-value action here needs a little more time than you asked for - it's still the best use of
            the minutes you do have.
          </span>
        </div>
      )}
      {fatigueSuspected && fatigueMessage && (
        <div className="flex items-start gap-2 rounded-xl border border-alert/40 bg-alert/10 px-3.5 py-2.5 text-sm text-alert">
          <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
          <span>{fatigueMessage}</span>
        </div>
      )}

      <ol className="space-y-2.5">
        {plan.items.map((item) => {
          const { action } = item;
          const state = topics.find((t) => t.topicId === action.topicId);
          const metrics = metricsForBottleneck(action.bottleneck, state);
          const expanded = expandedId === action.id;
          const isActive = activeActionId === action.id;

          return (
            <li key={action.id} className="rounded-xl border border-line-soft bg-ink-900/60 p-4">
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : action.id)}
                className="flex w-full items-start gap-3 text-left"
              >
                <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-ink-800 font-mono text-xs text-muted">
                  {String(item.order).padStart(2, "0")}
                </span>
                <span className="flex-1">
                  <span className="block font-display text-base font-medium text-paper">
                    {ACTION_LABEL[action.actionType]} · {action.topicName}
                  </span>
                  <span className="mt-0.5 block font-mono text-xs text-muted">{action.estimatedMinutes} min</span>
                </span>
              </button>

              {expanded && (
                <div className="mt-3 pl-9">
                  <EvidenceReadout why={action.rationale.join(" ")} metrics={metrics} breakdown={action.priorityBreakdown} />
                  <button
                    type="button"
                    onClick={() => onStartItem(action.id)}
                    disabled={busy}
                    className="mt-3 rounded-full bg-priority px-4 py-2 text-sm font-semibold text-ink-950 transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {isActive ? "Continue" : "Start this step"}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {plan.remainingMinutes > 0 && (
        <p className="px-1 font-mono text-xs text-faint">{plan.remainingMinutes} min unused in this budget</p>
      )}
    </div>
  );
}
