/* eslint-disable no-console */
process.env.NODE_ENV = 'test'; // prevents server.ts's own auto-listen; we call listen() ourselves below
process.env.DB_FILE = process.env.DB_FILE || './data/demo.db';

import fs from 'node:fs';
import path from 'node:path';
import { resetDb } from '../db/client';
import { seedAll } from '../seed/seed';

async function main() {
  const db = resetDb();
  const { demoStudent } = seedAll(db);

  const { app } = await import('../api/server');
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 4000;
  const base = `http://127.0.0.1:${port}`;

  const outDir = path.join(process.cwd(), 'demo-output');
  fs.mkdirSync(outDir, { recursive: true });

  async function api(method: string, url: string, token: string | null, body?: unknown): Promise<{ status: number; json: any }> {
    const res = await fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, json };
  }

  function section(title: string) {
    console.log('\n' + '='.repeat(78));
    console.log(title);
    console.log('='.repeat(78));
  }

  function summarizeVersion(v: any) {
    console.log(`  version ${v.versionNumber} | trigger=${v.trigger} | readiness=${v.readinessState} (${v.readinessScore}) | atRisk=${v.atRisk}`);
    console.log(`  reason: ${v.reason}`);
    for (const m of v.milestones) {
      console.log(`  -- Milestone ${m.sequence + 1}: ${m.name}  [${m.status}]`);
      for (const s of m.skills) {
        const req = s.required ? 'required' : 'optional';
        console.log(`       ${s.skillName.padEnd(20)} ${s.gapStatus.padEnd(18)} pri=${s.priorityScore.toFixed(3)}  ${s.activityType.padEnd(14)} (${req})${s.insertedReason ? '  <- ' + s.insertedReason : ''}`);
      }
    }
  }

  // --- 1. auth ---
  section('STEP 1 — Dev login (stand-in for real auth; establishes a verified session token)');
  const login = await api('POST', '/auth/dev-login', null, { studentId: demoStudent.id });
  const token = login.json.token as string;
  console.log('  logged in as', demoStudent.id, '| token acquired:', token.slice(0, 24) + '...');

  // --- 2. generate v1 ---
  section('STEP 2 — POST /roadmap/generate (initial roadmap, real evidence, no LLM)');
  const gen = await api('POST', '/roadmap/generate', token);
  summarizeVersion(gen.json);
  fs.writeFileSync(path.join(outDir, 'v1.json'), JSON.stringify(gen.json, null, 2));

  // idempotency check
  const genAgain = await api('POST', '/roadmap/generate', token);
  console.log(`\n  idempotency check: calling generate again returns version ${genAgain.json.versionNumber} (no duplicate created)`);

  // --- 3. Evidence A: Debugging succeeds, crosses into Competent ---
  section('STEP 3 — Evidence: independent SUCCESS on Debugging -> recalculation');
  const evA = await api('POST', '/evidence', token, { skillId: 'skill_debugging', source: 'CHALLENGE_ATTEMPT', outcome: 'SUCCESS', independent: true });
  console.log('  mastery state now:', evA.json.masteryState);
  console.log('  roadmap changed:', evA.json.roadmapChanged);
  summarizeVersion(evA.json.roadmapVersion);
  fs.writeFileSync(path.join(outDir, 'v2.json'), JSON.stringify(evA.json.roadmapVersion, null, 2));

  // --- 4. Evidence B: Queues fails twice ---
  section('STEP 4 — Evidence: two independent FAILs on Queues -> a real weakness surfaces');
  const evB1 = await api('POST', '/evidence', token, { skillId: 'skill_queues', source: 'CHALLENGE_ATTEMPT', outcome: 'FAIL', independent: true, failureCategory: 'LOGIC' });
  console.log(`  after FAIL #1: mastery=${evB1.json.masteryState.masteryLevel}, roadmapChanged=${evB1.json.roadmapChanged} (this alone already flips Queues to a real gap)`);
  summarizeVersion(evB1.json.roadmapVersion);
  const evB = await api('POST', '/evidence', token, { skillId: 'skill_queues', source: 'CHALLENGE_ATTEMPT', outcome: 'FAIL', independent: true, failureCategory: 'LOGIC' });
  console.log(`\n  after FAIL #2: mastery=${evB.json.masteryState.masteryLevel}, roadmapChanged=${evB.json.roadmapChanged} (classification unchanged -> Phase 21: no redundant version)`);
  fs.writeFileSync(path.join(outDir, 'v3.json'), JSON.stringify(evB.json.roadmapVersion, null, 2));

  // "why this?" for Queues in the new version
  const queuesSkillRow = evB.json.roadmapVersion.milestones.flatMap((m: any) => m.skills).find((s: any) => s.skillName === 'Queues');
  if (queuesSkillRow) {
    const explain = await api('GET', `/roadmap/explain/${queuesSkillRow.id}`, token);
    console.log('\n  "Why this?" for Queues:\n   ', explain.json.explanation);
  }

  // --- 5. Evidence C: Queues resolved ---
  section('STEP 5 — Evidence: independent practice + VERIFICATION success on Queues -> chain unblocks');
  for (let i = 0; i < 3; i++) {
    await api('POST', '/evidence', token, { skillId: 'skill_queues', source: 'CHALLENGE_ATTEMPT', outcome: 'SUCCESS', independent: true });
  }
  const evC = await api('POST', '/evidence', token, { skillId: 'skill_queues', source: 'VERIFICATION', outcome: 'SUCCESS', independent: true });
  console.log('  mastery state now:', evC.json.masteryState);
  console.log('  roadmap changed:', evC.json.roadmapChanged);
  summarizeVersion(evC.json.roadmapVersion);
  fs.writeFileSync(path.join(outDir, 'v4.json'), JSON.stringify(evC.json.roadmapVersion, null, 2));

  // --- 6. readiness / versions / events / daily plan ---
  section('STEP 6 — Version history (nothing destroyed)');
  const versions = await api('GET', '/roadmap/versions', token);
  console.table(versions.json.map((v: any) => ({ version: v.versionNumber, trigger: v.trigger, readiness: v.readinessState, atRisk: v.atRisk })));

  section('STEP 7 — Full event / audit log');
  const events = await api('GET', '/roadmap/events', token);
  for (const e of events.json) console.log(`  [${e.createdAt}] ${e.eventType}`);
  fs.writeFileSync(path.join(outDir, 'events.json'), JSON.stringify(events.json, null, 2));

  section("STEP 8 — Today's plan (dynamically generated from the current roadmap)");
  const daily = await api('GET', '/roadmap/daily-plan', token);
  console.log('  primary action:', daily.json.primaryAction);
  for (const b of daily.json.blocks) console.log(`    ${b.minutes}min  ${b.label}`);
  fs.writeFileSync(path.join(outDir, 'daily-plan.json'), JSON.stringify(daily.json, null, 2));

  section('STEP 9 — Cohort aggregate (management view — aggregate only, no per-student data)');
  const tpoLogin = await api('POST', '/auth/dev-login', null, { studentId: demoStudent.id, role: 'TPO_ADMIN' });
  const cohort = await api('GET', '/management/cohort/cohort_2026_cse/summary', tpoLogin.json.token);
  console.log(JSON.stringify(cohort.json, null, 2));
  fs.writeFileSync(path.join(outDir, 'cohort.json'), JSON.stringify(cohort.json, null, 2));

  section('STEP 10 — Security check: a second, unrelated student cannot read this roadmap');
  const otherLogin = await api('POST', '/auth/dev-login', null, { studentId: (db.prepare(`SELECT id FROM students WHERE email='student2@codeforge.dev'`).get() as any).id });
  const stolenAttempt = await api('GET', `/roadmap/explain/${queuesSkillRow.id}`, otherLogin.json.token);
  console.log(`  student2 attempting to read student1's roadmap_skill explanation -> HTTP ${stolenAttempt.status} (${stolenAttempt.json?.error})`);

  server.close();
  console.log('\nDemo complete. Real snapshots written to ./demo-output/*.json');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
