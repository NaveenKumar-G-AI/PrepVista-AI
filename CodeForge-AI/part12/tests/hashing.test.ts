import { test, run, assert } from './testHarness.js';
import { sha256Hex, byteLength, computeSourceFingerprint, computeFileHashes } from '../src/services/hashing.js';
import type { SubmissionFileInput } from '../src/domain/types.js';

test('sha256Hex is deterministic and matches a known vector', () => {
  // echo -n "" | sha256sum
  assert.equal(sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('byteLength counts UTF-8 bytes, not JS string length', () => {
  assert.equal(byteLength('abc'), 3);
  assert.equal(byteLength('€'), 3); // multi-byte UTF-8 char
  assert.equal('€'.length, 1); // JS string length would under-count for size limits
});

test('computeSourceFingerprint is order-independent', () => {
  const a: SubmissionFileInput[] = [
    { filename: 'main.py', path: 'main.py', content: 'print(1)', role: 'MAIN', ordinal: 0 },
    { filename: 'util.py', path: 'util.py', content: 'def f(): pass', role: 'SUPPORTING', ordinal: 1 },
  ];
  const b: SubmissionFileInput[] = [a[1]!, a[0]!]; // reversed order
  assert.equal(computeSourceFingerprint(a), computeSourceFingerprint(b));
});

test('computeSourceFingerprint changes if any byte of any file changes', () => {
  const base: SubmissionFileInput[] = [{ filename: 'main.py', path: 'main.py', content: 'print(1)', role: 'MAIN', ordinal: 0 }];
  const changed: SubmissionFileInput[] = [{ filename: 'main.py', path: 'main.py', content: 'print(2)', role: 'MAIN', ordinal: 0 }];
  assert.notEqual(computeSourceFingerprint(base), computeSourceFingerprint(changed));
});

test('computeSourceFingerprint changes if role or ordinal changes even with identical content', () => {
  const asMain: SubmissionFileInput[] = [{ filename: 'a.py', path: 'a.py', content: 'x=1', role: 'MAIN', ordinal: 0 }];
  const asSupport: SubmissionFileInput[] = [{ filename: 'a.py', path: 'a.py', content: 'x=1', role: 'SUPPORTING', ordinal: 0 }];
  assert.notEqual(computeSourceFingerprint(asMain), computeSourceFingerprint(asSupport));
});

test('computeSourceFingerprint is stable for an empty file list', () => {
  assert.equal(computeSourceFingerprint([]), computeSourceFingerprint([]));
});

test('computeFileHashes attaches correct per-file size and hash', () => {
  const files: SubmissionFileInput[] = [{ filename: 'a.py', path: 'a.py', content: 'hello', role: 'MAIN', ordinal: 0 }];
  const [hashed] = computeFileHashes(files);
  assert.equal(hashed!.sizeBytes, 5);
  assert.equal(hashed!.sha256, sha256Hex('hello'));
});

await run('hashing.test.ts');
