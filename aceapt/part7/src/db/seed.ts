import { EvidenceRepo, ReadinessRepo, GoalRepo, StudentRepo, MilestoneRepo } from './repositories';
import { MilestoneService } from '../services/goalsAndMilestones';
import { GoalType, SkillEvidence } from '../types';

// One demo student whose evidence is deliberately shaped to exercise most of
// the ProblemDetectionService branches for real (SPEED_GAP, ERROR_PATTERN,
// CONCEPT_GAP, STABLE_STRENGTH, REGRESSION, MIXED_PERFORMANCE_GAP) rather
// than hard-coding any output. Run the engine against it and the top
// priority should land on Data Interpretation's timed-accuracy drop — the
// same scenario the product plan walks through in §8 and §42.
export const DEMO_STUDENT_ID = 'demo-student-01';

function seedStudent() {
  if (StudentRepo.getById(DEMO_STUDENT_ID)) return;
  StudentRepo.insert({ id: DEMO_STUDENT_ID, name: 'Demo Student' });
}

function seedEvidence() {
  if (EvidenceRepo.find((e) => e.student_id === DEMO_STUDENT_ID).length > 0) return;

  const now = new Date().toISOString();
  const rows: Omit<SkillEvidence, 'student_id'>[] = [
    {
      skill_id: 'data-interpretation',
      skill_name: 'Data Interpretation',
      category: 'Quantitative',
      concept_mastery: 82,
      accuracy: 74,
      untimed_accuracy: 81,
      timed_accuracy: 55,
      avg_solving_time_sec: 92,
      target_solving_time_sec: 65,
      consistency: 70,
      mixed_topic_accuracy: 70,
      error_tags: [],
      attempts: 14,
      updated_at: now,
    },
    {
      skill_id: 'calculation-accuracy',
      skill_name: 'Calculation Accuracy',
      category: 'Quantitative',
      concept_mastery: 88,
      accuracy: 79,
      untimed_accuracy: 82,
      timed_accuracy: 77,
      avg_solving_time_sec: 40,
      target_solving_time_sec: 38,
      consistency: 75,
      mixed_topic_accuracy: 75,
      error_tags: ['calculation_slip', 'sign_error'],
      attempts: 20,
      updated_at: now,
    },
    {
      skill_id: 'logical-sequences',
      skill_name: 'Logical Sequences',
      category: 'Logical',
      concept_mastery: 45,
      accuracy: 48,
      untimed_accuracy: 50,
      timed_accuracy: 44,
      avg_solving_time_sec: 70,
      target_solving_time_sec: 60,
      consistency: 40,
      mixed_topic_accuracy: 40,
      error_tags: [],
      attempts: 6,
      updated_at: now,
    },
    {
      skill_id: 'arithmetic-fundamentals',
      skill_name: 'Arithmetic Fundamentals',
      category: 'Quantitative',
      concept_mastery: 92,
      accuracy: 90,
      untimed_accuracy: 91,
      timed_accuracy: 89,
      avg_solving_time_sec: 30,
      target_solving_time_sec: 32,
      consistency: 90,
      mixed_topic_accuracy: 88,
      error_tags: [],
      attempts: 25,
      historical_peak_accuracy: 92,
      updated_at: now,
    },
    {
      skill_id: 'verbal-reasoning',
      skill_name: 'Verbal Reasoning',
      category: 'Verbal',
      concept_mastery: 80,
      accuracy: 71,
      untimed_accuracy: 74,
      timed_accuracy: 68,
      avg_solving_time_sec: 55,
      target_solving_time_sec: 55,
      consistency: 65,
      mixed_topic_accuracy: 68,
      error_tags: [],
      attempts: 10,
      historical_peak_accuracy: 88,
      updated_at: now,
    },
    {
      skill_id: 'mixed-question-sets',
      skill_name: 'Mixed Question Sets',
      category: 'Logical',
      concept_mastery: 85,
      accuracy: 80,
      untimed_accuracy: 80,
      timed_accuracy: 78,
      avg_solving_time_sec: 50,
      target_solving_time_sec: 55,
      consistency: 60,
      mixed_topic_accuracy: 62,
      error_tags: [],
      attempts: 9,
      updated_at: now,
    },
  ];

  rows.forEach((r) => EvidenceRepo.insert({ ...r, student_id: DEMO_STUDENT_ID }));
}

function seedReadiness() {
  if (ReadinessRepo.find((s) => s.student_id === DEMO_STUDENT_ID).length > 0) return;
  ReadinessRepo.insert({
    student_id: DEMO_STUDENT_ID,
    readiness: 62,
    taken_at: new Date().toISOString(),
    source: 'ASSESSMENT',
  });
}

function seedGoal() {
  if (GoalRepo.find((g) => g.student_id === DEMO_STUDENT_ID).length > 0) return;
  GoalRepo.insert({
    student_id: DEMO_STUDENT_ID,
    goal_type: GoalType.REACH_READINESS_THRESHOLD,
    target: 80,
    status: 'ACTIVE',
    created_at: new Date().toISOString(),
  });
}

function seedMilestones() {
  MilestoneService.seedDefault(DEMO_STUDENT_ID, [
    { objective: 'Fix repeated calculation errors', target_skill: 'calculation-accuracy', target: 90, progress: 79 },
    { objective: 'Improve timed data interpretation', target_skill: 'data-interpretation', target: 85, progress: 74 },
    { objective: 'Strengthen mixed-question consistency', target_skill: 'mixed-question-sets', target: 85, progress: 62 },
    { objective: 'Reach overall readiness threshold', target: 80, progress: 62 },
  ]);
}

export function seedAll() {
  seedStudent();
  seedEvidence();
  seedReadiness();
  seedGoal();

  // Milestones are keyed by (student_id, target_skill) pairs that don't
  // exist yet on first boot — guard separately so re-running seed on every
  // server start never duplicates rows.
  if (MilestoneRepo.find((m) => m.student_id === DEMO_STUDENT_ID).length === 0) {
    seedMilestones();
  }

  console.log(`[seed] Demo data ready for student ${DEMO_STUDENT_ID}`);
}

if (require.main === module) {
  seedAll();
}
