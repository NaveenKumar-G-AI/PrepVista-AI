import { PoolClient } from 'pg';
import { TargetProfile } from '../domain/types';
import { publishSignal } from './outbox';

export const TARGET_SELECTED_FOR_PROOF = 'TargetSelectedForProof';

export interface TargetSelectedForProofPayload {
  targetId: string;
  targetName: string;
  requirements: { capabilityId: string; importance: string; requiredLevel: string }[];
}

/**
 * ALIGN -> PROOF (spec §41): "Feature 28 determines the appropriate
 * verification." This publishes the target's requirement profile and
 * nothing else — ALIGN never decides what counts as proof.
 */
export async function sendTargetToProof(
  client: PoolClient,
  studentId: string,
  target: TargetProfile,
): Promise<void> {
  const payload: TargetSelectedForProofPayload = {
    targetId: target.targetId,
    targetName: target.name,
    requirements: target.requirements.map((r) => ({
      capabilityId: r.capabilityId,
      importance: r.importance,
      requiredLevel: r.requiredLevel,
    })),
  };
  await publishSignal(
    client,
    TARGET_SELECTED_FOR_PROOF,
    studentId,
    payload as unknown as Record<string, unknown>,
  );
}
