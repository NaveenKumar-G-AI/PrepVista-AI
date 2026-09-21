import { env } from '../config/env';
import { masteryEngineStub, mistakeEngineStub, retentionEngineStub } from './stubs/evidenceBackedAdapters';
import { goalEngineStub, rosterAdapterStub } from './stubs/goalAndRosterStubs';
import { aiSuggestionAdapter } from './aiSuggestion.adapter';
import type { GoalEngineAdapter, MasteryEngineAdapter, MistakeEngineAdapter, RetentionEngineAdapter, RosterAdapter } from './types';

// Single place the rest of the app asks for "the current adapter". Today
// every mode resolves to the stub because no real ACEAPT systems were
// available to integrate against (see README). When you implement a real
// adapter, register it here behind its *_ADAPTER_MODE=live branch — no
// other file needs to change.

function resolveMastery(): MasteryEngineAdapter {
  if (env.MASTERY_ADAPTER_MODE === 'live') {
    throw new Error('MASTERY_ADAPTER_MODE=live but no live MasteryEngineAdapter is registered yet — implement one in src/integrations and wire it in here.');
  }
  return masteryEngineStub;
}

function resolveMistake(): MistakeEngineAdapter {
  if (env.MISTAKE_ADAPTER_MODE === 'live') {
    throw new Error('MISTAKE_ADAPTER_MODE=live but no live MistakeEngineAdapter is registered yet.');
  }
  return mistakeEngineStub;
}

function resolveRetention(): RetentionEngineAdapter {
  if (env.RETENTION_ADAPTER_MODE === 'live') {
    throw new Error('RETENTION_ADAPTER_MODE=live but no live RetentionEngineAdapter is registered yet.');
  }
  return retentionEngineStub;
}

function resolveGoal(): GoalEngineAdapter {
  if (env.GOAL_ADAPTER_MODE === 'live') {
    throw new Error('GOAL_ADAPTER_MODE=live but no live GoalEngineAdapter is registered yet.');
  }
  return goalEngineStub;
}

function resolveRoster(): RosterAdapter {
  if (env.ROSTER_ADAPTER_MODE === 'live') {
    throw new Error('ROSTER_ADAPTER_MODE=live but no live RosterAdapter is registered yet.');
  }
  return rosterAdapterStub;
}

export const adapters = {
  mastery: resolveMastery(),
  mistake: resolveMistake(),
  retention: resolveRetention(),
  goal: resolveGoal(),
  roster: resolveRoster(),
  aiSuggestion: aiSuggestionAdapter,
};
