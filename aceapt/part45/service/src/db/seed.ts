/* eslint-disable no-console */
import { z } from 'zod';
import { db } from './client';
import { skillEvidenceEvents, studentSkillStates, questionSkillMappings, skillRelationships, skills, graphVersions } from './schema';
import { createSkill, createRelationship, publishPendingChanges, CreateRelationshipInput as CreateRelationshipInputSchema, type CreateSkillInput } from '../services/graphAdmin.service';
import { questionSkillMappingRepository } from '../repositories/questionSkillMapping.repository';
import { skillRepository } from '../repositories/skill.repository';
import { evidenceRepository } from '../repositories/studentState.repository';
import { recomputeStudentSkillState } from '../services/studentSkillState.service';

async function reset() {
  await db.delete(skillEvidenceEvents);
  await db.delete(studentSkillStates);
  await db.delete(questionSkillMappings);
  await db.delete(skillRelationships);
  await db.delete(skills);
  await db.delete(graphVersions);
  console.log('Reset: cleared all tables.');
}

// ---------------------------------------------------------------------------
// CATEGORIES + SKILLS (sections 11-13). Deliberately CATEGORY -> SKILL only
// for this reference dataset (section 9: "do not create unnecessary
// hierarchy levels" — the `domain` field already captures the top level, and
// this curriculum doesn't need SUBSKILL/MICRO_CAPABILITY nodes; the level
// enum still supports them whenever a real curriculum does).
// ---------------------------------------------------------------------------

const categories: CreateSkillInput[] = [
  { code: 'QUANT.ARITHMETIC', displayName: 'Arithmetic', domain: 'QUANTITATIVE_APTITUDE', level: 'CATEGORY' },
  { code: 'QUANT.ALGEBRA_EQUATIONS', displayName: 'Algebra & Equations', domain: 'QUANTITATIVE_APTITUDE', level: 'CATEGORY' },
  { code: 'QUANT.GEOMETRY_MENSURATION', displayName: 'Geometry & Mensuration', domain: 'QUANTITATIVE_APTITUDE', level: 'CATEGORY' },
  { code: 'QUANT.MODERN_MATH_DATA', displayName: 'Modern Math & Data Interpretation', domain: 'QUANTITATIVE_APTITUDE', level: 'CATEGORY' },
  { code: 'LOGIC.ANALYTICAL_DEDUCTIVE', displayName: 'Analytical & Deductive Reasoning', domain: 'LOGICAL_REASONING', level: 'CATEGORY' },
  { code: 'LOGIC.PATTERN_PUZZLE', displayName: 'Pattern & Puzzle Reasoning', domain: 'LOGICAL_REASONING', level: 'CATEGORY' },
  { code: 'LOGIC.CODING_RELATIONS', displayName: 'Coding, Series & Relations', domain: 'LOGICAL_REASONING', level: 'CATEGORY' },
  { code: 'VERBAL.GRAMMAR_USAGE', displayName: 'Grammar & Usage', domain: 'VERBAL_APTITUDE', level: 'CATEGORY' },
  { code: 'VERBAL.VOCAB_COMPREHENSION', displayName: 'Vocabulary & Comprehension', domain: 'VERBAL_APTITUDE', level: 'CATEGORY' },
];

