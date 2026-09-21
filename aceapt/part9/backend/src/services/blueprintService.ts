import { Errors } from '../domain/errors';
import { PressureMode, SimulationBlueprint } from '../domain/types';
import { applyPressureModifiers, getBlueprintById, listBlueprints } from '../config/blueprints';

// ============================================================
// SIMULATION BLUEPRINT SERVICE  (spec sections 11, 12, 48)
// ============================================================
// If your ACEAPT repo already has an assessment-configuration model,
// point this file at it instead of src/config/blueprints.ts - it is
// the only place blueprint lookups happen, so nothing downstream needs
// to change.

export class BlueprintService {
  list(): SimulationBlueprint[] {
    return listBlueprints();
  }

  getOrThrow(id: string, pressureOverride?: PressureMode): SimulationBlueprint {
    const blueprint = getBlueprintById(id);
    if (!blueprint) throw Errors.blueprintNotFound(id);
    return pressureOverride ? applyPressureModifiers(blueprint, pressureOverride) : blueprint;
  }
}
