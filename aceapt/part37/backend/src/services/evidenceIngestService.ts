import { z } from 'zod';
import { NextActionSink, TrajectoryProvider } from '../integrations/types';
import { ReadinessRepository } from '../repositories/readinessRepository';
import { EvidenceItem } from '../types/domain';
import { NotFoundError, ReadinessService } from './readinessService';

export const evidenceInputSchema = z.object({
  capabilityId: z.string().min(1),
  sourceType: z.enum([
    'SELF_REPORT',
    'TRAINING',
    'CERTIFICATE',
    'ASSESSMENT',
    'CODING_TEST',
    'PROJECT',
    'SIMULATION',
    'MOCK_INTERVIEW',
    'INTERVIEW',
    'RESUME',
    'PORTFOLIO',
    'OPPORTUNITY_OUTCOME',
  ]),
  occurredAt: z.string().datetime(),
  score: z.number().min(0).max(100).nullable().optional(),
  outcome: z.enum(['PASSED', 'FAILED', 'STRONG', 'WEAK', 'COMPLETED']).nullable().optional(),
  context: z.string().max(2000).nullable().optional(),
  validationState: z.enum(['UNVALIDATED', 'SELF_ASSERTED', 'VALIDATED', 'DISPUTED']).optional(),
  claimedLevel: z.enum(['BASIC', 'INTERMEDIATE', 'STRONG']).nullable().optional(),
  externalRefId: z.string().max(200).nullable().optional(),
});

export type EvidenceInput = z.infer<typeof evidenceInputSchema>;

/**
 * Handles the write side of the evidence engine: validate, persist, and
 * recompute readiness only for the roles this evidence actually affects
 * (the student's current target roles that require this capability) —
 * never a full recalculation across every role in the system.
 */
export class EvidenceIngestService {
  constructor(
    private readonly repo: ReadinessRepository,
    private readonly readinessService: ReadinessService,
    private readonly trajectoryProvider: TrajectoryProvider,
    private readonly nextActionSink: NextActionSink
  ) {}

  async ingest(tenantId: string, studentId: string, input: EvidenceInput): Promise<EvidenceItem> {
    const parsed = evidenceInputSchema.parse(input);

    const evidence = await this.repo.insertEvidence(tenantId, {
      studentId,
      capabilityId: parsed.capabilityId,
      sourceType: parsed.sourceType,
      occurredAt: parsed.occurredAt,
      score: parsed.score ?? null,
      outcome: parsed.outcome ?? null,
      context: parsed.context ?? null,
      validationState: parsed.validationState ?? 'UNVALIDATED',
      claimedLevel: parsed.claimedLevel ?? null,
      externalRefId: parsed.externalRefId ?? null,
    });

    await this.recomputeAffectedRoles(tenantId, studentId, parsed.capabilityId);
    return evidence;
  }

  private async recomputeAffectedRoles(tenantId: string, studentId: string, capabilityId: string): Promise<void> {
    const targetRoles = await this.trajectoryProvider.getTargetRoles(tenantId, studentId);

    for (const target of targetRoles) {
      try {
        const dto = await this.readinessService.getRoleReadiness(tenantId, studentId, target.roleId);
        const affectsThisRole = dto.capabilityStatuses.some((s) => s.capabilityId === capabilityId);
        if (affectsThisRole && dto.topGap) {
          await this.nextActionSink.notifyReadinessGap(tenantId, studentId, target.roleId, dto.topGap, dto.nextProof);
        }
      } catch (err) {
        if (err instanceof NotFoundError) continue; // a stale target role reference shouldn't fail the whole ingest
        throw err;
      }
    }
  }
}
