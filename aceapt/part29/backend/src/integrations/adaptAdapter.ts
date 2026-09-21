import { PoolClient } from 'pg';
import { AlignmentGap } from '../domain/types';
import { publishSignal } from './outbox';

export const GAP_IDENTIFIED_FOR_ADAPT = 'GapIdentifiedForAdapt';

export interface GapIdentifiedForAdaptPayload {
  targetId: string;
  targetName: string;
  capabilityId: string;
  capabilityName: string;
  currentLevel: string;
  requiredLevel: string;
  importance: string;
  isCritical: boolean;
  confidence: string;
  priorityScore: number | null;
}

/**
 * ALIGN -> ADAPT (spec §40): "Feature 26 should determine the intervention.
 * Do not recreate Feature 26 inside Feature 29." This function's entire
 * job is building the structured payload and publishing it durably — it
 * has zero knowledge of what ADAPT will actually do with a gap.
 */
export async function sendGapToAdapt(
  client: PoolClient,
  studentId: string,
  gap: AlignmentGap,
  targetId: string,
  targetName: string,
  priorityScore: number | null,
): Promise<void> {
  const payload: GapIdentifiedForAdaptPayload = {
    targetId,
    targetName,
    capabilityId: gap.capabilityId,
    capabilityName: gap.capabilityName,
    currentLevel: gap.currentLevel,
    requiredLevel: gap.requiredLevel,
    importance: gap.importance,
    isCritical: gap.isCritical,
    confidence: gap.confidence,
    priorityScore,
  };
  await publishSignal(
    client,
    GAP_IDENTIFIED_FOR_ADAPT,
    studentId,
    payload as unknown as Record<string, unknown>,
  );
}
