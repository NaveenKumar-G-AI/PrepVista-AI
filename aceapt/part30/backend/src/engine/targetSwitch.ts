import type { StudentCapabilityState, TargetRequirement } from "../domain/types.js";
import { calculateReadiness } from "./readiness.js";

export interface TargetComparison {
  sharedCapabilities: string[];
  uniqueToCurrent: string[];
  uniqueToNew: string[];
  transferablePercent: number; // Section 28: "72% of your existing preparation can contribute"
}

/**
 * Section 28-29. `transferablePercent` is not a canned or LLM-guessed
 * number -- it is exactly "what would my readiness already be against the
 * new target's requirements, given current evidence", i.e. the same
 * calculateReadiness() the dashboard itself uses, just pointed at a
 * different requirement set. Reusing it means the number is trustworthy
 * by construction (Section 28: "only display this if the overlap is
 * actually calculated") and can never drift from the definition of
 * readiness used everywhere else.
 */
export function compareTargets(
  currentRequirements: TargetRequirement[],
  newRequirements: TargetRequirement[],
  states: StudentCapabilityState[]
): TargetComparison {
  const currentCodes = new Set(currentRequirements.map((r) => r.capabilityCode));
  const newCodes = new Set(newRequirements.map((r) => r.capabilityCode));

  const sharedCapabilities = [...newCodes].filter((c) => currentCodes.has(c));
  const uniqueToNew = [...newCodes].filter((c) => !currentCodes.has(c));
  const uniqueToCurrent = [...currentCodes].filter((c) => !newCodes.has(c));

  const transferablePercent = calculateReadiness(newRequirements, states);

  return { sharedCapabilities, uniqueToCurrent, uniqueToNew, transferablePercent };
}
