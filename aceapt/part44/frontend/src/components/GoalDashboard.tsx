import { useState } from "react";
import type { GoalView } from "../types";
import { GoalGapMap } from "./GoalGapMap";
import { GoalMilestones } from "./GoalMilestones";
import { GoalHealthBadge } from "./GoalHealthBadge";

const GOAL_TYPE_LABEL: Record<string, string> = {
  PLACEMENT_READINESS: "Placement Readiness",
  ASSESSMENT_PREPARATION: "Assessment Preparation",
  SKILL_IMPROVEMENT: "Skill Improvement",
  PERFORMANCE_IMPROVEMENT: "Performance Improvement",
  SPEED_IMPROVEMENT: "Speed Improvement",
  ACCURACY_IMPROVEMENT: "Accuracy Improvement",
  OVERALL_APTITUDE: "Overall Aptitude",
  CUSTOM: "Custom Goal",
};

const TARGET_LABEL: Record<string, string> = {
  quant: "Quant",
  logical: "Logical Reasoning",
  verbal: "Verbal",
  probability: "Probability",
  data_interpretation: "Data Interpretation",
  speed: "Speed",
  accuracy: "Accuracy",
};

function daysRemainingLabel(daysRemaining: number | null): string {
  if (daysRemaining === null) return "No deadline set";
  if (daysRemaining < 0) return "Deadline passed";
  if (daysRemaining === 0) return "Deadline is today";
  return `${daysRemaining} DAY${daysRemaining === 1 ? "" : "S"} REMAINING`;
}

export function GoalDashboard({
  view,
  explanation,
  onContinue,
  onRecalculate,
  onPause,
  onResume,
  busy,
}: {
  view: GoalView;
  explanation: string | null;
  onContinue: () => void;
  onRecalculate: () => void;
  onPause: () => void;
  onResume: () => void;
  busy: boolean;
}) {
  const [tab, setTab] = useState<"gap" | "milestones">("gap");
  const { goal, milestones, alreadyAtOrAboveTarget } = view;
  const top = goal.prioritySnapshot[0];

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <div style={{ fontSize: 12, letterSpacing: "0.12em", color: "var(--ink-faint)", marginBottom: 6 }}>MY GOAL</div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
        <h1 className="font-display" style={{ fontSize: 30, fontWeight: 600, margin: 0, color: "var(--ink-primary)" }}>
          {GOAL_TYPE_LABEL[goal.goalType] ?? goal.title}
        </h1>
        <GoalHealthBadge health={goal.health} />
      </div>

      <div style={{ fontSize: 12.5, letterSpacing: "0.06em", color: "var(--accent-summit)", fontWeight: 600, marginBottom: 26 }}>
        {daysRemainingLabel(view.daysRemaining)}
      </div>

      {alreadyAtOrAboveTarget && (
        <div
          style={{
            background: "var(--accent-current-soft)",
            border: "1px solid var(--accent-current)",
            borderRadius: "var(--radius-md)",
            padding: "12px 16px",
            marginBottom: 20,
            fontSize: 13.5,
            color: "var(--ink-primary)",
          }}
        >
          You're currently at or above your selected target. Consider verifying mastery with a fresh assessment, or set a stretch goal.
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 1,
          background: "var(--border-subtle)",
          borderRadius: "var(--radius-lg)",
          overflow: "hidden",
          marginBottom: 24,
        }}
      >
        <Stat label="PROGRESS" value={`+${Math.round(goal.progress)}%`} accent="var(--accent-current)" />
        <Stat label="CONFIDENCE" value={goal.confidence} accent="var(--ink-primary)" />
        <Stat label="FEASIBILITY" value={goal.feasibility ?? "N/A"} accent="var(--accent-summit)" small />
      </div>

      <Card>
        <div style={{ fontSize: 12, letterSpacing: "0.1em", color: "var(--ink-faint)", marginBottom: 10 }}>TODAY'S PRIORITY</div>
        <div className="font-display" style={{ fontSize: 22, fontWeight: 600, marginBottom: 10 }}>
          {top ? TARGET_LABEL[top.target] ?? top.target : "Not enough data yet"}
        </div>
        {(explanation || top?.reason) && (
          <p style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--ink-muted)", margin: 0 }}>{explanation ?? top?.reason}</p>
        )}
        <button
          onClick={onContinue}
          disabled={busy}
          style={{
            marginTop: 16,
            background: "var(--accent-summit)",
            color: "var(--bg-void)",
            border: "none",
            borderRadius: "var(--radius-md)",
            padding: "10px 22px",
            fontSize: 14,
            fontWeight: 700,
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.6 : 1,
          }}
        >
          Continue &rarr;
        </button>
      </Card>

      <div style={{ display: "flex", gap: 4, marginTop: 28, marginBottom: 14, borderBottom: "1px solid var(--border-subtle)" }}>
        <TabButton active={tab === "gap"} onClick={() => setTab("gap")}>
          Gap to target
        </TabButton>
        <TabButton active={tab === "milestones"} onClick={() => setTab("milestones")}>
          Milestones
        </TabButton>
      </div>

      <Card>
        {tab === "gap" ? (
          <GoalGapMap capability={goal.gapSnapshot.capability} />
        ) : (
          <GoalMilestones milestones={milestones} />
        )}
      </Card>

      <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
        {goal.status === "ACTIVE" && (
          <SecondaryButton onClick={onPause} disabled={busy}>
            Pause goal
          </SecondaryButton>
        )}
        {goal.status === "PAUSED" && (
          <SecondaryButton onClick={onResume} disabled={busy}>
            Resume goal
          </SecondaryButton>
        )}
        <SecondaryButton onClick={onRecalculate} disabled={busy}>
          Recalculate now
        </SecondaryButton>
      </div>
    </div>
  );
}

function Stat({ label, value, accent, small }: { label: string; value: string; accent: string; small?: boolean }) {
  return (
    <div style={{ background: "var(--bg-surface)", padding: "16px 18px" }}>
      <div style={{ fontSize: 10.5, letterSpacing: "0.08em", color: "var(--ink-faint)", marginBottom: 6 }}>{label}</div>
      <div className="font-mono" style={{ fontSize: small ? 14 : 20, fontWeight: 600, color: accent }}>
        {value}
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-lg)",
        padding: 22,
      }}
    >
      {children}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "none",
        border: "none",
        borderBottom: active ? "2px solid var(--accent-summit)" : "2px solid transparent",
        color: active ? "var(--ink-primary)" : "var(--ink-muted)",
        padding: "8px 4px",
        marginRight: 20,
        fontSize: 13.5,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function SecondaryButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: "var(--bg-surface-raised)",
        border: "1px solid var(--border-strong)",
        color: "var(--ink-primary)",
        borderRadius: "var(--radius-md)",
        padding: "8px 16px",
        fontSize: 13,
        fontWeight: 600,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}
