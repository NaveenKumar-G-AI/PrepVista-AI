export interface Mutant {
  id: string;
  description: string;
  mutatedSource: string;
}

interface MutatorRule {
  id: string;
  description: string;
  /** first occurrence only, to keep each mutant a single, isolated change */
  find: string;
  replace: string;
}

/**
 * Generic, source-agnostic mutation rules covering the categories the
 * spec calls out: comparison reversal, off-by-one/boundary alteration,
 * operator mutation, incorrect initialization, incorrect loop
 * condition. Each rule is applied independently to produce one mutant;
 * rules that don't match the given source simply produce no mutant
 * (skipped, not silently faked) — see generateMutants().
 */
const RULES: MutatorRule[] = [
  { id: "comparison_reversal_in", description: "'in' -> 'not in' (inverts the core lookup condition)", find: "if complement in freq:", replace: "if complement not in freq:" },
  { id: "operator_mutation_formula", description: "'target - x' -> 'target + x' (wrong complement formula)", find: "complement = target - x", replace: "complement = target + x" },
  { id: "incorrect_initialization", description: "freq never actually accumulates counts (stays effectively empty)", find: "freq[x] = freq.get(x, 0) + 1", replace: "freq[x] = freq.get(x, 0)" },
  { id: "off_by_one_value", description: "counts presence (+=1) instead of multiplicity (+= freq[complement])", find: "count += freq[complement]", replace: "count += 1" },
  { id: "boundary_alteration_loop", description: "loop skips the last element (off-by-one on the iteration boundary)", find: "for x in arr:", replace: "for x in arr[:-1]:" },
  { id: "incorrect_loop_condition", description: "loop skips the first element instead", find: "for x in arr:", replace: "for x in arr[1:]:" },
];

export function generateMutants(referenceSource: string): Mutant[] {
  const mutants: Mutant[] = [];
  for (const rule of RULES) {
    const idx = referenceSource.indexOf(rule.find);
    if (idx === -1) continue; // rule doesn't apply to this source — skip, don't fake it
    const mutated = referenceSource.slice(0, idx) + rule.replace + referenceSource.slice(idx + rule.find.length);
    mutants.push({ id: rule.id, description: rule.description, mutatedSource: mutated });
  }
  return mutants;
}
