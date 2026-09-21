import { useState } from "react";
import { api } from "../api/client";
import type { GoalDraft } from "../types";

const GOAL_TYPES: { value: string; label: string }[] = [
  { value: "PLACEMENT_READINESS", label: "Placement readiness" },
  { value: "ASSESSMENT_PREPARATION", label: "Upcoming assessment" },
  { value: "SKILL_IMPROVEMENT", label: "Improve a skill" },
  { value: "PERFORMANCE_IMPROVEMENT", label: "Improve my score" },
  { value: "SPEED_IMPROVEMENT", label: "Improve speed" },
  { value: "ACCURACY_IMPROVEMENT", label: "Improve accuracy" },
  { value: "OVERALL_APTITUDE", label: "Overall aptitude" },
  { value: "CUSTOM", label: "Custom goal" },
];

const DAYS: { key: string; label: string }[] = [
  { key: "monday", label: "Mon" },
  { key: "tuesday", label: "Tue" },
  { key: "wednesday", label: "Wed" },
  { key: "thursday", label: "Thu" },
  { key: "friday", label: "Fri" },
  { key: "saturday", label: "Sat" },
  { key: "sunday", label: "Sun" },
];

type Step = "intent" | "constraints" | "review";

export function GoalCreation({ studentId, onCreated }: { studentId: string; onCreated: () => void }) {
  const [step, setStep] = useState<Step>("intent");
  const [freeText, setFreeText] = useState("");
  const [draft, setDraft] = useState<GoalDraft | null>(null);
  const [goalType, setGoalType] = useState<string | null>(null);
  const [deadlineType, setDeadlineType] = useState<"DAYS_FROM_NOW" | "NONE">("DAYS_FROM_NOW");
  const [deadlineDays, setDeadlineDays] = useState(30);
  const [availableTime, setAvailableTime] = useState<Record<string, number>>({
    monday: 30,
    tuesday: 30,
    wednesday: 30,
    thursday: 30,
    friday: 30,
    saturday: 0,
    sunday: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFreeTextSubmit() {
    if (!freeText.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.extractGoal(studentId, freeText);
      setDraft(result);
      setGoalType(result.goalType);
      if (result.deadlineDays) {
        setDeadlineType("DAYS_FROM_NOW");
        setDeadlineDays(result.deadlineDays);
      }
      setStep("constraints");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function pickType(type: string) {
    setGoalType(type);
    setStep("constraints");
  }

  async function handleCreate() {
    if (!goalType) return;
    setLoading(true);
    setError(null);
    try {
      await api.createGoal(studentId, {
        goalType,
        deadlineType,
        ...(deadlineType === "DAYS_FROM_NOW" ? { deadlineDays } : {}),
        availableTime,
        ...(draft?.weaknessDimension ? { focusDimension: draft.weaknessDimension } : {}),
        ...(draft?.studentReportedWeakness ? { studentReportedWeakness: draft.studentReportedWeakness } : {}),
      });
      onCreated();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 560, margin: "0 auto" }}>
      {step === "intent" && (
        <>
          <h1 className="font-display" style={{ fontSize: 28, fontWeight: 600, marginBottom: 28, textAlign: "center" }}>
            What are you trying to achieve?
          </h1>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 28 }}>
            {GOAL_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => pickType(t.value)}
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-md)",
                  padding: "14px 16px",
                  color: "var(--ink-primary)",
                  fontSize: 14,
                  textAlign: "left",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent-summit)")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border-subtle)")}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div style={{ textAlign: "center", color: "var(--ink-faint)", fontSize: 12.5, marginBottom: 14 }}>
            &mdash; or describe it in your own words &mdash;
          </div>
          <textarea
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            placeholder="e.g. I have a placement test in 20 days and logical reasoning is my weakest area."
            rows={3}
            style={{
              width: "100%",
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              padding: 14,
              color: "var(--ink-primary)",
              fontSize: 14,
              fontFamily: "inherit",
              resize: "vertical",
            }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
            <PrimaryButton onClick={handleFreeTextSubmit} disabled={loading || !freeText.trim()}>
              {loading ? "Thinking..." : "Continue"}
            </PrimaryButton>
          </div>
        </>
      )}

      {step === "constraints" && (
        <>
          <h2 className="font-display" style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>
            A couple more things
          </h2>
          {draft?.needsClarification.includes("goal_type") && (
            <div style={{ marginBottom: 20 }}>
              <FieldLabel>What would you most like to improve?</FieldLabel>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {GOAL_TYPES.map((t) => (
                  <Chip key={t.value} active={goalType === t.value} onClick={() => setGoalType(t.value)}>
                    {t.label}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginBottom: 20 }}>
            <FieldLabel>Deadline</FieldLabel>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <Chip active={deadlineType === "DAYS_FROM_NOW"} onClick={() => setDeadlineType("DAYS_FROM_NOW")}>
                In a number of days
              </Chip>
              <Chip active={deadlineType === "NONE"} onClick={() => setDeadlineType("NONE")}>
                No deadline
              </Chip>
            </div>
            {deadlineType === "DAYS_FROM_NOW" && (
              <input
                type="number"
                min={1}
                value={deadlineDays}
                onChange={(e) => setDeadlineDays(Number(e.target.value))}
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  padding: "8px 12px",
                  color: "var(--ink-primary)",
                  width: 100,
                  fontFamily: "var(--font-mono)",
                }}
              />
            )}
          </div>

          <div style={{ marginBottom: 24 }}>
            <FieldLabel>How much time can you give each day? (minutes)</FieldLabel>
            <div style={{ display: "flex", gap: 6 }}>
              {DAYS.map((d) => (
                <div key={d.key} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: "var(--ink-faint)", marginBottom: 4 }}>{d.label}</div>
                  <input
                    type="number"
                    min={0}
                    step={5}
                    value={availableTime[d.key] ?? 0}
                    onChange={(e) => setAvailableTime((prev) => ({ ...prev, [d.key]: Number(e.target.value) }))}
                    style={{
                      width: 44,
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-sm)",
                      padding: "6px 4px",
                      textAlign: "center",
                      color: "var(--ink-primary)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 12.5,
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          {error && <p style={{ color: "var(--accent-risk)", fontSize: 13 }}>{error}</p>}

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <PrimaryButton onClick={handleCreate} disabled={loading || !goalType}>
              {loading ? "Creating..." : "Create goal"}
            </PrimaryButton>
          </div>
        </>
      )}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-muted)", marginBottom: 10 }}>{children}</div>;
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? "var(--accent-summit-soft)" : "var(--bg-surface)",
        border: active ? "1px solid var(--accent-summit)" : "1px solid var(--border-subtle)",
        color: active ? "var(--accent-summit)" : "var(--ink-primary)",
        borderRadius: 999,
        padding: "7px 14px",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: "var(--accent-summit)",
        color: "var(--bg-void)",
        border: "none",
        borderRadius: "var(--radius-md)",
        padding: "10px 22px",
        fontSize: 14,
        fontWeight: 700,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}
