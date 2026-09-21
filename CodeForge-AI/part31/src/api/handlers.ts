import type { AuthContext } from './authorization';
import { canTriggerRecalculation, canViewCohortAggregate, canViewReadiness } from './authorization';
import type { EvidenceProvider, RoleModelProvider, SnapshotRepository } from '../ports';
import { getRoleReadiness } from '../application/getRoleReadiness';
import { aggregateCohortReadiness } from '../domain/cohortAggregation';
import { explainReadiness, toStudentFacingView, type StudentFacingReadinessView } from '../ai/explainReadiness';
import type { CohortReadinessSummary } from '../domain/types';

export interface Deps {
  evidenceProvider: EvidenceProvider;
  roleModelProvider: RoleModelProvider;
  snapshotRepository: SnapshotRepository;
}

type ApiResult<T> = { status: 200; body: T } | { status: 400 | 403 | 404; body: { error: string } };

/**
 * These handlers are intentionally framework-agnostic (no Express/Fastify
 * import) since the real CodeForge routing convention wasn't available to
 * inspect (Phase 46: "follow existing conventions"). Wire req.auth from
 * your real auth middleware — see AuthContext in ./authorization.
 */

export async function handleGetRoleReadiness(
  req: { auth: AuthContext; studentId: string; roleId: string; isSelf: boolean },
  deps: Deps,
): Promise<ApiResult<StudentFacingReadinessView>> {
  if (!req.studentId || !req.roleId) {
    return { status: 400, body: { error: 'studentId and roleId are required' } };
  }
  if (!canViewReadiness(req.auth, { studentId: req.studentId, organizationId: req.auth.organizationId, isSelf: req.isSelf })) {
    return { status: 403, body: { error: 'not authorized to view this readiness result' } };
  }
  const result = await getRoleReadiness({
    studentId: req.studentId,
    organizationId: req.auth.organizationId,
    roleId: req.roleId,
    ports: deps,
  });
  if (!result) return { status: 404, body: { error: 'role or student not found' } };
  return { status: 200, body: toStudentFacingView(result) };
}

export async function handleGetReadinessHistory(
  req: { auth: AuthContext; studentId: string; roleId: string; isSelf: boolean; limit?: number },
  deps: Deps,
): Promise<ApiResult<StudentFacingReadinessView[]>> {
  if (!canViewReadiness(req.auth, { studentId: req.studentId, organizationId: req.auth.organizationId, isSelf: req.isSelf })) {
    return { status: 403, body: { error: 'not authorized to view this readiness history' } };
  }
  const history = await deps.snapshotRepository.getHistory(req.studentId, req.roleId, req.limit ?? 20);
  return { status: 200, body: history.map(toStudentFacingView) };
}

export async function handleGetExplanation(
  req: { auth: AuthContext; studentId: string; roleId: string; isSelf: boolean },
  deps: Deps,
): Promise<ApiResult<{ explanation: string; source: string }>> {
  if (!canViewReadiness(req.auth, { studentId: req.studentId, organizationId: req.auth.organizationId, isSelf: req.isSelf })) {
    return { status: 403, body: { error: 'not authorized' } };
  }
  const result = await getRoleReadiness({
    studentId: req.studentId,
    organizationId: req.auth.organizationId,
    roleId: req.roleId,
    ports: deps,
  });
  if (!result) return { status: 404, body: { error: 'role or student not found' } };
  const explanation = await explainReadiness(result);
  return { status: 200, body: { explanation: explanation.explanation, source: explanation.source } };
}

export async function handleTriggerRecalculation(
  req: { auth: AuthContext; studentId: string; roleId: string; isSelf: boolean },
  deps: Deps,
): Promise<ApiResult<StudentFacingReadinessView>> {
  if (!canTriggerRecalculation(req.auth, { organizationId: req.auth.organizationId, isSelf: req.isSelf })) {
    return { status: 403, body: { error: 'not authorized to trigger recalculation' } };
  }
  const result = await getRoleReadiness({
    studentId: req.studentId,
    organizationId: req.auth.organizationId,
    roleId: req.roleId,
    ports: deps,
    options: { forceRecalculate: true },
  });
  if (!result) return { status: 404, body: { error: 'role or student not found' } };
  return { status: 200, body: toStudentFacingView(result) };
}

export async function handleGetCohortReadiness(
  req: { auth: AuthContext; roleId: string; cohortResults: Awaited<ReturnType<typeof getRoleReadiness>>[] },
  _deps: Deps,
): Promise<ApiResult<CohortReadinessSummary>> {
  if (!canViewCohortAggregate(req.auth, { organizationId: req.auth.organizationId })) {
    return { status: 403, body: { error: 'not authorized to view cohort aggregates' } };
  }
  // req.cohortResults is expected to already be fetched by the caller via a
  // tenant-scoped, role-scoped query against SnapshotRepository (Phase 42) —
  // this handler only aggregates, it does not decide which students are in scope.
  const nonNull = req.cohortResults.filter((r): r is NonNullable<typeof r> => r !== null);
  return { status: 200, body: aggregateCohortReadiness(nonNull) };
}
