import type { SkillEvidence } from '../types/evidence.js';
import type { TransferState } from '../types/skill-state.js';
import { growthRules } from '../config/growth-rules.js';

/**
 * Transfer Intelligence (section 26). Success on repeated attempts inside
 * a single novel context is treated more conservatively than success
 * spread across several distinct novel contexts — the former is
 * consistent with pattern memorization, the latter is the actual signal
 * the spec is after ("hash maps in arrays -> strings -> streaming data").
 */
export function computeTransferState(evidence: SkillEvidence[]): TransferState {
  const transferEvidence = evidence.filter((e) => e.transferContext?.isTransferAttempt);
  const { minTransferAttemptsForSignal, strongTransferSuccessRate, moderateTransferSuccessRate } = growthRules.transfer;

  if (transferEvidence.length < minTransferAttemptsForSignal) return 'UNKNOWN';

  const successCount = transferEvidence.filter((e) => e.outcome === 'positive').length;
  const successRate = successCount / transferEvidence.length;
  const distinctNovelContexts = new Set(transferEvidence.map((e) => e.transferContext?.novelContext).filter(Boolean)).size;

  if (successRate >= strongTransferSuccessRate && distinctNovelContexts >= 2) return 'STRONG';
  if (successRate >= moderateTransferSuccessRate) return 'MODERATE';
  return 'WEAK';
}
