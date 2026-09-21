import { randomUUID } from 'node:crypto';
import type { ProofRepository } from './proofRepository.js';
import type {
  VerificationEvidence, VerificationRequirement, VerificationResult, VerificationSession,
  SimulationProfile, ProofSnapshot, SessionResponse,
} from '../domain/types.js';

export class InMemoryProofRepository implements ProofRepository {
  requirements: VerificationRequirement[] = [];
  evidence: VerificationEvidence[] = [];
  profiles: SimulationProfile[] = [];
  sessions: VerificationSession[] = [];
  responses: SessionResponse[] = [];
  results: VerificationResult[] = [];
  snapshots: ProofSnapshot[] = [];

  async getActiveRequirement(targetId: string, capability: string) {
    return this.requirements.find((r) => r.targetId === targetId && r.capability === capability && r.isActive) ?? null;
  }

  async getEvidence(studentId: string, capability?: string) {
    return this.evidence.filter((e) => e.studentId === studentId && (!capability || e.capability === capability));
  }

  async saveEvidence(evidence: VerificationEvidence[]) {
    for (const e of evidence) {
      const idx = this.evidence.findIndex((x) => x.id === e.id);
      if (idx >= 0) this.evidence[idx] = e; else this.evidence.push(e);
    }
  }

  async createSimulationProfile(profile: Omit<SimulationProfile, 'id' | 'createdAt'>) {
    const created: SimulationProfile = { ...profile, id: randomUUID(), createdAt: new Date().toISOString() };
    this.profiles.push(created);
    return created;
  }

  async createSession(
    input: Omit<VerificationSession, 'id' | 'createdAt' | 'completedAt' | 'status' | 'startedAt'> & { status?: VerificationSession['status'] },
  ) {
    const now = new Date().toISOString();
    const created: VerificationSession = {
      ...input,
      id: randomUUID(),
      status: input.status ?? 'PENDING',
      startedAt: now,
      completedAt: null,
      createdAt: now,
    };
    this.sessions.push(created);
    return created;
  }

  async getSession(sessionId: string, studentId: string) {
    return this.sessions.find((s) => s.id === sessionId && s.studentId === studentId) ?? null;
  }

  async recordResponse(response: SessionResponse) {
    this.responses.push(response);
  }

  async getResponses(sessionId: string, studentId: string) {
    return this.responses.filter((r) => r.sessionId === sessionId && r.studentId === studentId);
  }

  async completeSession(sessionId: string, studentId: string) {
    const session = this.sessions.find((s) => s.id === sessionId && s.studentId === studentId);
    if (!session) throw new Error('SESSION_NOT_FOUND');
    if (session.status === 'COMPLETED') {
      return { session, alreadyCompleted: true };
    }
    session.status = 'COMPLETED';
    session.completedAt = new Date().toISOString();
    return { session, alreadyCompleted: false };
  }

  async saveResult(result: VerificationResult) {
    this.results.push(result);
    return result;
  }

  async getLatestResult(studentId: string, targetId: string) {
    const forTarget = this.results.filter((r) => r.studentId === studentId && r.targetId === targetId);
    return forTarget.length ? forTarget[forTarget.length - 1]! : null;
  }

  async saveSnapshot(snapshot: Omit<ProofSnapshot, 'id' | 'createdAt'>) {
    const created: ProofSnapshot = { ...snapshot, id: randomUUID(), createdAt: new Date().toISOString() };
    this.snapshots.push(created);
    return created;
  }

  async getHistory(studentId: string, targetId: string) {
    return this.snapshots
      .filter((s) => s.studentId === studentId && s.targetId === targetId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  async countRecentSessions(studentId: string, sinceHours: number) {
    const cutoff = Date.now() - sinceHours * 60 * 60 * 1000;
    return this.sessions.filter((s) => s.studentId === studentId && new Date(s.createdAt).getTime() >= cutoff).length;
  }

  async minutesSinceLastSession(studentId: string) {
    const mine = this.sessions.filter((s) => s.studentId === studentId);
    if (!mine.length) return null;
    const last = mine.reduce((a, b) => (new Date(a.createdAt) > new Date(b.createdAt) ? a : b));
    return (Date.now() - new Date(last.createdAt).getTime()) / 60000;
  }

  async withTransaction<T>(fn: (repo: ProofRepository) => Promise<T>): Promise<T> {
    // Single-threaded event loop, and every mutation below is synchronous
    // between its read and its write — there is no interleaving window for
    // two "concurrent" callers to race each other the way real DB clients
    // can, so a real transaction isn't needed here.
    return fn(this);
  }
}
