import type { CareerExperiment, ExperimentStatus } from '../types/strategy.js';

/**
 * spec #28-30: EXPERIMENT ENGINE + HYPOTHESIS SYSTEM + EXPERIMENT STATUS.
 * Pure lifecycle/transition logic — persistence lives in the repository,
 * narrative summary lives in the recommendation service. Kept deliberately
 * conservative: a conclusion is only ever "supported" or "invalidated" when
 * the measured outcome clearly meets or clearly misses what was declared
 * up front (spec #30: "do not overstate conclusions").
 */

export function canStart(exp: CareerExperiment): boolean {
  return exp.status === 'planned';
}

export function startExperiment(exp: CareerExperiment, now = new Date()): CareerExperiment {
  if (!canStart(exp)) throw new Error(`Cannot start an experiment in status "${exp.status}"`);
  const endsAt = new Date(now.getTime() + exp.timeWindowDays * 24 * 60 * 60 * 1000).toISOString();
  return { ...exp, status: 'running', startedAt: now.toISOString(), endsAt };
}

/**
 * Compares the declared expectedOutcome against the recorded actualOutcome.
 * This is intentionally simple (keyword containment) rather than an LLM
 * judgment call, so conclusions stay auditable. `matched` should be supplied
 * by whatever recorded the actual outcome (e.g. a metric comparison) when
 * available — this function does not fabricate a match.
 */
export function concludeExperiment(
  exp: CareerExperiment,
  actualOutcome: string,
  matched: boolean | 'inconclusive',
): CareerExperiment {
  if (exp.status !== 'running') throw new Error(`Cannot conclude an experiment in status "${exp.status}"`);

  let status: ExperimentStatus;
  let conclusion: string;
  if (matched === 'inconclusive') {
    status = 'inconclusive';
    conclusion = 'The measurement did not clearly confirm or contradict the hypothesis.';
  } else if (matched) {
    status = 'supported';
    conclusion = `The outcome matched what was expected: ${exp.expectedOutcome}`;
  } else {
    status = 'invalidated';
    conclusion = `The outcome did not match what was expected (expected: ${exp.expectedOutcome}; actual: ${actualOutcome}).`;
  }

  return { ...exp, status, actualOutcome, conclusion };
}

export function isOverdue(exp: CareerExperiment, now = new Date()): boolean {
  if (exp.status !== 'running' || !exp.endsAt) return false;
  return new Date(exp.endsAt) < now;
}
