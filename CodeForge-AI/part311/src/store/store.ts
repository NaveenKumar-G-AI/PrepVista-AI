/**
 * CodeForge — Store
 *
 * An in-memory implementation of the repository the service layer needs.
 * The persisted shape it mirrors lives in db/migrations/0001_init.sql — swap
 * this class for a Supabase-backed one behind the same method signatures and
 * nothing in src/service or src/engine has to change. That boundary is
 * deliberate: it's what makes "standalone reference implementation, integrate
 * into the real codebase yourselves" (this whole project's stated goal)
 * actually feasible.
 */

import {
  ChallengeLifecycleStatus,
  type Attempt,
  type Challenge,
  type ChallengeQualityAnalytics,
  type MisconceptionRecord,
  type StudentProfile,
} from "../domain/types.js";

export class InMemoryStore {
  private challenges = new Map<string, Challenge>();
  private profiles = new Map<string, StudentProfile>();
  private attempts: Attempt[] = [];
  private misconceptions: MisconceptionRecord[] = [];

  // --- challenges ---------------------------------------------------------

  seedChallenges(list: Challenge[]): void {
    for (const c of list) this.challenges.set(c.challengeId, c);
  }

  upsertChallenge(challenge: Challenge): void {
    this.challenges.set(challenge.challengeId, challenge);
  }

  getChallenge(challengeId: string): Challenge | undefined {
    return this.challenges.get(challengeId);
  }

  listActiveChallenges(): Challenge[] {
    return Array.from(this.challenges.values()).filter((c) => c.qualityStatus === ChallengeLifecycleStatus.ACTIVE);
  }

  listAllChallenges(): Challenge[] {
    return Array.from(this.challenges.values());
  }

  /** §38 — rolling quality analytics updated from a real (student, outcome) event, not estimated. */
  recordChallengeOutcome(
    challengeId: string,
    outcome: { passed: boolean; hintsUsed: number; completionMs: number; systemError: boolean; abandoned: boolean },
  ): void {
    const challenge = this.challenges.get(challengeId);
    if (!challenge) return;
    const prev: ChallengeQualityAnalytics = challenge.qualityAnalytics ?? {
      attemptCount: 0,
      passCount: 0,
      passRate: 0,
      medianCompletionMs: null,
      avgHintsUsed: 0,
      abandonmentCount: 0,
      systemErrorCount: 0,
      flags: [],
    };
    const attemptCount = prev.attemptCount + 1;
    const passCount = prev.passCount + (outcome.passed ? 1 : 0);
    const passRate = passCount / attemptCount;
    const avgHintsUsed = (prev.avgHintsUsed * prev.attemptCount + outcome.hintsUsed) / attemptCount;
    const abandonmentCount = prev.abandonmentCount + (outcome.abandoned ? 1 : 0);
    const systemErrorCount = prev.systemErrorCount + (outcome.systemError ? 1 : 0);

    // §39 — flag, don't diagnose: an extreme pass rate could mean a broken test, ambiguous
    // wording, or a miscalibrated difficulty label. This records that something is worth a
    // human look, not which of those it is.
    const flags: string[] = [];
    if (attemptCount >= 5 && passRate > 0.98) flags.push("SUSPICIOUSLY_HIGH_PASS_RATE");
    if (attemptCount >= 5 && passRate < 0.02) flags.push("SUSPICIOUSLY_LOW_PASS_RATE");
    if (attemptCount >= 5 && systemErrorCount / attemptCount > 0.2) flags.push("ELEVATED_SYSTEM_ERROR_RATE");

    this.challenges.set(challengeId, {
      ...challenge,
      qualityAnalytics: { attemptCount, passCount, passRate, medianCompletionMs: prev.medianCompletionMs, avgHintsUsed, abandonmentCount, systemErrorCount, flags },
      updatedAt: new Date().toISOString(),
    });
  }

  // --- student profiles -----------------------------------------------------

  getProfile(studentId: string): StudentProfile | undefined {
    return this.profiles.get(studentId);
  }

  saveProfile(profile: StudentProfile): void {
    this.profiles.set(profile.studentId, profile);
  }

  // --- attempts (§22 — immutable once finalized) -----------------------------

  createAttempt(attempt: Attempt): void {
    this.attempts.push(attempt);
  }

  getAttempt(attemptId: string): Attempt | undefined {
    return this.attempts.find((a) => a.attemptId === attemptId);
  }

  /** Only valid while the attempt is still pre-submission (STARTED/DRAFT) — see codeforgeService. */
  updateAttempt(attemptId: string, patch: Partial<Attempt>): Attempt {
    const idx = this.attempts.findIndex((a) => a.attemptId === attemptId);
    if (idx === -1) throw new Error(`attempt ${attemptId} not found`);
    const updated = { ...this.attempts[idx]!, ...patch };
    this.attempts[idx] = updated;
    return updated;
  }

  listAttempts(studentId: string, challengeId?: string): Attempt[] {
    return this.attempts
      .filter((a) => a.studentId === studentId && (!challengeId || a.challengeId === challengeId))
      .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)); // most recent first
  }

  // --- misconceptions (§28) --------------------------------------------------

  getMisconceptions(studentId: string): MisconceptionRecord[] {
    return this.misconceptions.filter((m) => m.studentId === studentId);
  }

  setMisconceptions(studentId: string, records: MisconceptionRecord[]): void {
    this.misconceptions = [...this.misconceptions.filter((m) => m.studentId !== studentId), ...records];
  }
}
