import { ImportanceTier, CapabilityLevel, TargetProfile } from '../domain/types';
import { pool } from './pool';

interface TargetRow {
  target_id: string;
  name: string;
  description: string;
  active: boolean;
  typical_preparation_weeks: number | null;
}

interface RequirementRow {
  target_id: string;
  capability_id: string;
  importance: ImportanceTier;
  required_level: CapabilityLevel;
}

export async function getAllTargetProfiles(activeOnly = true): Promise<TargetProfile[]> {
  const targetsResult = await pool.query<TargetRow>(
    `SELECT target_id, name, description, active, typical_preparation_weeks
     FROM target_profiles
     ${activeOnly ? 'WHERE active = true' : ''}
     ORDER BY name`,
  );
  const reqsResult = await pool.query<RequirementRow>(
    `SELECT target_id, capability_id, importance, required_level FROM target_capability_requirements`,
  );

  const requirementsByTarget = new Map<string, RequirementRow[]>();
  for (const row of reqsResult.rows) {
    const list = requirementsByTarget.get(row.target_id) ?? [];
    list.push(row);
    requirementsByTarget.set(row.target_id, list);
  }

  return targetsResult.rows.map((t) => ({
    targetId: t.target_id,
    name: t.name,
    description: t.description,
    active: t.active,
    typicalPreparationWeeks: t.typical_preparation_weeks ?? undefined,
    requirements: (requirementsByTarget.get(t.target_id) ?? []).map((r) => ({
      capabilityId: r.capability_id,
      importance: r.importance,
      requiredLevel: r.required_level,
    })),
  }));
}

export async function getTargetProfile(targetId: string): Promise<TargetProfile | null> {
  const all = await getAllTargetProfiles(false);
  return all.find((t) => t.targetId === targetId) ?? null;
}
