import { useState } from "react";
import type { PathMilestone, PathStage } from "../types";

const STAGE_DOT: Record<PathStage["status"], string> = {
  LOCKED: "bg-base-surface2 border-2 border-base-border",
  ACTIVE: "bg-route border-2 border-route shadow-[0_0_0_4px_rgba(201,154,91,0.15)]",
  COMPLETE: "bg-verified border-2 border-verified",
};

const MILESTONE_LABEL: Record<PathMilestone["status"], { label: string; className: string }> = {
  LOCKED: { label: "Locked", className: "text-ink-3" },
  AVAILABLE: { label: "Available", className: "text-ink-2" },
  IN_PROGRESS: { label: "In progress", className: "text-route" },
  NEEDS_IMPROVEMENT: { label: "Needs improvement", className: "text-risk" },
  VERIFIED: { label: "Verified", className: "text-verified" },
  MASTERED: { label: "Mastered", className: "text-verified" },
};

export function MilestoneRoute({ stages, milestones }: { stages: PathStage[]; milestones: PathMilestone[] }) {
  const sorted = [...stages].sort((a, b) => a.sequence - b.sequence);
  const defaultStage = sorted.find((s) => s.status === "ACTIVE") ?? sorted[0];
  const [selectedStageId, setSelectedStageId] = useState<string | undefined>(defaultStage?.id);
  const selected = sorted.find((s) => s.id === selectedStageId) ?? defaultStage;
  const selectedMilestones = milestones.filter((m) => m.stageId === selected?.id).sort((a, b) => a.priority - b.priority);

  return (
    <div>
      {/* Desktop: horizontal route. Mobile: vertical route (Section 51 -- not a shrunk desktop layout, a distinct hierarchy). */}
      <div className="hidden md:flex items-center">
        {sorted.map((stage, i) => (
          <div key={stage.id} className="flex items-center flex-1 last:flex-none">
            <button onClick={() => setSelectedStageId(stage.id)} className="flex flex-col items-center gap-2 group shrink-0">
              <span className={`h-4 w-4 rounded-full transition-colors ${STAGE_DOT[stage.status]} ${selected?.id === stage.id ? "ring-2 ring-offset-2 ring-offset-base-bg ring-route/50" : ""}`} />
              <span className={`text-xs font-body whitespace-nowrap ${stage.status === "LOCKED" ? "text-ink-3" : "text-ink-2"} group-hover:text-ink-1 transition-colors`}>{stage.name}</span>
            </button>
            {i < sorted.length - 1 && <span className={`h-px flex-1 mx-2 ${stage.status === "COMPLETE" ? "bg-verified/50" : "bg-base-border"}`} />}
          </div>
        ))}
      </div>

      <div className="flex md:hidden flex-col gap-0">
        {sorted.map((stage, i) => (
          <div key={stage.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <button onClick={() => setSelectedStageId(stage.id)}>
                <span className={`block h-3.5 w-3.5 rounded-full ${STAGE_DOT[stage.status]}`} />
              </button>
              {i < sorted.length - 1 && <span className={`w-px flex-1 min-h-[1.5rem] ${stage.status === "COMPLETE" ? "bg-verified/50" : "bg-base-border"}`} />}
            </div>
            <button onClick={() => setSelectedStageId(stage.id)} className={`text-sm font-body pb-6 text-left ${selected?.id === stage.id ? "text-ink-1" : "text-ink-2"}`}>
              {stage.name}
            </button>
          </div>
        ))}
      </div>

      {selected && (
        <div className="mt-6 rounded-lg border border-base-border bg-base-surface p-4">
          <div className="text-xs uppercase tracking-wide text-ink-3 font-body mb-3">{selected.name} milestones</div>
          {selectedMilestones.length === 0 ? (
            <p className="text-sm text-ink-3 font-body">Nothing in this stage yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {selectedMilestones.map((m) => {
                const meta = MILESTONE_LABEL[m.status];
                return (
                  <li key={m.id} className="flex items-center justify-between gap-3 text-sm font-body">
                    <span className="text-ink-1">
                      {m.name}
                      {!m.critical && <span className="ml-2 text-xs text-ink-3">optional</span>}
                    </span>
                    <span className={`shrink-0 font-mono text-xs ${meta.className}`}>{meta.label}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
