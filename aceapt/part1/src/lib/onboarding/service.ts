/**
 * Domain service layer for onboarding.
 *
 * This is the ONLY file that touches the database directly. Every Route Handler and Server
 * Component goes through the functions exported here — most importantly
 * `getStudentOnboardingContext(studentId)`, which is written to match spec section 29 exactly:
 * a stable, typed function the future Diagnostic Engine can call without knowing anything about
 * SQL, React, or how the onboarding UI is built. src/app/diagnostic/page.tsx proves this by
 * calling the identical function from a completely separate route.
 */
import { getDb } from "@/lib/db";
import { daysUntil } from "@/lib/utils";
import {
  emptyContext,
  ONBOARDING_EVENTS,
  AVAILABILITY_MINUTES,
  type StudentOnboardingContext,
  type OnboardingEventType,
  type OnboardingSummary,
  type AvailabilityCategory,
} from "./types";
import { STEP_EVENT_MAP } from "./flow";
import type { StepId } from "./validation";
import { generateOnboardingSummary } from "./summary";

interface OnboardingContextRow {
  id: string;
  studentId: string;
  preparationGoal: string | null;
  preparationGoalOther: string | null;
  primaryObjective: string | null;
  secondaryObjectives: string;
  timelineCategory: string | null;
  targetDate: string | null;
  daysAvailable: number | null;
  experienceLevel: string | null;
  previousPreparation: string | null;
  previousDifficulties: string;
  selfPerceivedQuantitative: string | null;
  selfPerceivedLogical: string | null;
  selfPerceivedVerbal: string | null;
  selfPerceivedTimePressure: string | null;
  dailyAvailability: string | null;
  dailyAvailabilityMinutes: number | null;
  preferredStudyTime: string | null;
  preferredAssistanceModes: string;
  initialDifficultyPreference: string | null;
  primaryPainPoint: string | null;
  secondaryPainPoints: string;
  targetScore: string | null;
  onboardingStatus: string;
  onboardingStartedAt: string | null;
  onboardingCompletedAt: string | null;
  lastEditedAt: string | null;
  contextVersion: number;
  aiSummary: string | null;
  aiSummarySource: string | null;
  aiSummaryModel: string | null;
  aiSummaryGeneratedAt: string | null;
  measuredQuantitative: number | null;
  measuredLogical: number | null;
  measuredVerbal: number | null;
  measuredTimePressure: number | null;
  measuredAt: string | null;
  sourceDiagnosticId: string | null;
  createdAt: string;
  updatedAt: string;
}

