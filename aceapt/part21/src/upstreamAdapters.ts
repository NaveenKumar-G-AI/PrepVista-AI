// ============================================================
// UPSTREAM ADAPTERS
//
// Feature 21 does not own student data. It reads signals from
// Features 13–20 and writes intervention outcomes back to
// Feature 16. This file defines the contract for each of those
// features as Feature 21 needs to see them, and nothing else.
//
// MockUpstreamBundle below is a stand-in so this engine runs and
// is testable on its own. IT IS NOT REAL DATA. Replace each method
// with a call into your real Feature 13–20 services (in-process
// module call, internal HTTP call, DB query — whatever those
// features already expose) and delete the mock. The rest of the
// engine (diagnosisEngine, actionScoring, orchestrator …) does not
// need to change when you do this: it only depends on the
// interfaces below, not on MockUpstreamBundle.
// ============================================================

import {
  AttemptEvidence,
  InterventionRecord,
  MasteryEvidence,
  ReasoningTraceEvidence,
  RetentionEvidence,
  Skill,
  SkillId,
  SimulationEvidence,
  Student,
  StudentId,
  TransferEvidence,
} from './types';

/** Feature 13 — Readiness Intelligence */
export interface Feature13Readiness {
  getReadinessSignal(
    studentId: StudentId,
    skillId: SkillId
  ): { readinessScore: number; isReadinessCritical: boolean };
}

/** Feature 14 — Mastery + Transfer Intelligence */
export interface Feature14MasteryTransfer {
  /** Returns null when there is no mastery record at all for this student/skill — distinct from a record that confirms masteryLevel 0. Callers must not treat "no data" as "confirmed weak". */
  getMastery(studentId: StudentId, skillId: SkillId): MasteryEvidence | null;
  getTransfer(studentId: StudentId, skillId: SkillId): TransferEvidence | null;
}

/** Feature 15 — Learning Journey Intelligence */
export interface Feature15LearningJourney {
  getTimeline(studentId: StudentId, skillId: SkillId): { event: string; date: string }[];
}

/** Feature 16 — Intervention + Recovery. Feature 21 reads AND writes here. */
export interface Feature16InterventionRecovery {
  getPastInterventions(studentId: StudentId, skillId: SkillId): InterventionRecord[];
  recordInterventionOutcome(record: InterventionRecord): void;
}

/** Feature 17 — Question Intelligence */
export interface Feature17QuestionIntelligence {
  getAttempts(studentId: StudentId, skillId: SkillId): AttemptEvidence[];
}

/** Feature 18 — Reasoning Intelligence */
export interface Feature18ReasoningIntelligence {
  getReasoningTraces(studentId: StudentId, skillId: SkillId): ReasoningTraceEvidence[];
}

/** Feature 19 — Retention Intelligence */
export interface Feature19Retention {
  getRetentionSignal(studentId: StudentId, skillId: SkillId): RetentionEvidence | null;
}

/** Feature 20 — Real-World Simulation + Pressure Intelligence */
export interface Feature20SimulationPressure {
  getSimulationSignal(studentId: StudentId, skillId: SkillId): SimulationEvidence | null;
}

/**
 * Everything Feature 21 needs from the rest of ACEAPT, bundled into one
 * object so the orchestrator can take a single dependency. A real
 * implementation would likely be eight small classes, each calling its
 * own feature's real API — that's fine, just implement this same shape.
 */
export interface UpstreamEvidenceProvider
  extends Feature13Readiness,
    Feature14MasteryTransfer,
    Feature15LearningJourney,
    Feature16InterventionRecovery,
    Feature17QuestionIntelligence,
    Feature18ReasoningIntelligence,
    Feature19Retention,
    Feature20SimulationPressure {
  getStudent(studentId: StudentId): Student;
  getSkillGraph(): Skill[];
}

// ------------------------------------------------------------
// Mock implementation — in-memory, seeded from mockData.ts
// ------------------------------------------------------------

