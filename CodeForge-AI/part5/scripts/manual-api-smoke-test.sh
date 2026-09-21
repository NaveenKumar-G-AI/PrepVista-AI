#!/usr/bin/env bash
set -e
cd /home/claude/codeforge-adaptive-engine
rm -f data/codeforge.db
node --experimental-sqlite --import tsx scripts/seed.ts > /tmp/seed.log 2>&1

PORT=3737 node --experimental-sqlite --import tsx src/api/index.ts > /tmp/server.log 2>&1 &
SERVER_PID=$!
sleep 2

echo "=== health ==="
curl -s http://localhost:3737/health
echo

echo "=== login ==="
LOGIN_JSON=$(curl -s -X POST http://localhost:3737/api/auth/demo-login -H "Content-Type: application/json" -d '{"studentId":"student_demo_1"}')
TOKEN=$(echo "$LOGIN_JSON" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).token))")
echo "token acquired, length: ${#TOKEN}"

echo "=== login as second student (for cross-access security test later) ==="
LOGIN_JSON_2=$(curl -s -X POST http://localhost:3737/api/auth/demo-login -H "Content-Type: application/json" -d '{"studentId":"student_demo_2"}')
TOKEN_2=$(echo "$LOGIN_JSON_2" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).token))")
echo "token 2 acquired, length: ${#TOKEN_2}"

echo "=== dashboard (fresh student, should show unknown skills, no crash) ==="
curl -s http://localhost:3737/api/dashboard -H "Authorization: Bearer $TOKEN" > /tmp/dash1.json
node -e "const j=require('/tmp/dash1.json'); console.log('unknownSkills:', j.unknownSkills.length, 'recommendation present:', !!j.recommendation, 'recommendation skill:', j.recommendation && j.recommendation.skillName, 'interventionType:', j.recommendation && j.recommendation.interventionType);"

echo "=== submit a WRONG attempt on two_sum ==="
curl -s -X POST http://localhost:3737/api/attempts -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{
  "challengeId": "challenge_two_sum", "language": "javascript",
  "code": "function twoSum(nums, target) { return [0,0]; }"
}' > /tmp/attempt1.json
node -e "const j=require('/tmp/attempt1.json'); console.log('passed:', j.evaluation.passed, 'testsPassed:', j.evaluation.testsPassed, '/', j.evaluation.testsTotal, 'diagnosis:', j.diagnosis.mistakeCategory, 'updatedStates skills:', j.updatedSkillStates.map(s=>s.skillId + '=' + s.masteryState));"

echo "=== submit a CORRECT attempt on two_sum ==="
curl -s -X POST http://localhost:3737/api/attempts -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{
  "challengeId": "challenge_two_sum", "language": "javascript",
  "code": "function twoSum(nums, target) { const m = new Map(); for (let i=0;i<nums.length;i++){ const need = target-nums[i]; if (m.has(need)) return [m.get(need), i]; m.set(nums[i], i);} return []; }"
}' > /tmp/attempt2.json
node -e "const j=require('/tmp/attempt2.json'); console.log('passed:', j.evaluation.passed, 'testsPassed:', j.evaluation.testsPassed, '/', j.evaluation.testsTotal, 'diagnosis:', j.diagnosis.mistakeCategory, 'updatedStates:', JSON.stringify(j.updatedSkillStates.map(s=>({skill:s.skillId, score:s.masteryScore, state:s.masteryState, evidence:s.evidenceCount}))));"

echo "=== idempotency: replay attempt2 with same clientAttemptId ==="
curl -s -X POST http://localhost:3737/api/attempts -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{
  "challengeId": "challenge_two_sum", "language": "javascript", "clientAttemptId": "idem-test-1",
  "code": "function twoSum(nums, target) { return [0,1]; }"
}' > /tmp/attempt3a.json
curl -s -X POST http://localhost:3737/api/attempts -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{
  "challengeId": "challenge_two_sum", "language": "javascript", "clientAttemptId": "idem-test-1",
  "code": "function twoSum(nums, target) { return [999,999]; }"
}' > /tmp/attempt3b.json
node -e "
const a=require('/tmp/attempt3a.json'), b=require('/tmp/attempt3b.json');
console.log('first call idempotentReplay:', a.idempotentReplay, 'attemptId:', a.attemptId);
console.log('second call idempotentReplay:', b.idempotentReplay, 'attemptId:', b.attemptId, 'same attemptId:', a.attemptId===b.attemptId);
"

echo "=== hidden test protection: check attempt response never includes hidden test input/expected ==="
node -e "
const j=require('/tmp/attempt2.json');
const hasHiddenDetail = j.evaluation.results.some(r => r.category === undefined || (r.actual !== undefined && r.testCaseId==='ts_basic3'));
console.log('raw result sample:', JSON.stringify(j.evaluation.results.find(r=>r.testCaseId==='ts_basic3')));
"

echo "=== SECURITY: student 2 tries to read student 1's history via a skillId student 1 has evidence for ==="
curl -s http://localhost:3737/api/history/skill_arrays -H "Authorization: Bearer $TOKEN_2" > /tmp/history_student2.json
node -e "const j=require('/tmp/history_student2.json'); console.log('student2 timeline length for skill_arrays (should be 0, they have no evidence, NOT student1 data):', j.timeline.length);"

echo "=== SECURITY: no Authorization header ==="
curl -s -o /tmp/noauth.json -w "%{http_code}" http://localhost:3737/api/dashboard
echo " <- expect 401"

echo "=== practice options: CHOOSE_SKILL ==="
curl -s "http://localhost:3737/api/practice/options?mode=CHOOSE_SKILL&skillId=skill_stacks" -H "Authorization: Bearer $TOKEN" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d); console.log('options:', j.options.map(o=>o.title));})"

echo "=== challenge detail never exposes hidden tests or expected values ==="
curl -s http://localhost:3737/api/challenges/challenge_two_sum -H "Authorization: Bearer $TOKEN" | node -e "
let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
  const j=JSON.parse(d);
  console.log('sampleTests count (should exclude 1 hidden of 4):', j.sampleTests.length);
  console.log('any expected field present (should be false):', j.sampleTests.some(t=>'expected' in t));
});"

kill $SERVER_PID 2>/dev/null
echo "=== DONE ==="
