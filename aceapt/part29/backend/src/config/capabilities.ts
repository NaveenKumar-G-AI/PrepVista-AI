/**
 * Capability catalog.
 *
 * If ACEAPT already has a capability table (it should, from Feature 3/8/20),
 * point CAPABILITY_CATALOG at that instead of this static list — this file
 * exists so the module runs standalone and so target profiles below have
 * stable ids to reference. Swapping the source is a one-file change; nothing
 * downstream cares where the list came from.
 */
export interface CapabilityDefinition {
  id: string;
  name: string;
  /** Loose grouping, display-only. */
  family: 'REASONING' | 'TECHNICAL' | 'BEHAVIORAL' | 'PERFORMANCE';
}

export const CAPABILITY_CATALOG: CapabilityDefinition[] = [
  { id: 'quant_reasoning', name: 'Quantitative Reasoning', family: 'REASONING' },
  { id: 'logical_reasoning', name: 'Logical Reasoning', family: 'REASONING' },
  { id: 'data_interpretation', name: 'Data Interpretation', family: 'REASONING' },
  { id: 'pattern_recognition', name: 'Pattern Recognition', family: 'REASONING' },
  { id: 'problem_solving', name: 'Problem Solving', family: 'REASONING' },
  { id: 'novel_problem_solving', name: 'Novel Problem Solving', family: 'REASONING' },
  { id: 'programming', name: 'Programming', family: 'TECHNICAL' },
  { id: 'technical_fundamentals', name: 'Technical Fundamentals', family: 'TECHNICAL' },
  { id: 'cloud_devops_fundamentals', name: 'Cloud & DevOps Fundamentals', family: 'TECHNICAL' },
  { id: 'ml_fundamentals', name: 'Machine Learning Fundamentals', family: 'TECHNICAL' },
  { id: 'communication', name: 'Communication', family: 'BEHAVIORAL' },
  { id: 'consistency', name: 'Consistency', family: 'BEHAVIORAL' },
  { id: 'speed', name: 'Speed', family: 'PERFORMANCE' },
  { id: 'time_pressure_handling', name: 'Time Pressure Handling', family: 'PERFORMANCE' },
];

export function capabilityName(id: string): string {
  return CAPABILITY_CATALOG.find((c) => c.id === id)?.name ?? id;
}
