import { createDb, runMigrations, resetDb } from '../src/db/client.js';
import { seed } from '../src/db/seed.js';
import { createServer } from '../src/api/server.js';
import { NullProvider } from '../src/ai/nullProvider.js';
import { writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';

interface StepRecord {
  step: number;
  title: string;
  action: string;
  challengeTitle?: string;
  language?: string;
  passed?: boolean;
  testsPassed?: number;
  testsTotal?: number;
  mistakeCategory?: string;
  languageIssue?: boolean;
  narrative: string;
  skillStatesAfter?: { skillName: string; masteryScore: number; masteryState: string; confidenceScore: number; trend: string; evidenceCount: number }[];
  recommendation?: { skillName: string; gapType: string | null; interventionType: string; learningObjective: string; reason: string; rankingScore: number };
}

const BUGGY_PYTHON = 'def word_frequency(text)\n    words = text.lower().split()\n    return {w: words.count(w) for w in words}\n';
const CORRECT_PYTHON = 'def word_frequency(text):\n    words = text.lower().split()\n    result = {}\n    for w in words:\n        result[w] = result.get(w, 0) + 1\n    return result\n';
const CORRECT_BINARY_SEARCH = 'function binarySearch(nums, target) { let lo=0, hi=nums.length-1; while(lo<=hi){ const mid=Math.floor((lo+hi)/2); if(nums[mid]===target) return mid; if(nums[mid]<target) lo=mid+1; else hi=mid-1; } return -1; }';
const UNMODIFIED_BINARY_SEARCH_ON_ROTATED = 'function searchRotated(nums, target) { let lo=0, hi=nums.length-1; while(lo<=hi){ const mid=Math.floor((lo+hi)/2); if(nums[mid]===target) return mid; if(nums[mid]<target) lo=mid+1; else hi=mid-1; } return -1; }';
const ROTATION_AWARE_SEARCH = 'function searchRotated(nums, target) { let lo=0, hi=nums.length-1; while(lo<=hi){ const mid=Math.floor((lo+hi)/2); if(nums[mid]===target) return mid; if(nums[lo]<=nums[mid]){ if(nums[lo]<=target && target<nums[mid]) hi=mid-1; else lo=mid+1; } else { if(nums[mid]<target && target<=nums[hi]) lo=mid+1; else hi=mid-1; } } return -1; }';
const BUGGY_QUEUE = `class MyQueue {
  constructor(){ this.in = []; this.out = []; }
  push(x) { this.in.push(x); }
  pop() { while (this.in.length) { this.out.push(this.in.pop()); } return this.out.pop(); }
  peek() { while (this.in.length) { this.out.push(this.in.pop()); } return this.out[this.out.length - 1]; }
  isEmpty() { return this.in.length === 0 && this.out.length === 0; }
}`;
const CORRECT_QUEUE = `class MyQueue {
  constructor(){ this.in = []; this.out = []; }
  push(x) { this.in.push(x); }
  pop() { if (this.out.length === 0) { while (this.in.length) { this.out.push(this.in.pop()); } } return this.out.pop(); }
  peek() { if (this.out.length === 0) { while (this.in.length) { this.out.push(this.in.pop()); } } return this.out[this.out.length - 1]; }
  isEmpty() { return this.in.length === 0 && this.out.length === 0; }
}`;
const CORRECT_BFS = `function bfsOrder(n, edges, start) {
  const adj = Array.from({length:n}, () => []);
  for (const [a,b] of edges) { adj[a].push(b); adj[b].push(a); }
  const visited = new Set([start]); const queue = [start]; const order = [];
  while (queue.length) { const node = queue.shift(); order.push(node); for (const nb of adj[node]) { if (!visited.has(nb)) { visited.add(nb); queue.push(nb); } } }
  return order;
}`;

async function main() {
  const db = createDb(':memory:');
  runMigrations(db);
  seed(db);
  db.prepare("INSERT INTO students (id, email, display_name, target_role, goal, prep_deadline, daily_target_minutes) VALUES ('demo_run', 'demo.run@example.com', 'Demo Student (ML Engineer track)', 'role_ml_engineer', 'ROLE_PREPARATION', '2026-12-01', 60)").run();

  const app = createServer(db, new NullProvider());
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const port = (server.address() as AddressInfo).port;
  const base = `http://localhost:${port}`;

  const loginRes = await fetch(`${base}/api/auth/demo-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studentId: 'demo_run' }) });
  const { token } = (await loginRes.json()) as { token: string };
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const steps: StepRecord[] = [];
  let stepNum = 0;

  async function submit(challengeId: string, language: 'javascript' | 'python', code: string, title: string, narrative: string) {
    stepNum++;
    const res = await fetch(`${base}/api/attempts`, { method: 'POST', headers: auth, body: JSON.stringify({ challengeId, language, code }) });
    const json = (await res.json()) as {
      evaluation: { passed: boolean; testsPassed: number; testsTotal: number };
      diagnosis: { mistakeCategory: string; languageIssue: boolean };
      updatedSkillStates: { skillId: string; masteryScore: number; masteryState: string; confidenceScore: number; trend: string; evidenceCount: number }[];
    };
    const skillNames = await resolveSkillNames(db, json.updatedSkillStates.map((s) => s.skillId));
    const record: StepRecord = {
      step: stepNum, title, action: `Submit ${language} solution to "${title}"`, challengeTitle: title, language,
      passed: json.evaluation.passed, testsPassed: json.evaluation.testsPassed, testsTotal: json.evaluation.testsTotal,
      mistakeCategory: json.diagnosis.mistakeCategory, languageIssue: json.diagnosis.languageIssue, narrative,
      skillStatesAfter: json.updatedSkillStates.map((s) => ({ skillName: skillNames.get(s.skillId) ?? s.skillId, masteryScore: s.masteryScore, masteryState: s.masteryState, confidenceScore: s.confidenceScore, trend: s.trend, evidenceCount: s.evidenceCount })),
    };
    steps.push(record);
    console.log(`\n[Step ${stepNum}] ${title} (${language}) -> ${json.evaluation.passed ? 'PASS' : 'FAIL'} (${json.evaluation.testsPassed}/${json.evaluation.testsTotal}) diagnosis=${json.diagnosis.mistakeCategory}`);
    for (const s of record.skillStatesAfter!) console.log(`    ${s.skillName}: score=${s.masteryScore} state=${s.masteryState} confidence=${s.confidenceScore} trend=${s.trend} evidence=${s.evidenceCount}`);
    return json;
  }

  async function fetchRecommendation(narrative: string) {
    stepNum++;
    const res = await fetch(`${base}/api/recommendations/next?force=true`, { headers: auth });
    const json = (await res.json()) as { challenge: { title: string }; gapType: string | null; interventionType: string; learningObjective: string; reason: string; rankingScore: number };
    const record: StepRecord = {
      step: stepNum, title: 'Recommendation generated', action: 'GET /api/recommendations/next', narrative,
      recommendation: { skillName: json.challenge.title, gapType: json.gapType, interventionType: json.interventionType, learningObjective: json.learningObjective, reason: json.reason, rankingScore: json.rankingScore },
    };
    steps.push(record);
    console.log(`\n[Step ${stepNum}] RECOMMENDATION -> "${json.challenge.title}" | gap=${json.gapType} | intervention=${json.interventionType}`);
    console.log(`    objective: ${json.learningObjective}`);
    console.log(`    reason: ${json.reason}`);
    return json;
  }

  console.log('='.repeat(78));
  console.log('CodeForge Adaptive Engine — live demonstration run');
  console.log('Student: Demo Student, target role = ML Engineer, goal = ROLE_PREPARATION');
  console.log('='.repeat(78));

  await submit('challenge_word_frequency', 'python', BUGGY_PYTHON, 'Word Frequency Counter',
    'First Python submission has a syntax error. This should be diagnosed as a LANGUAGE issue, not an algorithmic one.');
  await submit('challenge_word_frequency', 'python', CORRECT_PYTHON, 'Word Frequency Counter',
    'Corrected submission. Real independent evidence is now recorded for Python Collections.');
  await submit('challenge_binary_search', 'javascript', CORRECT_BINARY_SEARCH, 'Binary Search',
    'Standard binary search, submitted correctly on the first try.');
  await submit('challenge_search_rotated', 'javascript', UNMODIFIED_BINARY_SEARCH_ON_ROTATED, 'Search in Rotated Sorted Array',
    'The exact same (unmodified) binary search is applied to a rotated array — the classic transfer failure: strong on the standard form, but the technique was not adapted to the new context.');
  await fetchRecommendation('The engine now has both a real TRANSFER_GAP signal (Searching: standard vs. novel) and an unattempted-skill signal to weigh — the recommendation below reflects whichever the engine\'s real ranking judged higher-priority.');
  await submit('challenge_queue_via_stacks', 'javascript', BUGGY_QUEUE, 'Implement Queue Using Two Stacks',
    'A genuine state-management bug: passes a straightforward push/pop sequence but breaks once pushes and pops are interleaved, because it re-transfers stack contents on every pop instead of only when the output stack is empty.');
  const rec1 = await fetchRecommendation('With a real STATE_MANAGEMENT_ERROR pattern now on record for Queues, the engine should propose a debugging-flavored, targeted next step.');
  await submit('challenge_queue_via_stacks', 'javascript', CORRECT_QUEUE, 'Implement Queue Using Two Stacks',
    'Corrected implementation (only transfers when the output stack is empty). This is a genuine retry after real, specific feedback — not a fresh random problem.');
  await fetchRecommendation('Queues evidence has now genuinely improved. Checking whether Graph Algorithms (which lists Queues as a prerequisite) is judged ready.');
  await submit('challenge_bfs_order', 'javascript', CORRECT_BFS, 'BFS Traversal Order',
    'First-ever attempt at Graph Algorithms (previously UNKNOWN). A real, correct BFS implementation, closing the loop: the prerequisite work on Queues is now paying off on the dependent skill.');

  const dashboardRes = await fetch(`${base}/api/dashboard`, { headers: auth });
  const dashboard = await dashboardRes.json();

  const historyRes = await fetch(`${base}/api/recommendations/history`, { headers: auth });
  const history = (await historyRes.json()) as { recommendations: { learningObjective: string; reason: string; interventionType: string; gapType: string | null; status: string; createdAt: string }[] };

  const skillCount = (db.prepare('SELECT COUNT(*) as c FROM skills').get() as { c: number }).c;
  const relCount = (db.prepare('SELECT COUNT(*) as c FROM skill_relationships').get() as { c: number }).c;
  const challengeCount = (db.prepare('SELECT COUNT(*) as c FROM challenges').get() as { c: number }).c;
  const attemptCount = (db.prepare('SELECT COUNT(*) as c FROM attempts WHERE student_id = ?').get('demo_run') as { c: number }).c;
  const evidenceCount = (db.prepare('SELECT COUNT(*) as c FROM evidence WHERE student_id = ?').get('demo_run') as { c: number }).c;

  const output = {
    generatedAt: new Date().toISOString(),
    student: { displayName: 'Demo Student', targetRole: 'ML Engineer', goal: 'ROLE_PREPARATION' },
    steps,
    finalDashboard: dashboard,
    recommendationHistory: history.recommendations,
    stats: { skillCount, relationshipCount: relCount, challengeCount, attemptCount, evidenceCount },
  };

  await writeFile(new URL('../dashboard-data.json', import.meta.url), JSON.stringify(output, null, 2));
  console.log('\n' + '='.repeat(78));
  console.log(`Demo complete. ${attemptCount} real attempts submitted, ${evidenceCount} evidence rows recorded.`);
  console.log('Captured output written to dashboard-data.json');
  console.log('='.repeat(78));

  server.close();
}

async function resolveSkillNames(db: ReturnType<typeof createDb>, skillIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const id of skillIds) {
    const row = db.prepare('SELECT name FROM skills WHERE id = ?').get(id) as { name: string } | undefined;
    if (row) map.set(id, row.name);
  }
  return map;
}

main().catch((err) => {
  console.error('DEMO SCRIPT FAILED:', err);
  process.exit(1);
});
