import { PoolClient } from 'pg';
import * as standins from '../db/standins';

/**
 * Feature 34 provides career direction / target roles (spec ??51). Feature 40
 * only ever reads from this adapter -- it never writes career direction data,
 * and it never re-implements this concept with its own table.
 *
 * TO INTEGRATE WITH THE REAL ACEAPT REPO: replace the body of
 * getPrimaryTargetRole/getAllTargetRoles with calls into the real Feature 34
 * service/repository. The return shape is the contract the rest of Feature 40
 * depends on -- keep it stable.
 */

export interface TargetRole {
  roleId: string;
  roleTitle: string;
  roleSlug: string;
  priority: number;
  status: string;
}

export async function getAllTargetRoles(client: PoolClient, studentId: string): Promise<TargetRole[]> {
  const directions = await standins.getActiveCareerDirections(client, studentId);
  return directions.map((d) => ({
    roleId: d.targetRoleId,
    roleTitle: d.targetRoleTitle,
    roleSlug: d.targetRoleSlug,
    priority: d.priority,
    status: d.status,
  }));
}

export async function getPrimaryTargetRole(client: PoolClient, studentId: string): Promise<TargetRole | null> {
  const all = await getAllTargetRoles(client, studentId);
  if (all.length === 0) return null;
  return all.reduce((best, r) => (r.priority < best.priority ? r : best), all[0]);
}

/** Spec ??26 Career Concentration Risk: true when the student has exactly one
 * narrow active target and nothing else being explored. */
export function hasCareerConcentrationRisk(all: TargetRole[]): boolean {
  return all.filter((r) => r.status === 'ACTIVE').length === 1 && all.filter((r) => r.status === 'EXPLORATORY').length === 0;
}
