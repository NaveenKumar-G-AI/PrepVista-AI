import { getCapabilityLabel } from '@/lib/content/targets';
import { getLatestReliableResult, getPathState, savePathState } from '@/lib/db/repository';
import { recommend } from './adapt-engine';
import type { PathState } from '@/lib/db/schema';

// NOTE (spec §25/§26): Feature 31 does not own PATH's logic — this module is
// a minimal, swappable stand-in exposing the same shape a real PATH service
// call would return (current bottleneck + reason + next best action). The
// only thing that matters here architecturally is that `recalculatePath` is
// the single call site the /complete route uses; pointing it at the real
// Feature 30 later does not require touching any caller.

export interface PathRecalculation {
  state: PathState;
  changed: boolean;
}

export function recalculatePath(studentId: string, targetId: string): PathRecalculation {
  const latest = getLatestReliableResult(studentId, targetId);
  const existing = getPathState(studentId, targetId);

  const newCapabilityId = latest?.primaryBottleneck?.capabilityId ?? null;
  const newLabel = newCapabilityId ? getCapabilityLabel(newCapabilityId) : latest ? 'No Material Bottleneck' : 'Baseline Not Established';

  const stageAccuracy = latest?.stageEvaluations.find((s) => s.stageId === latest.primaryBottleneck?.stageId)?.accuracy;
  const reason = latest
    ? newCapabilityId
      ? `Your most recent reliable simulation identified ${newLabel} as the primary breakdown point${stageAccuracy !== undefined ? `, at ${stageAccuracy}% accuracy in that stage` : ''}.`
      : 'Your most recent reliable simulation showed strong, target-level performance across every measured stage.'
    : 'Run a readiness simulation to generate your first evidence-based bottleneck.';

  const prevCapabilityId = existing?.currentBottleneck.capabilityId ?? null;
  const changed = existing ? prevCapabilityId !== newCapabilityId : Boolean(latest);
  const history = existing ? [...existing.history] : [];
  if (changed && existing) {
    history.push({
      at: new Date().toISOString(),
      bottleneckLabel: newLabel,
      reason: `Simulation evidence shifted your bottleneck${existing.currentBottleneck.capabilityId ? ` from ${existing.currentBottleneck.label}` : ''} to ${newLabel}.`,
    });
  }

  const nextBestAction = recommend(newCapabilityId);

  const state: PathState = {
    studentId,
    targetId,
    currentBottleneck: { capabilityId: newCapabilityId, label: newLabel, reason },
    nextBestAction,
    history,
    updatedAt: new Date().toISOString(),
  };
  savePathState(state);
  return { state, changed };
}