const skillDefs: Array<Omit<CreateSkillInput, 'parentId'> & { parentCode: string }> = [
  // Arithmetic
  { code: 'QUANT.PERCENTAGES', displayName: 'Percentages', domain: 'QUANTITATIVE_APTITUDE', level: 'SKILL', parentCode: 'QUANT.ARITHMETIC' },
  { code: 'QUANT.RATIO', displayName: 'Ratio', domain: 'QUANTITATIVE_APTITUDE', level: 'SKILL', parentCode: 'QUANT.ARITHMETIC' },
  { code: 'QUANT.PROPORTION', displayName: 'Proportion', domain: 'QUANTITATIVE_APTITUDE', level: 'SKILL', parentCode: 'QUANT.ARITHMETIC' },
  { code: 'QUANT.AVERAGE', displayName: 'Average', domain: 'QUANTITATIVE_APTITUDE', level: 'SKILL', parentCode: 'QUANT.ARITHMETIC' },
  { code: 'QUANT.PROFIT_LOSS', displayName: 'Profit & Loss', domain: 'QUANTITATIVE_APTITUDE', level: 'SKILL', parentCode: 'QUANT.ARITHMETIC' },
  { code: 'QUANT.DISCOUNT', displayName: 'Discount', domain: 'QUANTITATIVE_APTITUDE', level: 'SKILL', parentCode: 'QUANT.ARITHMETIC' },
  { code: 'QUANT.SIMPLE_INTEREST', displayName: 'Simple Interest', domain: 'QUANTITATIVE_APTITUDE', level: 'SKILL', parentCode: 'QUANT.ARITHMETIC' },
  { code: 'QUANT.COMPOUND_INTEREST', displayName: 'Compound Interest', domain: 'QUANTITATIVE_APTITUDE', level: 'SKILL', parentCode: 'QUANT.ARITHMETIC' },
  { code: 'QUANT.TIME_WORK', displayName: 'Time & Work', domain: 'QUANTITATIVE_APTITUDE', level: 'SKILL', parentCode: 'QUANT.ARITHMETIC' },
  { code: 'QUANT.TIME_SPEED_DISTANCE', displayName: 'Time, Speed & Distance', domain: 'QUANTITATIVE_APTITUDE', level: 'SKILL', parentCode: 'QUANT.ARITHMETIC' },
  { code: 'QUANT.MIXTURES', displayName: 'Mixtures & Alligation', domain: 'QUANTITATIVE_APTITUDE', level: 'SKILL', parentCode: 'QUANT.ARITHMETIC' },
  // Algebra & Equations
  { code: 'QUANT.ALGEBRA', displayName: 'Algebra', domain: 'QUANTITATIVE_APTITUDE', level: 'SKILL', parentCode: 'QUANT.ALGEBRA_EQUATIONS' },
  { code: 'QUANT.EQUATIONS', displayName: 'Equations', domain: 'QUANTITATIVE_APTITUDE', level: 'SKILL', parentCode: 'QUANT.ALGEBRA_EQUATIONS' },
  // Geometry & Mensuration
  { code: 'QUANT.GEOMETRY', displayName: 'Geometry', domain: 'QUANTITATIVE_APTITUDE', level: 'SKILL', parentCode: 'QUANT.GEOMETRY_MENSURATION' },
  { code: 'QUANT.MENSURATION', displayName: 'Mensuration', domain: 'QUANTITATIVE_APTITUDE', level: 'SKILL', parentCode: 'QUANT.GEOMETRY_MENSURATION' },
  // Modern Math & Data
  { code: 'QUANT.PERMUTATION', displayName: 'Permutation', domain: 'QUANTITATIVE_APTITUDE', level: 'SKILL', parentCode: 'QUANT.MODERN_MATH_DATA' },
  { code: 'QUANT.COMBINATION', displayName: 'Combination', domain: 'QUANTITATIVE_APTITUDE', level: 'SKILL', parentCode: 'QUANT.MODERN_MATH_DATA' },
  { code: 'QUANT.PROBABILITY', displayName: 'Probability', domain: 'QUANTITATIVE_APTITUDE', level: 'SKILL', parentCode: 'QUANT.MODERN_MATH_DATA' },
  { code: 'QUANT.DATA_INTERPRETATION', displayName: 'Data Interpretation', domain: 'QUANTITATIVE_APTITUDE', level: 'SKILL', parentCode: 'QUANT.MODERN_MATH_DATA' },
  // Analytical & Deductive
  { code: 'LOGIC.ANALYTICAL_REASONING', displayName: 'Analytical Reasoning', domain: 'LOGICAL_REASONING', level: 'SKILL', parentCode: 'LOGIC.ANALYTICAL_DEDUCTIVE' },
  { code: 'LOGIC.DEDUCTIVE_REASONING', displayName: 'Deductive Reasoning', domain: 'LOGICAL_REASONING', level: 'SKILL', parentCode: 'LOGIC.ANALYTICAL_DEDUCTIVE' },
  { code: 'LOGIC.SYLLOGISM', displayName: 'Syllogism', domain: 'LOGICAL_REASONING', level: 'SKILL', parentCode: 'LOGIC.ANALYTICAL_DEDUCTIVE' },
  // Pattern & Puzzle
  { code: 'LOGIC.PATTERN_REASONING', displayName: 'Pattern Reasoning', domain: 'LOGICAL_REASONING', level: 'SKILL', parentCode: 'LOGIC.PATTERN_PUZZLE' },
  { code: 'LOGIC.PUZZLE_REASONING', displayName: 'Puzzle Reasoning', domain: 'LOGICAL_REASONING', level: 'SKILL', parentCode: 'LOGIC.PATTERN_PUZZLE' },
  { code: 'LOGIC.SEATING_ARRANGEMENT', displayName: 'Seating Arrangement', domain: 'LOGICAL_REASONING', level: 'SKILL', parentCode: 'LOGIC.PATTERN_PUZZLE' },
  { code: 'LOGIC.LOGICAL_PUZZLES', displayName: 'Logical Puzzles', domain: 'LOGICAL_REASONING', level: 'SKILL', parentCode: 'LOGIC.PATTERN_PUZZLE' },
  { code: 'LOGIC.COMPLEX_ANALYTICAL_REASONING', displayName: 'Complex Analytical Reasoning', domain: 'LOGICAL_REASONING', level: 'SKILL', parentCode: 'LOGIC.PATTERN_PUZZLE' },
  // Coding, Series & Relations
  { code: 'LOGIC.CODING_DECODING', displayName: 'Coding-Decoding', domain: 'LOGICAL_REASONING', level: 'SKILL', parentCode: 'LOGIC.CODING_RELATIONS' },
  { code: 'LOGIC.SERIES', displayName: 'Series', domain: 'LOGICAL_REASONING', level: 'SKILL', parentCode: 'LOGIC.CODING_RELATIONS' },
  { code: 'LOGIC.BLOOD_RELATIONS', displayName: 'Blood Relations', domain: 'LOGICAL_REASONING', level: 'SKILL', parentCode: 'LOGIC.CODING_RELATIONS' },
  { code: 'LOGIC.DIRECTIONS', displayName: 'Directions', domain: 'LOGICAL_REASONING', level: 'SKILL', parentCode: 'LOGIC.CODING_RELATIONS' },
  // Grammar & Usage
  { code: 'VERBAL.GRAMMAR', displayName: 'Grammar', domain: 'VERBAL_APTITUDE', level: 'SKILL', parentCode: 'VERBAL.GRAMMAR_USAGE' },
  { code: 'VERBAL.SENTENCE_STRUCTURE', displayName: 'Sentence Structure', domain: 'VERBAL_APTITUDE', level: 'SKILL', parentCode: 'VERBAL.GRAMMAR_USAGE' },
  { code: 'VERBAL.USAGE', displayName: 'Usage', domain: 'VERBAL_APTITUDE', level: 'SKILL', parentCode: 'VERBAL.GRAMMAR_USAGE' },
  // Vocabulary & Comprehension
  { code: 'VERBAL.VOCABULARY', displayName: 'Vocabulary', domain: 'VERBAL_APTITUDE', level: 'SKILL', parentCode: 'VERBAL.VOCAB_COMPREHENSION' },
  { code: 'VERBAL.READING_COMPREHENSION', displayName: 'Reading Comprehension', domain: 'VERBAL_APTITUDE', level: 'SKILL', parentCode: 'VERBAL.VOCAB_COMPREHENSION' },
  { code: 'VERBAL.CRITICAL_REASONING', displayName: 'Critical Reasoning', domain: 'VERBAL_APTITUDE', level: 'SKILL', parentCode: 'VERBAL.VOCAB_COMPREHENSION' },
  { code: 'VERBAL.INFERENCE', displayName: 'Inference', domain: 'VERBAL_APTITUDE', level: 'SKILL', parentCode: 'VERBAL.VOCAB_COMPREHENSION' },
];

