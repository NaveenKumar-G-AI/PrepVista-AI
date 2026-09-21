import { EnginePorts } from '../integration/ports';
import { selectNextChallenge } from '../engine/selector';
import { explainForStudent, explainForInstructor } from '../explain/explain';
import { prioritizeSkills } from '../engine/pathIntent';
import { advanceAdaptivePath, initAdaptivePath } from '../engine/adaptivePath';
import { SelectionContext } from '../types';

/**
 * API layer. These handlers are intentionally framework-agnostic (no
 * Express/Next.js types) so they can be wired into whatever HTTP layer
 * this repository actually uses — see api/exampleExpressRouter.ts for one
 * illustrative wiring. Every handler is server-authoritative: it re-derives
 * whatever it needs from ports rather than trusting client-submitted state
 * (spec: "Avoid Gaming" / "The server must derive critical state from
 * authoritative records").
 */

export interface AuthContext {
  userId: string;
  role: 'STUDENT' | 'INSTRUCTOR' | 'ADMIN';
}

export class AuthorizationError extends Error {}

function assertOwnerOrStaff(auth: AuthContext, studentId: string): void {
  if (auth.role === 'STUDENT' && auth.userId !== studentId) {
    throw new AuthorizationError('Students may only access their own data.');
  }
  // INSTRUCTOR/ADMIN access to a specific student is assumed to already be
  // scoped by the existing cohort/roster authorization system and by
  // Postgres RLS before reaching this handler — Feature 25 does not
  // re-implement that check.
}

/** get_next_challenge */
export async function getNextChallenge(
  studentId: string,
  ctx: SelectionContext,
  auth: AuthContext,
  ports: EnginePorts
) {
  assertOwnerOrStaff(auth, studentId);
  const { nextBestChallenge, audit } = await selectNextChallenge(studentId, ctx, ports);
  return { challenge: nextBestChallenge, explanation: explainForStudent(audit, ctx.mode) };
}

/** get_selection_explanation */
export async function getSelectionExplanation(studentId: string, auth: AuthContext, ports: EnginePorts) {
  assertOwnerOrStaff(auth, studentId);
  const audit = await ports.auditLog.getLatestSelection(studentId);
  if (!audit) return { explanation: 'No prior selection recorded for this student yet.' };
  if (auth.role !== 'STUDENT') return explainForInstructor(audit);
  return { explanation: explainForStudent(audit, 'PRACTICE') };
}

/** get_adaptive_path */
export async function getAdaptivePath(studentId: string, auth: AuthContext, ports: EnginePorts) {
  assertOwnerOrStaff(auth, studentId);
  const existing = await ports.auditLog.getAdaptivePath(studentId);
  return existing ?? initAdaptivePath(studentId);
}

/** record_selection — explicit client confirmation (e.g. "Start Challenge" click). Does not trust any client-submitted score/difficulty. */
export async function recordSelection(
  studentId: string,
  challengeId: string,
  auth: AuthContext,
  ports: EnginePorts
) {
  assertOwnerOrStaff(auth, studentId);
  const path = (await ports.auditLog.getAdaptivePath(studentId)) ?? initAdaptivePath(studentId);
  await ports.auditLog.saveAdaptivePath(path);
  return { studentId, challengeId, confirmedAt: new Date().toISOString() };
}

/**
 * record_challenge_outcome
 *
 * Deliberately does NOT accept the outcome's skill-score impact from the
 * caller, and deliberately does NOT compute skill deltas itself — that is
 * owned by the existing Skill/Mastery system per the Feature 25 boundary.
 * It only advances Feature-25-owned adaptive-path state, and it looks up
 * the last selection server-side rather than trusting a client-supplied one.
 */
export async function recordChallengeOutcome(
  studentId: string,
  outcome: 'SUCCESS' | 'FAILURE' | 'PARTIAL',
  auth: AuthContext,
  ports: EnginePorts
) {
  assertOwnerOrStaff(auth, studentId);
  const lastAudit = await ports.auditLog.getLatestSelection(studentId);
  if (!lastAudit || !lastAudit.selected) {
    throw new Error('No pending selection to record an outcome against.');
  }
  const existingPath = (await ports.auditLog.getAdaptivePath(studentId)) ?? initAdaptivePath(studentId);
  const updated = advanceAdaptivePath(existingPath, lastAudit.selected, outcome);
  await ports.auditLog.saveAdaptivePath(updated);
  return updated;
}

/** get_skill_targets */
export async function getSkillTargets(studentId: string, auth: AuthContext, ports: EnginePorts) {
  assertOwnerOrStaff(auth, studentId);
  const student = await ports.studentSkillModel.getStudentModel(studentId);
  return prioritizeSkills(student).slice(0, 5);
}

/** get_challenge_recommendations — top-N candidates (not just the single pick), for a browse UI. */
export async function getChallengeRecommendations(
  studentId: string,
  ctx: SelectionContext,
  auth: AuthContext,
  ports: EnginePorts,
  n = 5
) {
  assertOwnerOrStaff(auth, studentId);
  const { audit } = await selectNextChallenge(studentId, ctx, ports);
  return audit.rankingFactors.slice(0, n);
}
