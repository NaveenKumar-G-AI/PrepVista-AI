/**
 * PrepVista AI — Part 15
 * Scenarios module registration + the run_scenario AI tool (Section 37/48).
 */

import type { CallerContext, ScenarioInput, ToolDefinition } from "../../types/placement-strategy.types.js";
import type { PlacementDataRepository } from "../../repository/PlacementDataRepository.js";
import { ScenarioService } from "../../services/scenario/ScenarioService.js";
import { assertInstitutionalAccess } from "../../rbac/access-control.js";
import { auditLog } from "../../audit/audit-log.js";

export { ScenarioService } from "../../services/scenario/ScenarioService.js";

export function createScenarioTools(repo: PlacementDataRepository): ToolDefinition[] {
  const scenarioService = new ScenarioService(repo);

  return [
    {
      name: "run_scenario",
      description:
        "Runs an isolated what-if simulation over the current remaining-pool pipeline (application/interview/offer-acceptance/joining conversion deltas, plus optional additional drives). Never mutates live data — see ScenarioService doc comment. Always returns type:'scenario_estimate', never a guarantee.",
      parameters: {
        type: "object",
        properties: {
          asOf: { type: "string" },
          label: { type: "string" },
          applicationConversionDelta: { type: "number", description: "absolute percentage-point delta" },
          interviewConversionDelta: { type: "number" },
          offerAcceptanceDelta: { type: "number" },
          joiningConversionDelta: { type: "number" },
          additionalDrives: { type: "number" },
        },
        required: ["asOf", "label"],
      },
      requiresRole: ["TPO", "MANAGEMENT"],
      handler: async (args: { asOf: string } & ScenarioInput, caller: CallerContext) => {
        assertInstitutionalAccess(caller);
        const { asOf, ...input } = args;
        const result = await scenarioService.runScenario(asOf, input);
        auditLog.record(caller, "RUN_SCENARIO", "scenario", input.label, { assumptions: input, projectedRange: result.projectedRange });
        return result;
      },
    },
  ];
}

export const SCENARIOS_MODULE_MANIFEST_FRAGMENT = {
  module: "scenarios",
  servicesExposed: ["ScenarioService"],
  eventsPublished: ["SCENARIO_CREATED", "SCENARIO_RUN", "SCENARIO_ARCHIVED"],
  aiTools: ["run_scenario"],
};
