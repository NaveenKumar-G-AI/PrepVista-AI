// Run on the dedicated Linux runner host after building/loading a reviewed
// digest-pinned image. This smoke check never enables application feature flags.
import { executeContainer } from './container.mjs';
import { randomUUID, createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const image = process.env.RUNNER_IMAGE;
if (process.platform !== 'linux' || !image) throw new Error('Dedicated Linux runner and explicit RUNNER_IMAGE required');
const cases = [
  ['correct-result', 'function check(x){return x+1}', [2], 3, 'PASSED'],
  ['wrong-result', 'function check(){return 0}', [], 1, 'WRONG_ANSWER'],
  ['no-host-bindings', 'function check(){return [typeof process,typeof require,typeof fetch,typeof document]}', [], Array(4).fill('undefined'), 'PASSED'],
  ['loop-deadline', 'function check(){while(true){}}', [], 0, 'TIME_LIMIT'],
  ['output-limit', 'function check(){return "x".repeat(70000)}', [], '', 'OUTPUT_LIMIT'],
  ['serializer-integrity', 'JSON.stringify=()=>"1";function check(){return 0}', [], 1, 'WRONG_ANSWER'],
];
for (const [name, code, args, expected, status] of cases) {
  const result = await executeContainer({ job_id: randomUUID(), code, entry: 'check', tests: [{ id: 'case-0', args, expected }] }, image);
  assert.equal(result.checks[0].status, status);
  process.stdout.write(JSON.stringify({ check: name, passed: true }) + '\n');
}
process.stdout.write(JSON.stringify({ image, smoke_checks_passed: cases.length,
  fixture_manifest_sha256: createHash('sha256').update(JSON.stringify(cases)).digest('hex'),
  release_authorized: false, note: 'Host hardening, secret separation, authenticated ingress, load, cleanup and restore review remain required.' }) + '\n');