/** Everything about one student, exactly as if it came from Features 13–20. */
export interface StudentFixture {
  attempts: AttemptEvidence[];
  reasoningTraces: ReasoningTraceEvidence[];
  retention: RetentionEvidence[];
  transfer: TransferEvidence[];
  simulation: SimulationEvidence[];
  mastery: MasteryEvidence[];
  interventions: InterventionRecord[];
}

export interface MockDataset {
  students: Student[];
  skills: Skill[];
  byStudent: Record<StudentId, StudentFixture>;
}

export class MockUpstreamBundle implements UpstreamEvidenceProvider {
  private byStudent: Record<StudentId, StudentFixture>;

  constructor(private data: MockDataset) {
    // Shallow-copy each student's intervention list so recordInterventionOutcome()
    // doesn't mutate the seed fixtures in mockData.ts.
    this.byStudent = Object.fromEntries(
      Object.entries(data.byStudent).map(([studentId, fixture]) => [
        studentId,
        { ...fixture, interventions: [...fixture.interventions] },
      ])
    );
  }

  private fixture(studentId: StudentId): StudentFixture {
    const found = this.byStudent[studentId];
    if (!found) throw new Error(`No mock fixture data for student: ${studentId}`);
    return found;
  }

  getStudent(studentId: StudentId): Student {
    const student = this.data.students.find((s) => s.id === studentId);
    if (!student) throw new Error(`Unknown student: ${studentId}`);
    return student;
  }

  getSkillGraph(): Skill[] {
    return this.data.skills;
  }

  getReadinessSignal(studentId: StudentId, skillId: SkillId) {
    // In production: Feature 13's readiness model for this student/skill pair.
    const mastery = this.getMastery(studentId, skillId);
    if (!mastery) return { readinessScore: 0.5, isReadinessCritical: false }; // no data yet — stay neutral, don't manufacture urgency
    const readinessScore = mastery.neverLearned ? 0.1 : mastery.masteryLevel;
    return { readinessScore, isReadinessCritical: readinessScore < 0.6 };
  }

  getMastery(studentId: StudentId, skillId: SkillId): MasteryEvidence | null {
    return this.fixture(studentId).mastery.find((m) => m.skillId === skillId) ?? null;
  }

  getTransfer(studentId: StudentId, skillId: SkillId): TransferEvidence | null {
    return this.fixture(studentId).transfer.find((t) => t.skillId === skillId) ?? null;
  }

  getTimeline(studentId: StudentId, skillId: SkillId) {
    // In production: Feature 15's per-skill event log for this student.
    const mastery = this.getMastery(studentId, skillId);
    if (!mastery?.masteredOn) return [];
    return [{ event: 'MASTERY_CONFIRMED', date: mastery.masteredOn }];
  }

  getPastInterventions(studentId: StudentId, skillId: SkillId): InterventionRecord[] {
    return this.fixture(studentId).interventions.filter((i) => i.skillId === skillId);
  }

  recordInterventionOutcome(record: InterventionRecord): void {
    // In production: write into Feature 16's store. Here, in-memory only —
    // it will not survive past this process.
    this.fixture(record.studentId).interventions.push(record);
  }

  getAttempts(studentId: StudentId, skillId: SkillId): AttemptEvidence[] {
    return this.fixture(studentId).attempts.filter((a) => a.skillId === skillId);
  }

  getReasoningTraces(studentId: StudentId, skillId: SkillId): ReasoningTraceEvidence[] {
    return this.fixture(studentId).reasoningTraces.filter((r) => r.skillId === skillId);
  }

  getRetentionSignal(studentId: StudentId, skillId: SkillId): RetentionEvidence | null {
    return this.fixture(studentId).retention.find((r) => r.skillId === skillId) ?? null;
  }

  getSimulationSignal(studentId: StudentId, skillId: SkillId): SimulationEvidence | null {
    return this.fixture(studentId).simulation.find((s) => s.skillId === skillId) ?? null;
  }
}
