import type { ActionType, DailyMission, DailyMissionSegment } from "./types.js";

// Proportions per action type — these are ratios, not fixed minutes, so the
// same template scales from a 15-minute micro-session to a 90-minute block
// (Phase 4: "the actual plan must come from the student's skill state").
const SEGMENT_TEMPLATES: Record<ActionType, { label: string; ratio: number; description: string }[]> = {
  LEARN: [
    { label: "Concept", ratio: 0.35, description: "Core explanation and worked examples." },
    { label: "Guided practice", ratio: 0.4, description: "Practice with support at each step." },
    { label: "Verification", ratio: 0.25, description: "A short check that the concept has landed." },
  ],
  RELEARN: [
    { label: "Rebuild", ratio: 0.4, description: "Revisit the concept from an earlier point." },
    { label: "Guided practice", ratio: 0.4, description: "Practice with support at each step." },
    { label: "Verification", ratio: 0.2, description: "A short check that the gap has closed." },
  ],
  PRACTICE: [
    { label: "Warm-up", ratio: 0.15, description: "A familiar refresher question." },
    { label: "Targeted practice", ratio: 0.6, description: "Application-level questions on this skill." },
    { label: "Challenge + verification", ratio: 0.25, description: "One harder question, then a quick check." },
  ],
  DRILL: [
    { label: "Focused drill", ratio: 0.8, description: "Short, repeated reps on the specific gap." },
    { label: "Verification", ratio: 0.2, description: "Confirm the drill closed the gap." },
  ],
  REVIEW: [
    { label: "Freshness check", ratio: 0.6, description: "A handful of questions to confirm retention." },
    { label: "Touch-up", ratio: 0.4, description: "Brief reinforcement if the check is shaky." },
  ],
  TRANSFER: [
    { label: "Familiar recap", ratio: 0.2, description: "Confirm the familiar pattern still holds." },
    { label: "Variant practice", ratio: 0.6, description: "Unfamiliar phrasings and combinations." },
    { label: "Verification", ratio: 0.2, description: "Check transfer has generalized." },
  ],
  SPEED_TRAIN: [
    { label: "Pace warm-up", ratio: 0.2, description: "A couple of untimed refreshers." },
    { label: "Timed reps", ratio: 0.6, description: "Same-difficulty questions against the clock." },
    { label: "Verification", ratio: 0.2, description: "Confirm pace under normal conditions." },
  ],
  RETEST: [{ label: "Re-assessment", ratio: 1, description: "Resolve conflicting evidence with a fresh set." }],
  ADVANCE: [{ label: "New skill introduction", ratio: 1, description: "Move into the next skill in the path." }],
  REST: [{ label: "Nothing scheduled", ratio: 1, description: "No action needed right now." }],
};

const MIN_SEGMENT_MINUTES = 2;

export function buildDailyMission(studentId: string, totalMinutes: number, primarySkillId: string, actionType: ActionType, now: Date = new Date()): DailyMission {
  const template = SEGMENT_TEMPLATES[actionType];
  let segments: DailyMissionSegment[] = template.map((t) => ({
    label: t.label,
    minutes: Math.max(0, Math.round(totalMinutes * t.ratio)),
    description: t.description,
  }));

  // For very small time budgets, collapse segments that would round to
  // near-nothing into the largest segment rather than showing a 0-minute step.
  const tiny = segments.filter((s) => s.minutes < MIN_SEGMENT_MINUTES);
  if (tiny.length && segments.length > 1) {
    const kept = segments.filter((s) => s.minutes >= MIN_SEGMENT_MINUTES);
    const reclaimed = tiny.reduce((sum, s) => sum + s.minutes, 0);
    if (kept.length) {
      kept[kept.length - 1].minutes += reclaimed;
      segments = kept;
    }
  }

  return { studentId, totalMinutes, primarySkillId, segments, generatedAt: now.toISOString() };
}