type RelDef = Omit<z.input<typeof CreateRelationshipInputSchema>, 'fromSkillId' | 'toSkillId'> & { from: string; to: string };

const relationshipDefs: RelDef[] = [
  // --- Quantitative ---
  { from: 'QUANT.PERCENTAGES', to: 'QUANT.PROFIT_LOSS', relationshipType: 'PREREQUISITE', weight: 0.8, source: 'CURRICULUM' },
  { from: 'QUANT.PERCENTAGES', to: 'QUANT.DISCOUNT', relationshipType: 'PREREQUISITE', weight: 0.7, source: 'CURRICULUM' },
  { from: 'QUANT.PERCENTAGES', to: 'QUANT.SIMPLE_INTEREST', relationshipType: 'PREREQUISITE', weight: 0.6, source: 'CURRICULUM' },
  { from: 'QUANT.SIMPLE_INTEREST', to: 'QUANT.COMPOUND_INTEREST', relationshipType: 'PREREQUISITE', weight: 0.9, source: 'CURRICULUM' },
  { from: 'QUANT.RATIO', to: 'QUANT.PROPORTION', relationshipType: 'PREREQUISITE', weight: 0.9, source: 'CURRICULUM' },
  { from: 'QUANT.RATIO', to: 'QUANT.AVERAGE', relationshipType: 'PREREQUISITE', weight: 0.5, source: 'CURRICULUM' },
  { from: 'QUANT.RATIO', to: 'QUANT.MIXTURES', relationshipType: 'PREREQUISITE', weight: 0.7, source: 'CURRICULUM' },
  { from: 'QUANT.PROPORTION', to: 'QUANT.TIME_WORK', relationshipType: 'PREREQUISITE', weight: 0.6, source: 'CURRICULUM' },
  { from: 'QUANT.PROPORTION', to: 'QUANT.TIME_SPEED_DISTANCE', relationshipType: 'PREREQUISITE', weight: 0.6, source: 'CURRICULUM' },
  { from: 'QUANT.PERCENTAGES', to: 'QUANT.DATA_INTERPRETATION', relationshipType: 'PREREQUISITE', weight: 0.7, source: 'CURRICULUM' },
  { from: 'QUANT.RATIO', to: 'QUANT.DATA_INTERPRETATION', relationshipType: 'PREREQUISITE', weight: 0.7, source: 'CURRICULUM' },
  { from: 'QUANT.AVERAGE', to: 'QUANT.DATA_INTERPRETATION', relationshipType: 'PREREQUISITE', weight: 0.5, source: 'CURRICULUM' },
  { from: 'QUANT.PROFIT_LOSS', to: 'QUANT.DATA_INTERPRETATION', relationshipType: 'RELATED_TO', weight: 0.4, source: 'CURRICULUM', rationale: 'Data Interpretation sets frequently embed profit/loss scenarios inside a table or chart.' },
  { from: 'QUANT.EQUATIONS', to: 'QUANT.ALGEBRA', relationshipType: 'PART_OF', weight: 1.0, source: 'CURRICULUM' },
  { from: 'QUANT.ALGEBRA', to: 'QUANT.TIME_WORK', relationshipType: 'RELATED_TO', weight: 0.4, source: 'CURRICULUM', rationale: 'Work and pipe problems are commonly solved by setting up an algebraic equation.' },
  { from: 'QUANT.GEOMETRY', to: 'QUANT.MENSURATION', relationshipType: 'PREREQUISITE', weight: 0.9, source: 'CURRICULUM' },
  { from: 'QUANT.PERMUTATION', to: 'QUANT.COMBINATION', relationshipType: 'PREREQUISITE', weight: 0.9, source: 'CURRICULUM' },
  { from: 'QUANT.COMBINATION', to: 'QUANT.PROBABILITY', relationshipType: 'PREREQUISITE', weight: 0.9, source: 'CURRICULUM' },
  { from: 'QUANT.TIME_SPEED_DISTANCE', to: 'QUANT.TIME_WORK', relationshipType: 'RELATED_TO', weight: 0.5, source: 'CURRICULUM', rationale: 'Both are "rate" problems (distance/time and work/time) and transfer well once one clicks.' },
  { from: 'QUANT.PERCENTAGES', to: 'QUANT.PROFIT_LOSS', relationshipType: 'COMMON_ERROR_SOURCE', weight: 0.3, source: 'EMPIRICAL_DATA', rationale: 'Successive percentage change mistakes are a common source of Profit & Loss errors.' },
  { from: 'QUANT.RATIO', to: 'QUANT.PROBABILITY', relationshipType: 'TRANSFER_TO', weight: 0.3, source: 'EXPERT_AUTHORED', rationale: 'Comfort with ratios of favorable-to-total outcomes transfers into setting up probability questions.' },

  // --- Logical ---
  { from: 'LOGIC.PATTERN_REASONING', to: 'LOGIC.PUZZLE_REASONING', relationshipType: 'PREREQUISITE', weight: 0.8, source: 'CURRICULUM' },
  { from: 'LOGIC.PUZZLE_REASONING', to: 'LOGIC.COMPLEX_ANALYTICAL_REASONING', relationshipType: 'PREREQUISITE', weight: 0.85, source: 'CURRICULUM' },
  { from: 'LOGIC.SEATING_ARRANGEMENT', to: 'LOGIC.PUZZLE_REASONING', relationshipType: 'PART_OF', weight: 1.0, source: 'CURRICULUM' },
  { from: 'LOGIC.LOGICAL_PUZZLES', to: 'LOGIC.PUZZLE_REASONING', relationshipType: 'PART_OF', weight: 1.0, source: 'CURRICULUM' },
  { from: 'LOGIC.SYLLOGISM', to: 'LOGIC.DEDUCTIVE_REASONING', relationshipType: 'PART_OF', weight: 1.0, source: 'CURRICULUM' },
  { from: 'LOGIC.DEDUCTIVE_REASONING', to: 'LOGIC.ANALYTICAL_REASONING', relationshipType: 'RELATED_TO', weight: 0.5, source: 'CURRICULUM' },
  { from: 'LOGIC.CODING_DECODING', to: 'LOGIC.PATTERN_REASONING', relationshipType: 'RELATED_TO', weight: 0.6, source: 'CURRICULUM' },
  { from: 'LOGIC.SERIES', to: 'LOGIC.PATTERN_REASONING', relationshipType: 'RELATED_TO', weight: 0.7, source: 'CURRICULUM' },
  { from: 'LOGIC.BLOOD_RELATIONS', to: 'LOGIC.DIRECTIONS', relationshipType: 'RELATED_TO', weight: 0.4, source: 'CURRICULUM' },
  { from: 'LOGIC.ANALYTICAL_REASONING', to: 'LOGIC.PUZZLE_REASONING', relationshipType: 'PREREQUISITE', weight: 0.6, source: 'CURRICULUM' },
  { from: 'LOGIC.ANALYTICAL_REASONING', to: 'LOGIC.COMPLEX_ANALYTICAL_REASONING', relationshipType: 'DEPENDS_ON', weight: 0.5, source: 'CURRICULUM', rationale: 'A direct link in addition to the path through Puzzle Reasoning — complex sets lean on analytical fundamentals directly too.' },

  // --- Verbal ---
  { from: 'VERBAL.GRAMMAR', to: 'VERBAL.SENTENCE_STRUCTURE', relationshipType: 'PREREQUISITE', weight: 0.8, source: 'CURRICULUM' },
  { from: 'VERBAL.SENTENCE_STRUCTURE', to: 'VERBAL.USAGE', relationshipType: 'PREREQUISITE', weight: 0.6, source: 'CURRICULUM' },
  { from: 'VERBAL.VOCABULARY', to: 'VERBAL.READING_COMPREHENSION', relationshipType: 'PREREQUISITE', weight: 0.7, source: 'CURRICULUM' },
  { from: 'VERBAL.READING_COMPREHENSION', to: 'VERBAL.CRITICAL_REASONING', relationshipType: 'PREREQUISITE', weight: 0.7, source: 'CURRICULUM' },
  { from: 'VERBAL.READING_COMPREHENSION', to: 'VERBAL.INFERENCE', relationshipType: 'PREREQUISITE', weight: 0.7, source: 'CURRICULUM' },
  { from: 'VERBAL.GRAMMAR', to: 'VERBAL.READING_COMPREHENSION', relationshipType: 'RELATED_TO', weight: 0.3, source: 'CURRICULUM' },
  { from: 'VERBAL.VOCABULARY', to: 'VERBAL.CRITICAL_REASONING', relationshipType: 'BUILDS', weight: 0.4, source: 'CURRICULUM', rationale: 'A stronger vocabulary reduces the friction of dense critical-reasoning passages.' },
];

