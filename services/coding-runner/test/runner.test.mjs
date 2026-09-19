import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { evaluate } from '../evaluate.mjs';
import { createGateway } from '../gateway.mjs';
import { containerArgs, verifyContainer } from '../container.mjs';

const image = 'registry.invalid/prepvista/runner@sha256:' + 'a'.repeat(64);
const token = 'local-test-token-'.repeat(4);
const input = (code = 'function solve(x) { return x * 2; }', args = [2], expected = 4) => ({
  schema_version: 1, job_id: randomUUID(), lease_token: randomUUID(), code_sha256: createHash('sha256').update(code).digest('hex'),
  suite_sha256: 'b'.repeat(64), runner_image: image, code, entry: 'solve', tests: [{ id: 'case-0', args, expected }],
});

test('actual WASM checks distinguish pass, wrong answer and isolated globals', async () => {
  assert.equal((await evaluate(input())).passed, 1);
  assert.equal((await evaluate(input('function solve() { return 0; }'))).checks[0].status, 'WRONG_ANSWER');
  const code = 'function solve(){return [typeof process,typeof require,typeof fetch,typeof document,typeof console,typeof WebAssembly]}';
  assert.equal((await evaluate(input(code, [], Array(6).fill('undefined')))).passed, 1);
});

test('guest serialization tampering, infinite loops and output abuse stay bounded', async () => {
  const changed = input('JSON.stringify = () => "4"; function solve() {return 0;}');
  assert.equal((await evaluate(changed)).checks[0].status, 'WRONG_ANSWER');
  assert.equal((await evaluate(input('function solve(){while(true){}}'))).checks[0].status, 'TIME_LIMIT');
  assert.equal((await evaluate(input('function solve(){return "a".repeat(70000)}'))).checks[0].status, 'OUTPUT_LIMIT');
  assert.equal((await evaluate(input('function solve(){const x=[];while(true)x.push(new Array(100000).fill(1));}'))).passed, 0);
});

test('per-test contexts prevent state from leaking between checks', async () => {
  const req = input('var count=0;function solve(){return ++count;}', [], 1);
  req.tests.push({ id: 'case-1', args: [], expected: 1 });
  assert.equal((await evaluate(req)).passed, 2);
});

test('container arguments require a digest, gVisor and no secrets or host access', () => {
  const args = containerArgs(image, 'pv-check-' + randomUUID());
  for (const flag of ['--runtime=runsc','--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--memory=128m','--pids-limit=32','--pull=never']) assert.ok(args.includes(flag));
  assert.equal(args.at(-1), image);
  assert.ok(!args.some(arg => arg.includes('--env') || arg.includes('--mount') || arg.includes('--privileged')));
  assert.throws(() => containerArgs('node:latest', 'pv-check-' + randomUUID()));
  assert.throws(() => containerArgs(image, 'unrelated-container'));
});

test('gateway authenticates, bounds concurrency and never forwards raw output', async t => {
  let runs = 0; let finish;
  const gate = createGateway({ token, image, concurrency: 1, execute: async () => {
    runs++; await new Promise(resolve => { finish = resolve; });
    return { passed: 1, checks: [{ id: 'case-0', status: 'PASSED', secret: 'private stdout' }], raw: 'private stdout' };
  } });
  await new Promise(resolve => gate.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => gate.close(resolve)));
  const url = `http://127.0.0.1:${gate.address().port}/v1/validate`;
  const send = (body, auth = token) => fetch(url, { method: 'POST', headers: { authorization: 'Bearer ' + auth, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await send(input(), 'wrong')).status, 401);
  assert.equal(runs, 0);
  assert.equal((await send({ ...input(), runner_image: 'wrong' })).status, 422);
  const pending = send(input());
  while (!finish) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal((await send(input())).status, 429);
  finish();
  const response = await pending;
  assert.equal(response.status, 200);
  assert.ok(!(await response.text()).includes('private stdout'));
  assert.equal(runs, 1);
});

test('a daemon that does not apply isolation controls cannot run a submission', () => {
  const inspected = { Config: { User: '65532:65532' }, Mounts: [], HostConfig: { Runtime: 'runsc',
    NetworkMode: 'none', ReadonlyRootfs: true, Privileged: false, Memory: 134217728, MemorySwap: 134217728,
    NanoCpus: 500000000, PidsLimit: 32, IpcMode: 'none', LogConfig: { Type: 'none' }, CapDrop: ['ALL'], SecurityOpt: ['no-new-privileges'] } };
  verifyContainer(inspected);
  for (const [key, value] of [['Runtime','runc'], ['NetworkMode','bridge'], ['Privileged',true], ['ReadonlyRootfs',false], ['Memory',0]]) {
    assert.throws(() => verifyContainer({ ...inspected, HostConfig: { ...inspected.HostConfig, [key]: value } }));
  }
  assert.throws(() => verifyContainer({ ...inspected, Mounts: [{ Source: '/var/run/docker.sock' }] }));
});
