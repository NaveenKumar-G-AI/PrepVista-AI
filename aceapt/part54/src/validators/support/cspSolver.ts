import type { LogicConstraint, LogicPuzzleSpec } from "../../contracts/types.js";

export type Assignment = Record<string, Record<string, string>>; // entity -> attribute -> value

export interface CspSolveOutcome {
  solutions: Assignment[]; // capped — see `cap` param
  directContradiction: boolean; // an EQUALS and a NOT_EQUALS on the same (entity,attribute,value) pair
}

/**
 * Real backtracking search over entity × attribute assignments (spec §47-49).
 * Puzzles in this domain (small logic-puzzle style: a handful of entities,
 * a handful of attributes, small domains) are exactly the case plain
 * backtracking handles well — no need for arc-consistency propagation to get
 * a correct, honest answer to "how many solutions exist."
 *
 * Stops early once `cap` solutions are found — Feature 54 only needs to
 * distinguish zero / exactly one / more than one (spec §48), not enumerate
 * every solution.
 */
export function solveCsp(spec: LogicPuzzleSpec, cap = 2): CspSolveOutcome {
  if (hasDirectContradiction(spec.constraints)) {
    return { solutions: [], directContradiction: true };
  }

  const solutions: Assignment[] = [];
  const variables: { entity: string; attribute: string }[] = [];
  for (const entity of spec.entities) {
    for (const attribute of Object.keys(spec.attributes)) {
      variables.push({ entity, attribute });
    }
  }

  const assignment: Assignment = {};
  for (const entity of spec.entities) assignment[entity] = {};

  const perEntityAttrConstraints = spec.constraints.filter((c) => c.type === "EQUALS" || c.type === "NOT_EQUALS") as Extract<LogicConstraint, { type: "EQUALS" | "NOT_EQUALS" }>[];
  const allDifferentAttrs = new Set(spec.constraints.filter((c) => c.type === "ALL_DIFFERENT").map((c) => (c as Extract<LogicConstraint, { type: "ALL_DIFFERENT" }>).attribute));
  const crossEntityConstraints = spec.constraints.filter((c) => c.type === "SAME" || c.type === "DIFFERENT") as Extract<LogicConstraint, { type: "SAME" | "DIFFERENT" }>[];

  function isConsistentSoFar(entity: string, attribute: string, value: string): boolean {
    for (const c of perEntityAttrConstraints) {
      if (c.attribute !== attribute) continue;
      if (c.type === "EQUALS" && c.entity === entity && c.value !== value) return false;
      if (c.type === "NOT_EQUALS" && c.entity === entity && c.value === value) return false;
    }
    if (allDifferentAttrs.has(attribute)) {
      for (const other of spec.entities) {
        if (other === entity) continue;
        if (assignment[other]?.[attribute] === value) return false;
      }
    }
    for (const c of crossEntityConstraints) {
      if (c.attribute !== attribute) continue;
      const other = c.entityA === entity ? c.entityB : c.entityB === entity ? c.entityA : undefined;
      if (!other) continue;
      const otherValue = assignment[other]?.[attribute];
      if (otherValue === undefined) continue; // not assigned yet — checked again once it is
      if (c.type === "SAME" && otherValue !== value) return false;
      if (c.type === "DIFFERENT" && otherValue === value) return false;
    }
    return true;
  }

  function backtrack(index: number): void {
    if (solutions.length >= cap) return;
    if (index === variables.length) {
      solutions.push(structuredClone(assignment));
      return;
    }
    const { entity, attribute } = variables[index]!;
    for (const value of spec.attributes[attribute] ?? []) {
      if (!isConsistentSoFar(entity, attribute, value)) continue;
      assignment[entity]![attribute] = value;
      backtrack(index + 1);
      if (solutions.length >= cap) return;
    }
    delete assignment[entity]![attribute];
  }

  backtrack(0);
  return { solutions, directContradiction: false };
}

function hasDirectContradiction(constraints: LogicConstraint[]): boolean {
  const equals = constraints.filter((c): c is Extract<LogicConstraint, { type: "EQUALS" }> => c.type === "EQUALS");
  const notEquals = constraints.filter((c): c is Extract<LogicConstraint, { type: "NOT_EQUALS" }> => c.type === "NOT_EQUALS");
  return equals.some((e) => notEquals.some((ne) => ne.entity === e.entity && ne.attribute === e.attribute && ne.value === e.value));
}
