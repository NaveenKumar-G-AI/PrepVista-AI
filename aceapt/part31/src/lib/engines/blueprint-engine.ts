import { getItemById, itemsByTag } from '@/lib/content/item-bank';
import { getCapabilityLabel } from '@/lib/content/targets';
import { newId } from '@/lib/ids';
import type { BlueprintStage, Item, Simulation, SimulationBlueprint } from '@/lib/db/schema';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Selects concrete items for one stage template, preferring items the
 * student has not seen in their recent attempts of this same simulation
 * (spec §37 — resist memorization / repeated-exposure inflation). Falls
 * back to the full pool if exclusion would leave too few items.
 */
function selectStageItems(pool: Item[], count: number, recentlyUsedIds: Set<string>): Item[] {
  const fresh = pool.filter((i) => !recentlyUsedIds.has(i.id));
  const source = fresh.length >= count ? fresh : pool;
  return shuffle(source).slice(0, count);
}

export function generateBlueprint(simulation: Simulation, recentlyUsedIds: Set<string>): SimulationBlueprint {
  const stages: BlueprintStage[] = simulation.stageTemplates.map((template) => {
    const pool = template.itemPoolTags.flatMap((tag) => itemsByTag(tag));
    const chosen = selectStageItems(pool, Math.min(template.itemCount, pool.length), recentlyUsedIds);
    return {
      id: newId('stage'),
      templateId: template.id,
      title: template.title,
      purpose: template.purpose,
      capabilityIds: template.capabilityIds,
      transfer: template.transfer,
      timeBudgetSeconds: template.timeBudgetSeconds,
      items: chosen.map((it) => ({ itemId: it.id, kind: it.kind, transfer: it.transfer })),
    };
  });

  const totalDurationSeconds = stages.reduce((sum, s) => sum + s.timeBudgetSeconds, 0);
  const capabilitiesCovered = Array.from(new Set(stages.flatMap((s) => s.capabilityIds)));

  return {
    id: newId('bp'),
    simulationId: simulation.id,
    targetId: simulation.targetId,
    level: simulation.level,
    type: simulation.type,
    stages,
    totalDurationSeconds,
    evidenceRequirements: capabilitiesCovered.map((c) => `Requires measured performance on ${getCapabilityLabel(c)}`),
    generatedAt: new Date().toISOString(),
  };
}

/** Resolves the concrete Item behind a blueprint stage entry — used by the
 * runtime view builder and the evaluation engine so neither has to know
 * where item content actually lives. */
export function resolveBlueprintItem(itemId: string): Item {
  return getItemById(itemId);
}
