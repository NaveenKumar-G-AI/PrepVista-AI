import type Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { resetDb } from '../db/client';
import { addPrerequisite, addRoleCompetency, upsertRole, upsertSkill } from '../repositories/skillGraphRepo';
import { createStudent, setActiveTarget } from '../repositories/studentRepo';
import { recordEvidence } from '../repositories/evidenceRepo';

export const SKILL = {
  PYTHON: 'skill_python',
  JAVA: 'skill_java',
  CPP: 'skill_cpp',
  ARRAYS: 'skill_arrays',
  STRINGS: 'skill_strings',
  HASH_MAPS: 'skill_hashmaps',
  STACKS: 'skill_stacks',
  QUEUES: 'skill_queues',
  TREES: 'skill_trees',
  BFS: 'skill_bfs',
  GRAPH_TRAVERSAL: 'skill_graph_traversal',
  GRAPHS: 'skill_graphs',
  SEARCHING: 'skill_searching',
  SORTING: 'skill_sorting',
  RECURSION: 'skill_recursion',
  DYNAMIC_PROGRAMMING: 'skill_dp',
  PROBLEM_SOLVING: 'skill_problem_solving',
  DEBUGGING: 'skill_debugging',
  COMPLEXITY: 'skill_complexity',
  INTERVIEW_CODING: 'skill_interview_coding',
} as const;

export const ROLE_SOFTWARE_ENGINEER = 'role_software_engineer';

export function seedSkillGraph(db: Database.Database) {
  const S = SKILL;
  upsertSkill(db, S.PYTHON, 'Python', 'Programming');
  upsertSkill(db, S.JAVA, 'Java', 'Programming');
  upsertSkill(db, S.CPP, 'C++', 'Programming');
  upsertSkill(db, S.ARRAYS, 'Arrays', 'Data Structures');
  upsertSkill(db, S.STRINGS, 'Strings', 'Data Structures');
  upsertSkill(db, S.HASH_MAPS, 'Hash Maps', 'Data Structures');
  upsertSkill(db, S.STACKS, 'Stacks', 'Data Structures');
  upsertSkill(db, S.QUEUES, 'Queues', 'Data Structures');
  upsertSkill(db, S.TREES, 'Trees', 'Data Structures');
  upsertSkill(db, S.BFS, 'Breadth-First Search', 'Data Structures');
  upsertSkill(db, S.GRAPH_TRAVERSAL, 'Graph Traversal', 'Data Structures');
  upsertSkill(db, S.GRAPHS, 'Graphs', 'Data Structures');
  upsertSkill(db, S.SEARCHING, 'Searching', 'Algorithms');
  upsertSkill(db, S.SORTING, 'Sorting', 'Algorithms');
  upsertSkill(db, S.RECURSION, 'Recursion', 'Algorithms');
  upsertSkill(db, S.DYNAMIC_PROGRAMMING, 'Dynamic Programming', 'Algorithms');
  upsertSkill(db, S.PROBLEM_SOLVING, 'Problem Solving', 'Practice');
  upsertSkill(db, S.DEBUGGING, 'Debugging', 'Practice');
  upsertSkill(db, S.COMPLEXITY, 'Complexity Analysis', 'Practice');
  upsertSkill(db, S.INTERVIEW_CODING, 'Interview Coding', 'Practice');

  // Real prerequisite chain — this is what lets "Queue weakness" propagate
  // into "BFS/Graphs aren't scheduleable yet" automatically (Phase 7/22).
  addPrerequisite(db, S.BFS, S.QUEUES);
  addPrerequisite(db, S.GRAPH_TRAVERSAL, S.BFS);
  addPrerequisite(db, S.GRAPHS, S.GRAPH_TRAVERSAL);
  addPrerequisite(db, S.HASH_MAPS, S.ARRAYS);
  addPrerequisite(db, S.DYNAMIC_PROGRAMMING, S.RECURSION);
  addPrerequisite(db, S.SORTING, S.ARRAYS);
}

