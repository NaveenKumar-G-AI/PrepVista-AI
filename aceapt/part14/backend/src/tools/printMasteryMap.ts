/**
 * Dev/debug utility: prints the engine's computed analysis for every skill
 * for a given student, straight from the deterministic engine, with no UI
 * in the way. Run with `npm run debug:map [studentId]`.
 */

import { computeAllAnalyses } from '../engine/masteryAnalyzer';
import { computeAllEvidence } from '../engine/masteryAnalyzer';
import { computeBottlenecks } from '../engine/rootCauseEngine';
import { db } from '../data/store';

const studentId = process.argv[2] || 'demo-student';
const store = db.get();
const skills = Array.from(store.skills.values());
const questionsById = new Map(Array.from(store.questions.values()).map((q) => [q.id, q]));
const attempts = store.attempts.filter((a) => a.studentId === studentId);

const analyses = computeAllAnalyses(attempts, skills, questionsById);

console.log(`\nMastery map for ${studentId}\n${'='.repeat(60)}`);
for (const skill of skills) {
  const a = analyses.get(skill.id)!;
  console.log(`\n${skill.name}  [${skill.id}]`);
  console.log(`  state: ${a.state}   label: "${a.displayLabel}"   confidence: ${a.confidence}`);
  console.log(`  flags: ${a.flags.length ? a.flags.join(', ') : '(none)'}`);
  console.log(
    `  independent(recent): ${pct(a.evidence.independentAccuracy)}  lifetime: ${pct(a.evidence.lifetimeIndependentAccuracy)}  guided: ${pct(
      a.evidence.guidedAccuracy
    )}`
  );
  console.log(`  familiar: ${pct(a.evidence.familiarAccuracy)}  novel: ${pct(a.evidence.novelAccuracy)} (n=${a.evidence.novelIndependentAttempts})`);
  console.log(
    `  easy: ${pct(a.evidence.byDifficulty.easy.accuracy)}  medium: ${pct(a.evidence.byDifficulty.medium.accuracy)}  hard: ${pct(
      a.evidence.byDifficulty.hard.accuracy
    )}  ceiling: ${a.difficultyCeiling ?? 'n/a'}`
  );
  console.log(
    `  retention immediate: ${pct(a.evidence.retention.immediateAccuracy)}  delayed: ${pct(a.evidence.retention.delayedAccuracy)} (n=${a.evidence.retention.delayedAttempts})`
  );
  console.log(`  stability: ${a.stability}   distinct independent Qs: ${a.evidence.independentDistinctQuestions}`);
  if (a.rootCauseSkillIds.length) console.log(`  root cause candidates: ${a.rootCauseSkillIds.join(', ')}`);
  console.log(`  next action: ${a.nextAction}`);
}

const evidenceById = computeAllEvidence(attempts, skills, questionsById);
const bottlenecks = computeBottlenecks(skills, evidenceById);
console.log(`\nBottleneck candidates (skills with dependents):`);
for (const b of bottlenecks) {
  console.log(`  ${b.skillId}: ${b.dependentCount} dependent skill(s)${b.isCurrentlyWeak ? '  \u26a0 currently weak' : ''}`);
}

function pct(v: number | null): string {
  return v == null ? 'n/a' : `${Math.round(v * 100)}%`;
}
