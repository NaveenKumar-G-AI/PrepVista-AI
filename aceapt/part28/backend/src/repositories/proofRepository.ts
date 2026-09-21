import type {
  VerificationEvidence, VerificationRequirement, VerificationResult, VerificationSession,
  SimulationProfile, ProofSnapshot, SessionResponse,
} from '../domain/types.js';

export interface ProofRepository {
  getActiveRequirement(targetId: string, capability: string): Promise<VerificationRequirement | null>;
  getEvidence(studentId: string, capability?: string): Promise<VerificationEvidence[]>;
  saveEvidence(evidence: VerificationEvidence[]): Promise<void>;

  createSimulationProfile(profile: Omit<SimulationProfile, 'id' | 'createdAt'>): Promise<SimulationProfile>;

  createSession(
    input: Omit<VerificationSession, 'id' | 'createdAt' | 'completedAt' | 'status' | 'startedAt'> & { status?: VerificationSession['status'] },
  ): Promise<VerificationSession>;
  getSession(sessionId: string, studentId: string): Promise<VerificationSession | null>;
  recordResponse(response: SessionResponse): Promise<void>;
  getResponses(sessionId: string, studentId: string): Promise<SessionResponse[]>;
  completeSession(sessionId: string, studentId: string): Promise<{ session: VerificationSession; alreadyCompleted: boolean }>;

  saveResult(result: VerificationResult): Promise<VerificationResult>;
  getLatestResult(studentId: string, targetId: string): Promise<VerificationResult | null>;

  saveSnapshot(snapshot: Omit<ProofSnapshot, 'id' | 'createdAt'>): Promise<ProofSnapshot>;
  getHistory(studentId: string, targetId: string): Promise<ProofSnapshot[]>;

  countRecentSessions(studentId: string, sinceHours: number): Promise<number>;
  minutesSinceLastSession(studentId: string): Promise<number | null>;

  /** Runs `fn` with a repository bound to a single database transaction.
   *  Section 49: this is what makes a concurrent duplicate completion call
   *  safe end-to-end (evidence + result + snapshot together), not just the
   *  status column — see ProofService.completeVerification. Implementations
   *  without real concurrency (e.g. an in-memory repository in a
   *  single-threaded event loop) may simply run `fn(this)` directly. */
  withTransaction<T>(fn: (repo: ProofRepository) => Promise<T>): Promise<T>;
}