export function seedRoleBlueprint(db: Database.Database) {
  upsertRole(db, ROLE_SOFTWARE_ENGINEER, 'Software Engineer', 'General-purpose backend/full-stack SWE track, placement/interview focused.');
  const R = ROLE_SOFTWARE_ENGINEER;
  const S = SKILL;
  const rc = (skillId: string, priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL', targetMastery: 'NOVICE' | 'DEVELOPING' | 'COMPETENT' | 'STRONG' | 'MASTERED', required = true, weight = 1) =>
    addRoleCompetency(db, { roleId: R, skillId, priority, targetMastery, required, weight, sequenceHint: null, description: null });

  rc(S.PYTHON, 'CRITICAL', 'STRONG', true, 1.5);
  rc(S.JAVA, 'LOW', 'COMPETENT', false, 0.5);
  rc(S.CPP, 'LOW', 'COMPETENT', false, 0.5);

  rc(S.ARRAYS, 'HIGH', 'STRONG', true, 1.2);
  rc(S.STRINGS, 'HIGH', 'COMPETENT', true, 1);
  rc(S.HASH_MAPS, 'HIGH', 'COMPETENT', true, 1.2);
  rc(S.STACKS, 'MEDIUM', 'COMPETENT', true, 0.8);
  rc(S.QUEUES, 'MEDIUM', 'COMPETENT', true, 0.8);
  rc(S.TREES, 'HIGH', 'COMPETENT', true, 1.1);
  rc(S.GRAPHS, 'HIGH', 'COMPETENT', true, 1.3);
  // NOTE: BFS and Graph Traversal are deliberately NOT direct role
  // competencies — they only enter a roadmap via prerequisite resolution of
  // Graphs, exactly like the brief's own example (Phase 7).

  rc(S.SEARCHING, 'MEDIUM', 'COMPETENT', true, 0.8);
  rc(S.SORTING, 'MEDIUM', 'COMPETENT', true, 0.8);
  rc(S.RECURSION, 'HIGH', 'COMPETENT', true, 1);
  rc(S.DYNAMIC_PROGRAMMING, 'HIGH', 'COMPETENT', true, 1.2);

  rc(S.PROBLEM_SOLVING, 'CRITICAL', 'COMPETENT', true, 1.4);
  rc(S.DEBUGGING, 'CRITICAL', 'COMPETENT', true, 1.4);
  rc(S.COMPLEXITY, 'MEDIUM', 'COMPETENT', true, 0.7);
  rc(S.INTERVIEW_CODING, 'HIGH', 'COMPETENT', true, 1.1);
}

/** Seeds exactly the evidence profile from the brief's Phase 64 demonstration scenario. */
export function seedDemoStudent(db: Database.Database) {
  const student = createStudent(db, 'demo.student@codeforge.dev', 'Demo Student');
  const S = SKILL;

  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + 90);

  setActiveTarget(db, {
    studentId: student.id,
    targetRoleId: ROLE_SOFTWARE_ENGINEER,
    goal: 'PLACEMENT_PREPARATION',
    targetState: 'INTERVIEW_READY',
    targetDate: targetDate.toISOString().slice(0, 10),
    dailyMinutes: 60,
    preferredLanguage: 'Python',
    focusAreas: [],
  });

  const success = (skillId: string, n: number, independent = true) => {
    for (let i = 0; i < n; i++) recordEvidence(db, { studentId: student.id, skillId, source: 'CHALLENGE_ATTEMPT', outcome: 'SUCCESS', independent });
  };

  // Python -> Strong (5 independent successes under the mastery-update formula)
  success(S.PYTHON, 5);
  // Arrays -> Strong
  success(S.ARRAYS, 5);
  // Hash Maps -> Competent
  success(S.HASH_MAPS, 4);
  // Algorithms -> Developing (Searching/Sorting/Recursion/DP each get evidence)
  success(S.SEARCHING, 3);
  success(S.SORTING, 3);
  success(S.RECURSION, 3);
  success(S.DYNAMIC_PROGRAMMING, 3);
  // Debugging -> Developing
  success(S.DEBUGGING, 3);
  // Graphs, Queues, BFS, Graph Traversal, Strings, Stacks, Trees, Problem
  // Solving, Complexity, Interview Coding, Java, C++ intentionally left with
  // ZERO evidence — a brand-new student genuinely has many unknowns, and
  // this is what the brief calls out explicitly for Graphs.

  return student;
}

export function seedAll(db: Database.Database) {
  seedSkillGraph(db);
  seedRoleBlueprint(db);
  const student = seedDemoStudent(db);

  // Second + third demo students for cohort aggregation (Phase 43/44),
  // same cohort, deliberately different evidence profiles.
  const s2 = createStudent(db, 'student2@codeforge.dev', 'Priya K.');
  db.prepare(`UPDATE students SET cohort_id = 'cohort_2026_cse' WHERE id IN (?, ?)`).run(student.id, s2.id);
  setActiveTarget(db, {
    studentId: s2.id,
    targetRoleId: ROLE_SOFTWARE_ENGINEER,
    goal: 'PLACEMENT_PREPARATION',
    targetState: 'INTERVIEW_READY',
    targetDate: null,
    dailyMinutes: 45,
    preferredLanguage: 'Python',
    focusAreas: [],
  });
  const successS2 = (skillId: string, n: number) => {
    for (let i = 0; i < n; i++) recordEvidence(db, { studentId: s2.id, skillId, source: 'CHALLENGE_ATTEMPT', outcome: 'SUCCESS', independent: true });
  };
  successS2(SKILL.ARRAYS, 3);
  successS2(SKILL.PYTHON, 2);
  for (let i = 0; i < 3; i++) recordEvidence(db, { studentId: s2.id, skillId: SKILL.DEBUGGING, source: 'CHALLENGE_ATTEMPT', outcome: 'FAIL', independent: true, failureCategory: 'LOGIC' });

  const s3 = createStudent(db, 'student3@codeforge.dev', 'Arjun M.');
  db.prepare(`UPDATE students SET cohort_id = 'cohort_2026_cse' WHERE id = ?`).run(s3.id);

  return { demoStudent: student };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const db = resetDb();
  const { demoStudent } = seedAll(db);
  console.log('Seeded database with Software Engineer role blueprint + demo cohort.');
  console.log('Demo student id:', demoStudent.id);
}