async function seedGraph() {
  const codeToId = new Map<string, string>();

  for (const category of categories) {
    const skill = await createSkill(category);
    codeToId.set(skill.code, skill.id);
  }
  for (const def of skillDefs) {
    const parentId = codeToId.get(def.parentCode);
    const skill = await createSkill({ ...def, parentId });
    codeToId.set(skill.code, skill.id);
  }
  console.log(`Created ${categories.length} categories + ${skillDefs.length} skills.`);

  for (const rel of relationshipDefs) {
    const fromSkillId = codeToId.get(rel.from);
    const toSkillId = codeToId.get(rel.to);
    if (!fromSkillId || !toSkillId) throw new Error(`Seed error: unknown skill code in relationship ${rel.from} -> ${rel.to}`);
    const parsed = CreateRelationshipInputSchema.parse({ ...rel, fromSkillId, toSkillId });
    await createRelationship(parsed);
  }
  console.log(`Created ${relationshipDefs.length} relationships.`);

  const publishResult = await publishPendingChanges();
  if (!publishResult.published) {
    console.error('Publish failed validation:', JSON.stringify(publishResult.report, null, 2));
    throw new Error('Seed graph failed validation — see report above.');
  }
  console.log(`Published graph version ${publishResult.versionLabel} (${publishResult.skillsPublished} skills, ${publishResult.relationshipsPublished} relationships, 0 critical issues).`);

  return codeToId;
}

