import { randomUUID } from 'crypto';
import { InterventionDecision, InterventionExecution, ImmediateResult } from '../domain/types';
import { buildExecutionContract } from '../domain/interventionCatalog';

export function startExecution(decision: InterventionDecision): InterventionExecution {
  const contract = buildExecutionContract(decision.selected.type, decision.problem.topic, {
    skill: decision.problem.skill
  });
  return {
    id: randomUUID(),
    decisionId: decision.id,
    studentId: decision.studentId,
    type: decision.selected.type,
    contract,
    status: 'IN_PROGRESS',
    startedAt: new Date().toISOString()
  };
}

export function completeExecution(execution: InterventionExecution, result: ImmediateResult): InterventionExecution {
  const startedAtMs = execution.startedAt ? new Date(execution.startedAt).getTime() : Date.now();
  return {
    ...execution,
    status: 'COMPLETED',
    completedAt: new Date().toISOString(),
    durationSec: Math.max(0, Math.round((Date.now() - startedAtMs) / 1000)),
    result
  };
}

export function abandonExecution(execution: InterventionExecution): InterventionExecution {
  return { ...execution, status: 'ABANDONED', completedAt: new Date().toISOString() };
}
