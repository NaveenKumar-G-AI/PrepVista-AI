/**
 * Every interface in this file represents a system PHASE 0 of the spec
 * assumes already exists in CodeForge. This engine depends on these
 * interfaces and never implements the systems behind them — implement each
 * one against your real code. See the README's status table for exactly
 * which of these are genuinely wired up here vs. left as an interface.
 */

export interface ExecutionResult {
  compiled: boolean;
  stderr: string | null;
  stdout: string | null;
  testResults: { name: string; passed: boolean; message?: string }[];
  runtimeMs: number | null;
  memoryKb: number | null;
}

/**
 * Implement against your existing CodeForge sandbox/execution service.
 * PHASE 11: "Never fake: compiler errors, execution, test results, runtime,
 * memory." This engine calls .run() and persists exactly what comes back —
 * it has no execution logic of its own.
 */
export interface CodeExecutionAdapter {
  run(params: { code: string; language: string; challengeId: string; hiddenTests: boolean }): Promise<ExecutionResult>;
}

export interface Challenge {
  id: string;
  title: string;
  statement: string;
  constraints: string;
  competencies: string[];
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  supportedLanguages: string[];
}

/** Implement against your existing challenge bank (PHASE 4: "Do not create
 *  a second challenge database."). */
export interface ChallengeRepository {
  findCandidates(criteria: { competencies: string[]; difficulty?: string; excludeChallengeIds: string[] }): Promise<Challenge[]>;
}

export interface ExposureRecord {
  challengeId: string;
  viewedAt: string | null;
  attemptedAt: string | null;
  solvedAt: string | null;
  usedInAssessmentAt: string | null;
  usedInInterviewAt: string | null;
}

/** Implement against whatever already tracks PROBLEM_VIEWED / SOLVED /
 *  USED_IN_ASSESSMENT etc. If nothing tracks this yet, it's a genuine gap —
 *  see the README status table rather than assuming it's covered. */
export interface ExposureRepository {
  getExposure(studentId: string, challengeIds: string[]): Promise<ExposureRecord[]>;
}

export interface InterviewEvidencePacket {
  interviewId: string;
  studentId: string;
  targetRole: string;
  dimensionResults: { dimension: string; rating: string; evidenceSummary: string }[];
}

/** Implement against your existing Mastery Engine (PHASE 26). This engine
 *  produces evidence; it never computes skill state itself. */
export interface MasteryEvidenceSink {
  recordInterviewEvidence(packet: InterviewEvidencePacket): Promise<void>;
}

/** Implement against your existing Roadmap Engine (PHASE 27). */
export interface RoadmapService {
  triggerRecalculation(studentId: string): Promise<void>;
}

export interface EventLoggerAdapter {
  log(
    interviewId: string,
    eventType: string,
    payload: Record<string, unknown>,
    createdBy: 'STUDENT' | 'SYSTEM' | 'AI' | 'INTERVIEWER',
  ): Promise<void>;
}

/** Implement against your Supabase auth/session context (or equivalent). */
export interface AuthContextProvider {
  getCurrentStudentId(): Promise<string | null>;
  isTpoForStudent(studentId: string): Promise<boolean>;
}
