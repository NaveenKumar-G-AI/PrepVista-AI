import type { CapabilityDefinition, RoleRubric } from "../types/domain.js";

/**
 * Reference/configuration data — the curriculum map, not student data.
 *
 * In a real ACEAPT deployment this almost certainly already exists as
 * "capability intelligence" / "readiness engine" reference data (see
 * spec section 15). This file is the seam: replace the two constants
 * below with a lookup against that real system and nothing else in
 * this module needs to change.
 */

export const CAPABILITIES: CapabilityDefinition[] = [
  { id: "dsa", name: "Data Structures & Algorithms", category: "technical" },
  { id: "prog_fund", name: "Programming Fundamentals", category: "technical" },
  { id: "sys_design", name: "System Design Basics", category: "technical" },
  { id: "sql", name: "SQL & Data Handling", category: "technical" },
  { id: "quant", name: "Quantitative Aptitude", category: "aptitude" },
  { id: "verbal", name: "Verbal Reasoning", category: "aptitude" },
  { id: "comm", name: "Communication & Behavioral", category: "soft_skill" },
];

export const ROLE_RUBRICS: RoleRubric[] = [
  {
    roleId: "swe_entry",
    roleName: "Software Engineer (Entry Level)",
    entries: [
      { capabilityId: "dsa", weight: 0.35, targetBar: 70 },
      { capabilityId: "prog_fund", weight: 0.25, targetBar: 70 },
      { capabilityId: "sys_design", weight: 0.15, targetBar: 60 },
      { capabilityId: "comm", weight: 0.15, targetBar: 65 },
      { capabilityId: "quant", weight: 0.10, targetBar: 60 },
    ],
  },
  {
    roleId: "data_analyst",
    roleName: "Data Analyst",
    entries: [
      { capabilityId: "sql", weight: 0.35, targetBar: 70 },
      { capabilityId: "quant", weight: 0.25, targetBar: 65 },
      { capabilityId: "comm", weight: 0.20, targetBar: 65 },
      { capabilityId: "prog_fund", weight: 0.10, targetBar: 55 },
      { capabilityId: "verbal", weight: 0.10, targetBar: 55 },
    ],
  },
];

export function getCapability(capabilityId: string): CapabilityDefinition | undefined {
  return CAPABILITIES.find((c) => c.id === capabilityId);
}

export function getRoleRubric(roleId: string): RoleRubric | undefined {
  return ROLE_RUBRICS.find((r) => r.roleId === roleId);
}
