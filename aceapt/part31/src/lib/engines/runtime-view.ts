import { resolveBlueprintItem } from './blueprint-engine';
import { sanitizeItem } from '@/lib/content/item-bank';
import type { SanitizedItem, SimulationAttempt } from '@/lib/db/schema';

export interface RuntimeStageView {
  index: number;
  total: number;
  title: string;
  purpose: string;
  timeBudgetSeconds: number;
  itemIndex: number;
  itemsInStage: number;
}

export interface RuntimeView {
  attemptId: string;
  status: SimulationAttempt['status'];
  done: boolean;
  stage: RuntimeStageView | null;
  item: SanitizedItem | null;
  progress: { completedItems: number; totalItems: number };
  timeRemainingSeconds: number;
  totalDurationSeconds: number;
  rules: string[];
}

export function buildRuntimeView(attempt: SimulationAttempt, rules: string[]): RuntimeView {
  const { blueprint } = attempt;
  const stage = blueprint.stages[attempt.currentStageIndex];
  const stageItem = stage?.items[attempt.currentItemIndex];
  const totalItems = blueprint.stages.reduce((sum, s) => sum + s.items.length, 0);
  const completedItems = attempt.responses.length;
  const elapsedSeconds = Math.floor((Date.now() - new Date(attempt.startedAt).getTime()) / 1000);
  const timeRemainingSeconds = Math.max(0, blueprint.totalDurationSeconds - elapsedSeconds);
  const done = attempt.status !== 'in_progress' || attempt.currentStageIndex >= blueprint.stages.length;

  return {
    attemptId: attempt.id,
    status: attempt.status,
    done,
    stage:
      stage && !done
        ? {
            index: attempt.currentStageIndex,
            total: blueprint.stages.length,
            title: stage.title,
            purpose: stage.purpose,
            timeBudgetSeconds: stage.timeBudgetSeconds,
            itemIndex: attempt.currentItemIndex,
            itemsInStage: stage.items.length,
          }
        : null,
    item: stageItem && !done ? sanitizeItem(resolveBlueprintItem(stageItem.itemId)) : null,
    progress: { completedItems, totalItems },
    timeRemainingSeconds,
    totalDurationSeconds: blueprint.totalDurationSeconds,
    rules,
  };
}

export const TIME_GRACE_SECONDS = 10;