async function seedQuestionMappings(codeToId: Map<string, string>) {
  const rows: Array<{ questionId: string; skillCode: string; weight: number; isPrimary: boolean }> = [
    { questionId: 'Q-DI-1001', skillCode: 'QUANT.DATA_INTERPRETATION', weight: 0.6, isPrimary: true },
    { questionId: 'Q-DI-1001', skillCode: 'QUANT.PERCENTAGES', weight: 0.25, isPrimary: false },
    { questionId: 'Q-DI-1001', skillCode: 'QUANT.RATIO', weight: 0.15, isPrimary: false },
    { questionId: 'Q-PCT-2001', skillCode: 'QUANT.PERCENTAGES', weight: 1.0, isPrimary: true },
    { questionId: 'Q-PROB-3001', skillCode: 'QUANT.PROBABILITY', weight: 0.7, isPrimary: true },
    { questionId: 'Q-PROB-3001', skillCode: 'QUANT.COMBINATION', weight: 0.3, isPrimary: false },
    { questionId: 'Q-PUZ-4001', skillCode: 'LOGIC.PUZZLE_REASONING', weight: 1.0, isPrimary: true },
  ];
  for (const row of rows) {
    const skillId = codeToId.get(row.skillCode);
    if (!skillId) throw new Error(`Seed error: unknown skill code ${row.skillCode}`);
    await questionSkillMappingRepository.create({ questionId: row.questionId, skillId, weight: row.weight, isPrimary: row.isPrimary });
  }
  console.log(`Created ${rows.length} question-skill mapping rows across ${new Set(rows.map((r) => r.questionId)).size} questions.`);
}

