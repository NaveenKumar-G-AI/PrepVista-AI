import type { ConfidenceLevel, DimensionStatus, ReadinessDimensionKey, ReadinessState } from "./types";

export const DIMENSION_LABELS: Record<ReadinessDimensionKey, string> = {
  concept: "Concept",
  accuracy: "Accuracy",
  speed: "Speed",
  time_pressure: "Time Pressure",
  mixed_topic: "Mixed Topic",
  novel_question: "Novel Question",
  retention: "Retention",
  consistency: "Consistency",
  assessment_condition: "Assessment Condition",
  recovery: "Recovery",
  question_selection: "Question Selection",
  time_allocation: "Time Allocation",
};

export const STATE_LABELS: Record<ReadinessState, string> = {
  INSUFFICIENT_EVIDENCE: "Insufficient Evidence",
  EARLY_EVIDENCE: "Early Evidence",
  DEVELOPING: "Developing",
  NEAR_READY: "Near Ready",
  CONDITIONALLY_READY: "Conditionally Ready",
  STRONGLY_READY: "Strongly Ready",
};

export function statusColor(status: DimensionStatus): string {
  if (status === "READY") return "text-signal-ready";
  if (status === "HIGH_RISK") return "text-signal-risk";
  return "text-signal-developing";
}

export function statusBg(status: DimensionStatus): string {
  if (status === "READY") return "bg-signal-ready";
  if (status === "HIGH_RISK") return "bg-signal-risk";
  return "bg-signal-developing";
}

export function stateColor(state: ReadinessState): string {
  if (state === "STRONGLY_READY" || state === "CONDITIONALLY_READY") return "text-signal-ready";
  if (state === "NEAR_READY" || state === "DEVELOPING") return "text-signal-developing";
  return "text-paper-500";
}

export function confidenceColor(level: ConfidenceLevel): string {
  if (level === "HIGH") return "text-signal-ready";
  if (level === "MEDIUM") return "text-signal-developing";
  return "text-signal-risk";
}

export function fmtPct(n: number | null, digits = 0): string {
  if (n === null) return "—";
  return `${n.toFixed(digits)}%`;
}

export function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function fmtDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.round(totalSeconds % 60);
  return `${m}m ${s}s`;
}

export function fmtMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
