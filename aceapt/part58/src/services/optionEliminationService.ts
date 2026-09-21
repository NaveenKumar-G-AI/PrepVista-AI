/**
 * OptionEliminationService (§23-25, §93-99, §138). Captures eliminated
 * options as structured evidence signals. Verification (was this elimination
 * actually valid, independent of whether the final answer was correct) only
 * happens when a QuestionEliminationVerifier is wired in; otherwise every
 * elimination is honestly recorded as SELF_REPORTED rather than silently
 * upgraded (§99, §102-103).
 */
import type { QuestionEliminationVerifier } from '../ports';
import type { EvidenceSignal, EvidenceType } from '../types';
import { isEliminationEvidenceType } from '../domain/elimination';

export class OptionEliminationService {
  constructor(private readonly verifier: QuestionEliminationVerifier) {}

  async recordElimination(input: {
    questionVersionId: string;
    eliminatedOptionIds: string[];
    claimedType: EvidenceType;
  }): Promise<EvidenceSignal[]> {
    if (!isEliminationEvidenceType(input.claimedType)) {
      throw new Error(`${input.claimedType} is not an elimination evidence type.`);
    }

    const signals: EvidenceSignal[] = [];
    for (const optionId of input.eliminatedOptionIds) {
      let level;
      try {
        level = await this.verifier.verifyElimination(input.questionVersionId, optionId, input.claimedType);
      } catch {
        level = 'SELF_REPORTED' as const; // verifier failure never silently upgrades trust
      }
      signals.push({ type: input.claimedType, level, optionId });
    }
    return signals;
  }
}
