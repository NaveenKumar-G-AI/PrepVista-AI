/**
 * PHASE 23: "Never let AI overwrite deterministic execution truth." These
 * functions turn persisted submissions/events into plain facts. The
 * qualitative layer (AI-assisted) in evaluationEngine.ts is built on top of
 * these facts — it never substitutes for them.
 */

export interface SubmissionFact {
  submissionType: 'RUN' | 'SUBMIT';
  passed: boolean | null;
}

export interface EventFact {
  eventType: string;
  payload?: Record<string, unknown>;
}

export interface TestingEvidence {
  totalRuns: number;
  failuresSeen: number;
  edgeCasesTested: boolean;
  finalSubmissionPassed: boolean;
}

export function computeTestingEvidence(submissions: SubmissionFact[], events: EventFact[]): TestingEvidence {
  const runs = submissions.filter(s => s.submissionType === 'RUN');
  const failures = runs.filter(s => s.passed === false);
  const finalSubmit = [...submissions].reverse().find(s => s.submissionType === 'SUBMIT');
  return {
    totalRuns: runs.length,
    failuresSeen: failures.length,
    edgeCasesTested: events.some(e => e.eventType === 'STUDENT_TESTED_EDGE_CASE'),
    finalSubmissionPassed: finalSubmit?.passed === true,
  };
}

export interface DebuggingEvidence {
  debuggingCyclesEntered: number;
  recoveredFromFailure: boolean;
}

export function computeDebuggingEvidence(events: EventFact[]): DebuggingEvidence {
  return {
    debuggingCyclesEntered: events.filter(e => e.eventType === 'DEBUGGING_STARTED').length,
    recoveredFromFailure: events.some(e => e.eventType === 'TEST_FAILED') && events.some(e => e.eventType === 'TEST_PASSED'),
  };
}

export interface IndependenceEvidence {
  hintsUsed: { level: string; count: number }[];
  totalHints: number;
}

export function computeIndependenceEvidence(events: EventFact[]): IndependenceEvidence {
  const hintEvents = events.filter(e => e.eventType === 'HINT_REQUESTED');
  const byLevel = new Map<string, number>();
  for (const e of hintEvents) {
    const level = String(e.payload?.level ?? 'UNKNOWN');
    byLevel.set(level, (byLevel.get(level) ?? 0) + 1);
  }
  return {
    hintsUsed: [...byLevel.entries()].map(([level, count]) => ({ level, count })),
    totalHints: hintEvents.length,
  };
}

export interface AdaptabilityEvidence {
  constraintChangesPresented: number;
  adaptedSuccessfully: number;
}

export function computeAdaptabilityEvidence(events: EventFact[]): AdaptabilityEvidence {
  const presented = events.filter(e => e.eventType === 'FOLLOWUP_ASKED' && e.payload?.focus === 'scale').length;
  const adapted = events.filter(e => e.eventType === 'STUDENT_ADAPTED_TO_CONSTRAINT').length;
  return { constraintChangesPresented: presented, adaptedSuccessfully: adapted };
}