function parseJsonArray<T = string>(value: string): T[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mapRowToContext(row: OnboardingContextRow): StudentOnboardingContext {
  return {
    studentId: row.studentId,
    preparationGoal: row.preparationGoal as StudentOnboardingContext["preparationGoal"],
    preparationGoalOther: row.preparationGoalOther,
    primaryObjective: row.primaryObjective as StudentOnboardingContext["primaryObjective"],
    secondaryObjectives: parseJsonArray(row.secondaryObjectives),
    timelineCategory: row.timelineCategory as StudentOnboardingContext["timelineCategory"],
    targetDate: row.targetDate,
    daysAvailable: row.daysAvailable,
    experienceLevel: row.experienceLevel as StudentOnboardingContext["experienceLevel"],
    previousPreparation: row.previousPreparation as StudentOnboardingContext["previousPreparation"],
    previousDifficulties: parseJsonArray(row.previousDifficulties),
    selfPerceivedConfidence: {
      quantitative: row.selfPerceivedQuantitative as StudentOnboardingContext["selfPerceivedConfidence"]["quantitative"],
      logical: row.selfPerceivedLogical as StudentOnboardingContext["selfPerceivedConfidence"]["logical"],
      verbal: row.selfPerceivedVerbal as StudentOnboardingContext["selfPerceivedConfidence"]["verbal"],
      timePressure: row.selfPerceivedTimePressure as StudentOnboardingContext["selfPerceivedConfidence"]["timePressure"],
    },
    measuredCapability: {
      quantitative: row.measuredQuantitative,
      logical: row.measuredLogical,
      verbal: row.measuredVerbal,
      timePressure: row.measuredTimePressure,
      measuredAt: row.measuredAt,
      sourceDiagnosticId: row.sourceDiagnosticId,
    },
    dailyAvailability: row.dailyAvailability as StudentOnboardingContext["dailyAvailability"],
    dailyAvailabilityMinutes: row.dailyAvailabilityMinutes,
    preferredStudyTime: row.preferredStudyTime as StudentOnboardingContext["preferredStudyTime"],
    preferredAssistanceModes: parseJsonArray(row.preferredAssistanceModes),
    initialDifficultyPreference: row.initialDifficultyPreference as StudentOnboardingContext["initialDifficultyPreference"],
    primaryPainPoint: row.primaryPainPoint as StudentOnboardingContext["primaryPainPoint"],
    secondaryPainPoints: parseJsonArray(row.secondaryPainPoints),
    targetScore: row.targetScore as StudentOnboardingContext["targetScore"],
    onboardingStatus: row.onboardingStatus as StudentOnboardingContext["onboardingStatus"],
    onboardingStartedAt: row.onboardingStartedAt,
    onboardingCompletedAt: row.onboardingCompletedAt,
    lastEditedAt: row.lastEditedAt,
    contextVersion: row.contextVersion,
    summary: row.aiSummary
      ? {
          text: row.aiSummary,
          source: (row.aiSummarySource ?? "deterministic") as OnboardingSummary["source"],
          model: row.aiSummaryModel,
          generatedAt: row.aiSummaryGeneratedAt,
        }
      : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function getContextRow(studentId: string): OnboardingContextRow | undefined {
  return getDb()
    .prepare("SELECT * FROM OnboardingContext WHERE studentId = ?")
    .get(studentId) as OnboardingContextRow | undefined;
}

export function ensureStudent(studentId: string): void {
  const db = getDb();
  const exists = db.prepare("SELECT 1 FROM Student WHERE id = ?").get(studentId);
  if (!exists) {
    db.prepare("INSERT INTO Student (id, createdAt) VALUES (?, ?)").run(studentId, new Date().toISOString());
  }
}

/**
 * THE FUTURE-COMPATIBLE CONTRACT (spec section 29).
 * Any future feature — the Diagnostic Engine, Skill Intelligence, the AI Tutor — reads
 * onboarding context exclusively through this function. It never needs to know this is SQLite
 * today, or that it might be Postgres tomorrow.
 */
export async function getStudentOnboardingContext(studentId: string): Promise<StudentOnboardingContext> {
  ensureStudent(studentId);
  const row = getContextRow(studentId);
  return row ? mapRowToContext(row) : emptyContext(studentId);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function columnsForStep(stepId: StepId, value: any, now: Date): Record<string, unknown> {
  switch (stepId) {
    case "goal":
      return {
        preparationGoal: value.preparationGoal,
        preparationGoalOther: value.preparationGoal === "OTHER" ? (value.preparationGoalOther ?? null) : null,
      };
    case "objective": {
      const secondary = ((value.secondaryObjectives ?? []) as string[]).filter((v) => v !== value.primaryObjective);
      return { primaryObjective: value.primaryObjective, secondaryObjectives: JSON.stringify(secondary) };
    }
    case "timeline": {
      const days = value.targetDate ? daysUntil(value.targetDate, now) : null;
      return { timelineCategory: value.timelineCategory, targetDate: value.targetDate ?? null, daysAvailable: days };
    }
    case "experience":
      return { experienceLevel: value.experienceLevel };
    case "previous-preparation":
      return { previousPreparation: value.previousPreparation };
    case "previous-difficulties":
      return { previousDifficulties: JSON.stringify(value.previousDifficulties ?? []) };
    case "confidence-map":
      return {
        selfPerceivedQuantitative: value.quantitative,
        selfPerceivedLogical: value.logical,
        selfPerceivedVerbal: value.verbal,
        selfPerceivedTimePressure: value.timePressure,
      };
    case "daily-availability": {
      const minutes = AVAILABILITY_MINUTES[value.dailyAvailability as AvailabilityCategory];
      return { dailyAvailability: value.dailyAvailability, dailyAvailabilityMinutes: minutes ?? null };
    }
    case "study-schedule":
      return { preferredStudyTime: value.preferredStudyTime };
    case "assistance-preference":
      return { preferredAssistanceModes: JSON.stringify(value.preferredAssistanceModes ?? []) };
    case "difficulty-preference":
      return { initialDifficultyPreference: value.initialDifficultyPreference };
    case "pain-point": {
      const secondary = ((value.secondaryPainPoints ?? []) as string[]).filter((v) => v !== value.primaryPainPoint);
      return { primaryPainPoint: value.primaryPainPoint, secondaryPainPoints: JSON.stringify(secondary) };
    }
    case "target-score":
      return { targetScore: value.targetScore };
    default:
      return {};
  }
}

/**
 * Persists one step's answer. If the student already completed onboarding, this is treated as
 * an edit (spec section 23): contextVersion increments and ONBOARDING_EDITED is logged instead
 * of the step's normal event, but the completed status itself is left alone — the student isn't
 * sent back through the whole flow to change one fact.
 */
export async function saveStepAnswer(
  studentId: string,
  stepId: StepId,
  value: unknown,
): Promise<{ context: StudentOnboardingContext; isEdit: boolean }> {
  ensureStudent(studentId);
  const db = getDb();
  const now = new Date();
  const nowIso = now.toISOString();

  const existingRow = getContextRow(studentId);
  const isEdit = existingRow?.onboardingStatus === "COMPLETED";
  const columns = columnsForStep(stepId, value, now);

  if (!existingRow) {
    const allColumns: Record<string, unknown> = {
      id: crypto.randomUUID(),
      studentId,
      onboardingStatus: "IN_PROGRESS",
      onboardingStartedAt: nowIso,
      contextVersion: 1,
      createdAt: nowIso,
      updatedAt: nowIso,
      ...columns,
    };
    const keys = Object.keys(allColumns);
    db.prepare(`INSERT INTO OnboardingContext (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`).run(
      ...keys.map((k) => allColumns[k] as never),
    );
  } else {
    const setClauses: Record<string, unknown> = { ...columns, updatedAt: nowIso };
    if (isEdit) {
      setClauses.contextVersion = existingRow.contextVersion + 1;
      setClauses.lastEditedAt = nowIso;
    } else if (existingRow.onboardingStatus === "NOT_STARTED") {
      setClauses.onboardingStatus = "IN_PROGRESS";
      setClauses.onboardingStartedAt = existingRow.onboardingStartedAt ?? nowIso;
    }
    const setSql = Object.keys(setClauses)
      .map((k) => `${k} = ?`)
      .join(", ");
    db.prepare(`UPDATE OnboardingContext SET ${setSql} WHERE studentId = ?`).run(
      ...Object.values(setClauses).map((v) => v as never),
      studentId as never,
    );
  }

  await logEvent(studentId, isEdit ? ONBOARDING_EVENTS.ONBOARDING_EDITED : STEP_EVENT_MAP[stepId], { stepId });

  const row = getContextRow(studentId)!;
  return { context: mapRowToContext(row), isEdit };
}

export async function completeOnboarding(studentId: string): Promise<StudentOnboardingContext> {
  const db = getDb();
  const nowIso = new Date().toISOString();
  const row = getContextRow(studentId);
  if (!row) {
    throw new Error("Cannot complete onboarding before any answers have been saved.");
  }
  if (row.onboardingStatus !== "COMPLETED") {
    db.prepare(
      `UPDATE OnboardingContext SET onboardingStatus = 'COMPLETED', onboardingCompletedAt = ?, updatedAt = ? WHERE studentId = ?`,
    ).run(nowIso, nowIso, studentId);
    await logEvent(studentId, ONBOARDING_EVENTS.ONBOARDING_COMPLETED, {});
  }
  return mapRowToContext(getContextRow(studentId)!);
}

async function saveSummary(
  studentId: string,
  summary: { text: string; source: "ai" | "deterministic"; model: string | null },
): Promise<void> {
  const db = getDb();
  const nowIso = new Date().toISOString();
  db.prepare(
    `UPDATE OnboardingContext SET aiSummary = ?, aiSummarySource = ?, aiSummaryModel = ?, aiSummaryGeneratedAt = ?, updatedAt = ? WHERE studentId = ?`,
  ).run(summary.text, summary.source, summary.model, nowIso, nowIso, studentId);
}

/**
 * Returns the cached summary if it's still fresh, otherwise generates a new one (AI first,
 * deterministic fallback — see summary.ts) and caches it. Never regenerates on every page view
 * (spec section 39): only when there is no summary yet, an edit happened after the last
 * generation, or the caller explicitly forces it.
 */
export async function getOrGenerateSummary(studentId: string, forceRegenerate = false): Promise<OnboardingSummary> {
  const row = getContextRow(studentId);
  if (!row) throw new Error("No onboarding context to summarize yet.");

  const isStale =
    !row.aiSummary ||
    (row.lastEditedAt != null && (row.aiSummaryGeneratedAt == null || row.lastEditedAt > row.aiSummaryGeneratedAt));

  if (row.aiSummary && !isStale && !forceRegenerate) {
    return {
      text: row.aiSummary,
      source: (row.aiSummarySource ?? "deterministic") as OnboardingSummary["source"],
      model: row.aiSummaryModel,
      generatedAt: row.aiSummaryGeneratedAt,
    };
  }

  const context = mapRowToContext(row);
  const generated = await generateOnboardingSummary(context);
  await saveSummary(studentId, generated);
  return {
    text: generated.text,
    source: generated.source,
    model: generated.model ?? null,
    generatedAt: new Date().toISOString(),
  };
}

export async function logEvent(
  studentId: string,
  eventType: OnboardingEventType,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  ensureStudent(studentId);
  getDb()
    .prepare(`INSERT INTO OnboardingEvent (id, studentId, eventType, metadata, createdAt) VALUES (?, ?, ?, ?, ?)`)
    .run(crypto.randomUUID(), studentId, eventType, JSON.stringify(metadata), new Date().toISOString());
}
