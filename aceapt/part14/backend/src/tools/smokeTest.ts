import { QUESTIONS } from '../data/seedData';

const BASE = 'http://localhost:4000/api';
const questionsById = new Map(QUESTIONS.map((q) => [q.id, q]));

async function main() {
  console.log('--- create mastery check on Discount ---');
  const createRes = await fetch(`${BASE}/mastery-checks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ studentId: 'demo-student', skillId: 'discount' }),
  });
  const created: any = await createRes.json();
  console.log('status', createRes.status, 'blueprint', created.check.blueprint);
  console.log(
    'questions',
    created.questions.map((q: any) => q.id)
  );

  console.log('\n--- answer questions (deliberately get the hard/novel ones wrong) ---');
  for (const q of created.questions) {
    const real = questionsById.get(q.id)!;
    const answerCorrectly = real.difficulty !== 'hard';
    const answer = answerCorrectly ? real.correctAnswer : 'not-the-right-answer';
    const ansRes = await fetch(`${BASE}/mastery-checks/${created.check.id}/answers`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ questionId: q.id, answer, hintUsed: false, retries: 0, responseTimeMs: 15000 }),
    });
    const ansBody: any = await ansRes.json();
    console.log(`  ${q.id} (${real.difficulty}/${real.novelty}) -> submitted correct=${answerCorrectly}, graded correct=${ansBody.correct}`);
  }

  console.log('\n--- complete check ---');
  const completeRes = await fetch(`${BASE}/mastery-checks/${created.check.id}/complete`, { method: 'POST' });
  const completed: any = await completeRes.json();
  console.log('status', completeRes.status);
  console.log('before:', completed.before.state, completed.before.displayLabel);
  console.log('after: ', completed.after.state, completed.after.displayLabel, 'flags:', completed.after.flags);
  console.log('stateChanged:', completed.stateChanged);
  console.log('explanation:', completed.explanation);
  console.log('intervention:', completed.intervention);

  console.log('\n--- skill detail (should reflect the same after-state) ---');
  const detailRes = await fetch(`${BASE}/students/demo-student/skills/discount`);
  const detail: any = await detailRes.json();
  console.log('detail state:', detail.analysis.state, detail.analysis.displayLabel);

  console.log('\n--- history ---');
  const histRes = await fetch(`${BASE}/students/demo-student/skills/discount/history`);
  const hist: any = await histRes.json();
  console.log('transitions:', hist.transitions.map((t: any) => `${t.fromState} -> ${t.toState}`));

  console.log('\n--- readiness ---');
  const readyRes = await fetch(`${BASE}/students/demo-student/readiness`);
  const ready: any = await readyRes.json();
  console.log(ready.signals.filter((s: any) => s.eligibleForMixedAssessment).map((s: any) => s.skillName));

  console.log('\n--- intervene on probability directly ---');
  const intRes = await fetch(`${BASE}/students/demo-student/skills/probability/intervene`, { method: 'POST' });
  const intBody: any = await intRes.json();
  console.log(intBody.plan);
}

main().catch((e) => {
  console.error('SMOKE TEST FAILED', e);
  process.exit(1);
});
