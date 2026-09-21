import type { Skill, SkillRelationship } from './types.js';

// Data-driven taxonomy. Nothing about this list is hardcoded into a UI
// component — the skill map and skill detail views render whatever is here.
// A real deployment would move this into a content-managed table; this file
// is the seed/reference shape for that table.
export const SKILLS: Skill[] = [
  { id: 'skl_pct_fund', domain: 'Quantitative', topic: 'Commercial Arithmetic', subtopic: 'Percentages', name: 'Percentage Fundamentals', cognitiveLevels: ['foundation'], difficultyBand: [1, 3] },
  { id: 'skl_pct_app', domain: 'Quantitative', topic: 'Commercial Arithmetic', subtopic: 'Percentages', name: 'Percentage Application', cognitiveLevels: ['application'], difficultyBand: [2, 4] },
  { id: 'skl_pnl', domain: 'Quantitative', topic: 'Commercial Arithmetic', subtopic: 'Profit & Loss', name: 'Profit & Loss', cognitiveLevels: ['application', 'transfer'], difficultyBand: [2, 5] },
  { id: 'skl_ratio', domain: 'Quantitative', topic: 'Ratio & Proportion', subtopic: 'Ratio', name: 'Ratio', cognitiveLevels: ['foundation'], difficultyBand: [1, 3] },
  { id: 'skl_proportion', domain: 'Quantitative', topic: 'Ratio & Proportion', subtopic: 'Proportion', name: 'Proportion', cognitiveLevels: ['foundation', 'application'], difficultyBand: [1, 4] },
  { id: 'skl_time_work', domain: 'Quantitative', topic: 'Ratio & Proportion', subtopic: 'Time & Work', name: 'Time & Work', cognitiveLevels: ['application', 'transfer'], difficultyBand: [2, 5] },
  { id: 'skl_log_reasoning', domain: 'Logical', topic: 'Reasoning', subtopic: 'General', name: 'Logical Reasoning', cognitiveLevels: ['foundation', 'application'], difficultyBand: [1, 4] },
  { id: 'skl_circular_seating', domain: 'Logical', topic: 'Arrangements', subtopic: 'Seating', name: 'Circular Seating', cognitiveLevels: ['application'], difficultyBand: [2, 5] },
  { id: 'skl_vocab_context', domain: 'Verbal', topic: 'Vocabulary', subtopic: 'Contextual Vocabulary', name: 'Contextual Vocabulary', cognitiveLevels: ['application'], difficultyBand: [1, 4] },
  { id: 'skl_data_suff', domain: 'Data Interpretation', topic: 'Tables & Graphs', subtopic: 'Data Sufficiency', name: 'Data Sufficiency', cognitiveLevels: ['application', 'transfer'], difficultyBand: [2, 5] },
];

// Curated by content, never invented by AI. An AI-proposed edge (see
// ai/provider.ts docstring) would land in a review queue, not here, until a
// human approves it.
export const RELATIONSHIPS: SkillRelationship[] = [
  { id: 'rel_1', fromSkillId: 'skl_pct_fund', toSkillId: 'skl_pct_app', type: 'PREREQUISITE_OF', curatedConfidence: 0.95 },
  { id: 'rel_2', fromSkillId: 'skl_pct_app', toSkillId: 'skl_pnl', type: 'SUPPORTS', curatedConfidence: 0.85 },
  { id: 'rel_3', fromSkillId: 'skl_ratio', toSkillId: 'skl_proportion', type: 'PREREQUISITE_OF', curatedConfidence: 0.9 },
  { id: 'rel_4', fromSkillId: 'skl_proportion', toSkillId: 'skl_time_work', type: 'SUPPORTS', curatedConfidence: 0.8 },
  { id: 'rel_5', fromSkillId: 'skl_pnl', toSkillId: 'skl_time_work', type: 'RELATED_TO', curatedConfidence: 0.4 },
];

export function getSkill(skillId: string): Skill | undefined {
  return SKILLS.find((s) => s.id === skillId);
}
