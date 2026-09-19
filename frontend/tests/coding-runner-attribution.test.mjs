import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { runnerAttribution } from '../scripts/coding-runner-attribution.mjs';

async function fixture(t, { missingLicense = false, version = '1.0.0' } = {}) {
  const temporaryRoot = await realpath(tmpdir());
  const root = await mkdtemp(join(temporaryRoot, 'prepvista-runner-notices-'));
  t.after(async () => {
    const target = await realpath(root);
    if (target !== root || dirname(target) !== temporaryRoot || !basename(target).startsWith('prepvista-runner-notices-')) throw new Error('Unexpected test cleanup target');
    await rm(target, { recursive: true, force: true });
  });
  const directory = join(root, 'node_modules', '@fixture', 'runtime');
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'package.json'), JSON.stringify({ name: '@fixture/runtime', version, license: 'MIT' }));
  if (!missingLicense) await writeFile(join(directory, 'LICENSE'), 'Fixture copyright\nFixture permission text\n');
  await writeFile(join(directory, 'NOTICE.txt'), 'Additional fixture attribution\n');
  await writeFile(join(root, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: {
    'node_modules/@fixture/runtime': { version: '1.0.0', integrity: 'sha512-fixture-record' },
  } }));
  return { root, directory };
}

test('runner attribution preserves installed notices and binds the output bytes', async t => {
  const { root } = await fixture(t);
  const first = await runnerAttribution(root, ['src/worker.ts', 'node_modules/@fixture/runtime/dist/index.js', 'node_modules/@fixture/runtime/dist/other.js'], Buffer.from('worker-a'));
  assert.equal(first.manifest.packages.length, 1);
  assert.equal(first.manifest.packages[0].version, '1.0.0');
  assert.equal(first.manifest.packages[0].license_files.length, 2);
  assert.ok(first.notices.includes('Fixture copyright\nFixture permission text\n'));
  assert.ok(first.notices.includes('Additional fixture attribution\n'));
  assert.equal(first.manifest.bundle_sha256, createHash('sha256').update('worker-a').digest('hex'));
  assert.equal(first.manifest.notices_sha256, createHash('sha256').update(first.notices).digest('hex'));
  assert.ok(!JSON.stringify(first).includes(root));
  const second = await runnerAttribution(root, ['node_modules/@fixture/runtime/dist/index.js'], Buffer.from('worker-b'));
  assert.notEqual(first.manifest.bundle_sha256, second.manifest.bundle_sha256);
  assert.equal(first.manifest.notices_sha256, second.manifest.notices_sha256);
});

test('runner attribution rejects version drift, missing notices and escaped inputs', async t => {
  const changed = await fixture(t, { version: '2.0.0' });
  const input = ['node_modules/@fixture/runtime/dist/index.js'];
  await assert.rejects(runnerAttribution(changed.root, input, Buffer.from('worker')), /locked version/);
  const missing = await fixture(t, { missingLicense: true });
  await rm(join(missing.directory, 'NOTICE.txt'));
  await assert.rejects(runnerAttribution(missing.root, input, Buffer.from('worker')), /files are missing/);
  await assert.rejects(runnerAttribution(missing.root, [resolve(missing.root, '..', 'outside.js')], Buffer.from('worker')), /outside/);
  await assert.rejects(runnerAttribution(missing.root, ['src/worker.ts'], Buffer.from('worker')), /inventory is empty/);
});