/** Chronological correctness pattern -> evidence events spaced an hour apart, then a state recompute. */
async function seedEvidence(studentId: string, skillCode: string, pattern: boolean[], eventType: 'PRACTICE' | 'ASSESSMENT' | 'DIAGNOSTIC' | 'MISTAKE' = 'PRACTICE') {
  const skill = await skillRepository.findByCode(skillCode);
  if (!skill) throw new Error(`Seed error: unknown skill code ${skillCode}`);
  const now = Date.now();
  for (let i = 0; i < pattern.length; i++) {
    const occurredAt = new Date(now - (pattern.length - i) * 60 * 60 * 1000); // spaced 1 hour apart, oldest first
    await evidenceRepository.createEvent({
      studentId,
      skillId: skill.id,
      eventType,
      isCorrect: pattern[i],
      weight: 1,
      sourceRef: `seed-${skillCode}-${i}`,
      occurredAt,
    });
  }
  const state = await recomputeStudentSkillState(studentId, skill.id);
  console.log(`  ${studentId} / ${skillCode}: capability=${state.capability ?? 'UNKNOWN'} state=${state.state} confidence=${state.confidence} (n=${pattern.length})`);
}

async function seedDemoStudents() {
  console.log('Seeding demo student evidence...');

  console.log('student_demo_1:');
  await seedEvidence('student_demo_1', 'QUANT.PERCENTAGES', [false, true, true, true, true, true, true, true, true, true]);
  await seedEvidence('student_demo_1', 'QUANT.RATIO', [false, true, false, true, true, true]);
  await seedEvidence('student_demo_1', 'QUANT.PERMUTATION', [false, true, true, true, true]);
  await seedEvidence('student_demo_1', 'QUANT.COMBINATION', [true, true, false, true, false, false, false]);
  await seedEvidence('student_demo_1', 'QUANT.PROBABILITY', [false, true, false, true, false, true, false]);
  await seedEvidence('student_demo_1', 'QUANT.DATA_INTERPRETATION', [true, false]);
  await seedEvidence('student_demo_1', 'LOGIC.PUZZLE_REASONING', [false, true, false, false, true, false]);
  await seedEvidence('student_demo_1', 'VERBAL.READING_COMPREHENSION', [true, true, true, false, true]);
  await seedEvidence('student_demo_1', 'QUANT.PROFIT_LOSS', [false], 'MISTAKE');
  // QUANT.GEOMETRY and VERBAL.CRITICAL_REASONING intentionally get ZERO
  // events — the section-25 "insufficient evidence, not weak" demo.

  console.log('student_demo_2:');
  await seedEvidence('student_demo_2', 'QUANT.PERCENTAGES', [true, false, true, false]);
  await seedEvidence('student_demo_2', 'LOGIC.PUZZLE_REASONING', [true, true, true]);

  console.log('student_demo_3:');
  await seedEvidence('student_demo_3', 'QUANT.PERCENTAGES', [true, true, true]);
  await seedEvidence('student_demo_3', 'QUANT.PROBABILITY', [false, false, true, false, false]);
}

async function main() {
  await reset();
  const codeToId = await seedGraph();
  await seedQuestionMappings(codeToId);
  await seedDemoStudents();
  console.log('\nSeed complete.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
