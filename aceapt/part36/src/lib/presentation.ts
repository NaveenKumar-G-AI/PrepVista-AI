import type {
  PlanHealthState,
  CapabilityTrend,
  MomentumLabel,
  ActionStatus,
  EvidenceQuality,
  DifficultyLevel,
  BlockerReasonCode,
  DeferReasonCode,
  ActionType,
  ConfidenceLevel,
  ActionImpact,
} from "./types";

export type Tone = "brass" | "sage" | "rust" | "slate";

export function formatMinutes(min: number): string {
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function planHealthDisplay(state: PlanHealthState): { label: string; tone: Tone; description: string } {
  switch (state) {
    case "ON_TRACK":
      return { label: "On track", tone: "sage", description: "Actions are being completed and evidence is coming in as expected." };
    case "NEEDS_ADJUSTMENT":
      return { label: "Needs adjustment", tone: "brass", description: "Something in the plan is causing repeated friction — it may need reshaping." };
    case "OVERLOADED":
      return { label: "Overloaded", tone: "rust", description: "This week is carrying more than fits in the time available." };
    case "BLOCKED":
      return { label: "Blocked", tone: "rust", description: "At least one action is currently blocked." };
    case "DEADLINE_RISK":
      return { label: "Deadline risk", tone: "rust", description: "An opportunity is coming up and readiness signal is still thin." };
    case "INSUFFICIENT_DATA":
      return { label: "Insufficient data", tone: "slate", description: "Not enough execution history yet to assess plan health." };
  }
}

export function trendDisplay(trend: CapabilityTrend): { label: string; tone: Tone } {
  switch (trend) {
    case "IMPROVING":
      return { label: "Improving", tone: "sage" };
    case "FLAT":
      return { label: "No change", tone: "slate" };
    case "DECLINING":
      return { label: "Needs attention", tone: "rust" };
    case "UNKNOWN":
      return { label: "Unknown", tone: "slate" };
  }
}

export function momentumDisplay(label: MomentumLabel): { label: string; tone: Tone } {
  switch (label) {
    case "STRONG":
      return { label: "Strong momentum", tone: "sage" };
    case "STEADY":
      return { label: "Steady momentum", tone: "sage" };
    case "BUILDING":
      return { label: "Building momentum", tone: "brass" };
    case "RESTARTING":
      return { label: "Restarting", tone: "slate" };
    case "INSUFFICIENT_DATA":
      return { label: "Not enough data yet", tone: "slate" };
  }
}

export function actionStatusDisplay(status: ActionStatus): { label: string; tone: Tone } {
  switch (status) {
    case "NOT_STARTED":
      return { label: "Not started", tone: "slate" };
    case "STARTED":
      return { label: "In progress", tone: "brass" };
    case "SELF_REPORTED_COMPLETE":
      return { label: "Completed (self-reported)", tone: "slate" };
    case "VERIFIED_COMPLETE":
      return { label: "Verified complete", tone: "sage" };
    case "MEASURED":
      return { label: "Measured", tone: "sage" };
    case "IMPROVED":
      return { label: "Improved", tone: "sage" };
    case "DEFERRED":
      return { label: "Deferred", tone: "slate" };
    case "BLOCKED":
      return { label: "Blocked", tone: "rust" };
    case "CANCELLED":
      return { label: "Cancelled", tone: "slate" };
  }
}

export function evidenceQualityDisplay(q: EvidenceQuality): { label: string } {
  switch (q) {
    case "SELF_REPORTED":
      return { label: "Self-reported" };
    case "OBSERVED":
      return { label: "Observed" };
    case "VERIFIED":
      return { label: "Verified" };
    case "MEASURED":
      return { label: "Measured" };
  }
}

export function difficultyDisplay(level: DifficultyLevel): { label: string } {
  switch (level) {
    case "BASIC":
      return { label: "Basic" };
    case "INTERMEDIATE":
      return { label: "Intermediate" };
    case "ADVANCED":
      return { label: "Advanced" };
    case "REALISTIC_SIMULATION":
      return { label: "Realistic simulation" };
  }
}

export function actionTypeDisplay(type: ActionType): { label: string } {
  switch (type) {
    case "SIMULATION":
      return { label: "Simulation" };
    case "PRACTICE":
      return { label: "Practice" };
    case "CONCEPT_SESSION":
      return { label: "Concept session" };
    case "REVIEW":
      return { label: "Review" };
    case "PROJECT_WORK":
      return { label: "Project work" };
    case "REFLECTION":
      return { label: "Reflection" };
  }
}

export function impactDisplay(impact: ActionImpact): { label: string; tone: Tone } {
  switch (impact) {
    case "POSITIVE_SIGNAL":
      return { label: "Positive signal", tone: "sage" };
    case "NO_CHANGE":
      return { label: "No measurable change", tone: "slate" };
    case "NEGATIVE_SIGNAL":
      return { label: "Needs a different approach", tone: "rust" };
    case "INSUFFICIENT_DATA":
      return { label: "Insufficient data", tone: "slate" };
  }
}

export const BLOCKER_REASON_OPTIONS: { code: BlockerReasonCode; label: string }[] = [
  { code: "DONT_UNDERSTAND", label: "I don't understand the topic" },
  { code: "TOO_DIFFICULT", label: "The task is too difficult" },
  { code: "NO_TIME", label: "I don't have enough time" },
  { code: "DONT_KNOW_START", label: "I don't know where to start" },
  { code: "MISSING_PREREQUISITE", label: "I don't have the prerequisite" },
  { code: "PRIORITY_CHANGED", label: "The priority changed" },
  { code: "OTHER", label: "Something else" },
];

export const DEFER_REASON_OPTIONS: { code: DeferReasonCode; label: string }[] = [
  { code: "TIME_UNAVAILABLE", label: "Time unavailable" },
  { code: "PRIORITY_CHANGED", label: "Priority changed" },
  { code: "TASK_DIFFICULT", label: "Task difficult" },
  { code: "TASK_UNCLEAR", label: "Task unclear" },
  { code: "OPPORTUNITY_CHANGED", label: "Opportunity changed" },
  { code: "PERSONAL_SCHEDULE", label: "Personal schedule" },
];

export function confidenceDisplay(level: ConfidenceLevel): { label: string } {
  switch (level) {
    case "LIMITED_DATA":
      return { label: "Limited data" };
    case "EARLY_SIGNAL":
      return { label: "Early signal" };
    case "EMERGING_PATTERN":
      return { label: "Emerging pattern" };
    case "REPEATED_PATTERN":
      return { label: "Repeated pattern" };
  }
}

export function frictionDisplay(type: string): string {
  switch (type) {
    case "TASK_TOO_LARGE":
      return "Tasks have been too large to finish in one sitting";
    case "TASK_TOO_VAGUE":
      return "Tasks have been unclear";
    case "TASK_TOO_DIFFICULT":
      return "Tasks have been too difficult at the current level";
    case "TIME_CONFLICT":
      return "Time has repeatedly been the constraint";
    case "DEADLINE_CONFLICT":
      return "Deadlines have been colliding with each other";
    case "MISSING_PREREQUISITE":
      return "A missing prerequisite has come up more than once";
    case "TOO_MANY_ACTIONS":
      return "Too many actions have been open at once";
    default:
      return type;
  }
}

export const TONE_CLASSES: Record<Tone, { bg: string; text: string; dot: string }> = {
  brass: { bg: "bg-brass-soft", text: "text-brass-strong", dot: "bg-brass" },
  sage: { bg: "bg-sage-soft", text: "text-sage", dot: "bg-sage" },
  rust: { bg: "bg-rust-soft", text: "text-rust", dot: "bg-rust" },
  slate: { bg: "bg-slate-soft", text: "text-slate", dot: "bg-slate" },
};
