import type { ValidatorRegistry } from "../registry/ValidatorRegistry.js";

export interface ExecutionPlan {
  /** Topologically ordered groups. Every validator in a layer is safe to run
   *  concurrently because nothing in this or a later layer depends on it, and
   *  everything it depends on is in an earlier layer (spec §162, §167). */
  layers: string[][];
  /** Full transitive closure of what will run, in case a caller wants to know
   *  up front (e.g. to pre-fetch ports) without walking layers itself. */
  allNames: string[];
}

/**
 * Builds a dependency-respecting execution plan for exactly the validators the
 * caller asked for, automatically pulling in whatever those validators
 * transitively depend on — a caller should never have to remember to also ask
 * for SCHEMA_VALIDATOR just because ANSWER_VALIDATOR needs it first.
 *
 * Throws on an unknown validator name or a circular dependency — both are
 * registration-time bugs, not runtime content problems, so they should fail
 * loudly rather than silently degrade a validation run.
 */
export function buildExecutionPlan(registry: ValidatorRegistry, requestedNames: readonly string[]): ExecutionPlan {
  const closure = new Set<string>();
  const stack = [...requestedNames];
  while (stack.length > 0) {
    const name = stack.pop() as string;
    if (closure.has(name)) continue;
    const validator = registry.get(name);
    if (!validator) {
      throw new Error(`ValidationPlanner: unknown validator "${name}" — is it registered?`);
    }
    closure.add(name);
    for (const dep of validator.dependsOn) stack.push(dep);
  }

  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const name of closure) {
    inDegree.set(name, 0);
    dependents.set(name, []);
  }
  for (const name of closure) {
    const validator = registry.get(name) as NonNullable<ReturnType<ValidatorRegistry["get"]>>;
    for (const dep of validator.dependsOn) {
      inDegree.set(name, (inDegree.get(name) ?? 0) + 1);
      (dependents.get(dep) ?? []).push(name);
    }
  }

  const layers: string[][] = [];
  const resolved = new Set<string>();
  let frontier = [...closure].filter((name) => inDegree.get(name) === 0).sort();

  while (frontier.length > 0) {
    layers.push(frontier);
    const next = new Set<string>();
    for (const name of frontier) {
      resolved.add(name);
      for (const dependent of dependents.get(name) ?? []) {
        const remaining = (inDegree.get(dependent) ?? 1) - 1;
        inDegree.set(dependent, remaining);
        if (remaining === 0) next.add(dependent);
      }
    }
    frontier = [...next].sort();
  }

  if (resolved.size !== closure.size) {
    const unresolved = [...closure].filter((name) => !resolved.has(name));
    throw new Error(`ValidationPlanner: circular dependency detected among: ${unresolved.join(", ")}`);
  }

  return { layers, allNames: [...closure] };
}
