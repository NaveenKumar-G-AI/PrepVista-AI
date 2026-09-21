import { test, run, assert } from './testHarness.js';
import { LocalProcessExecutionProvider, createIsolatedWorkDir, cleanupWorkDir } from '../src/execution/localProcessExecutionProvider.js';
import type { ExecutionConfig } from '../src/domain/types.js';

const provider = new LocalProcessExecutionProvider();

const GENEROUS_CONFIG: ExecutionConfig = {
  cpuTimeLimitMs: 5000,
  wallTimeLimitMs: 5000,
  memoryLimitKb: 262144, // 256MB
  outputLimitBytes: 65536,
  processLimit: 32,
  networkAllowed: false,
};

async function withWorkDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await createIsolatedWorkDir();
  try {
    return await fn(dir);
  } finally {
    await cleanupWorkDir(dir);
  }
}

test('PYTHON ACCEPTED: reads stdin, computes correctly, real stdout is captured', async () => {
  await withWorkDir(async (workDir) => {
    const files = [{ path: 'main.py', content: 'a, b = map(int, input().split())\nprint(a + b)\n' }];
    const compileResult = await provider.compile({ files, mainPath: 'main.py', language: 'python', languageVersion: '3.12', config: GENEROUS_CONFIG, workDir });
    assert.equal(compileResult.status, 'NOT_REQUIRED');

    const runResult = await provider.run({ files, mainPath: 'main.py', language: 'python', languageVersion: '3.12', config: GENEROUS_CONFIG, workDir, stdin: '2 3\n' });
    assert.equal(runResult.exitCode, 0);
    assert.equal(runResult.stdout.trim(), '5');
    assert.equal(runResult.timedOut, false);
    assert.ok(runResult.wallMs >= 0);
    assert.ok(runResult.memoryKb > 0, 'real /proc-based memory reading must be positive for a real process');
  });
});

test('PYTHON RUNTIME_ERROR: an uncaught exception produces a non-zero exit and real stderr', async () => {
  await withWorkDir(async (workDir) => {
    const files = [{ path: 'main.py', content: 'print(1 / 0)\n' }];
    const runResult = await provider.run({ files, mainPath: 'main.py', language: 'python', languageVersion: '3.12', config: GENEROUS_CONFIG, workDir, stdin: '' });
    assert.notEqual(runResult.exitCode, 0);
    assert.match(runResult.stderr, /ZeroDivisionError/);
  });
});

test('C ACCEPTED: real gcc compile, then real execution with correct output', async () => {
  await withWorkDir(async (workDir) => {
    const src = `#include <stdio.h>\nint main(){int a,b; scanf("%d %d",&a,&b); printf("%d\\n", a+b); return 0;}\n`;
    const files = [{ path: 'main.c', content: src }];
    const compileResult = await provider.compile({ files, mainPath: 'main.c', language: 'c', languageVersion: 'gcc13', config: GENEROUS_CONFIG, workDir });
    assert.equal(compileResult.status, 'SUCCESS', `expected clean compile, got: ${compileResult.sanitizedOutput}`);
    assert.ok(compileResult.artifactPath);

    const runResult = await provider.run({
      files, mainPath: 'main.c', language: 'c', languageVersion: 'gcc13', config: GENEROUS_CONFIG, workDir, stdin: '10 32\n',
      compileArtifactPath: compileResult.artifactPath,
    });
    assert.equal(runResult.exitCode, 0);
    assert.equal(runResult.stdout.trim(), '42');
  });
});

test('C COMPILATION_ERROR: real gcc syntax error is caught and sanitized, never silently treated as success', async () => {
  await withWorkDir(async (workDir) => {
    const files = [{ path: 'main.c', content: `#include <stdio.h>\nint main() { printf("no closing brace"); \n` }];
    const compileResult = await provider.compile({ files, mainPath: 'main.c', language: 'c', languageVersion: 'gcc13', config: GENEROUS_CONFIG, workDir });
    assert.equal(compileResult.status, 'FAILED');
    assert.ok(compileResult.sanitizedOutput.length > 0, 'real compiler diagnostic text must be present');
    assert.equal(compileResult.artifactPath, undefined, 'no artifact from a failed compile');
  });
});

test('C++ ACCEPTED: real g++ compile and execution', async () => {
  await withWorkDir(async (workDir) => {
    const src = `#include <iostream>\nusing namespace std;\nint main(){int a,b; cin>>a>>b; cout<<(a*b)<<endl; return 0;}\n`;
    const files = [{ path: 'main.cpp', content: src }];
    const compileResult = await provider.compile({ files, mainPath: 'main.cpp', language: 'cpp', languageVersion: 'g++13', config: GENEROUS_CONFIG, workDir });
    assert.equal(compileResult.status, 'SUCCESS', `expected clean compile, got: ${compileResult.sanitizedOutput}`);

    const runResult = await provider.run({
      files, mainPath: 'main.cpp', language: 'cpp', languageVersion: 'g++13', config: GENEROUS_CONFIG, workDir, stdin: '6 7\n',
      compileArtifactPath: compileResult.artifactPath,
    });
    assert.equal(runResult.exitCode, 0);
    assert.equal(runResult.stdout.trim(), '42');
  });
});

test('NODE ACCEPTED: real node execution', async () => {
  await withWorkDir(async (workDir) => {
    const files = [{ path: 'main.js', content: `const data = require('fs').readFileSync(0, 'utf8').trim().split(' ').map(Number);\nconsole.log(data[0] - data[1]);\n` }];
    const runResult = await provider.run({ files, mainPath: 'main.js', language: 'javascript', languageVersion: 'node22', config: GENEROUS_CONFIG, workDir, stdin: '10 4\n' });
    assert.equal(runResult.exitCode, 0);
    assert.equal(runResult.stdout.trim(), '6');
  });
});

test('TIME_LIMIT_EXCEEDED: an infinite loop is actually killed at the wall-clock limit, not left running', async () => {
  await withWorkDir(async (workDir) => {
    const files = [{ path: 'main.py', content: 'while True:\n    pass\n' }];
    const tightConfig: ExecutionConfig = { ...GENEROUS_CONFIG, wallTimeLimitMs: 400, cpuTimeLimitMs: 400 };
    const start = Date.now();
    const runResult = await provider.run({ files, mainPath: 'main.py', language: 'python', languageVersion: '3.12', config: tightConfig, workDir, stdin: '' });
    const elapsed = Date.now() - start;

    assert.equal(runResult.timedOut, true);
    assert.ok(elapsed < 3000, `must not hang far past the configured limit (took ${elapsed}ms)`);
    assert.ok(elapsed >= 350, 'must actually run for approximately the configured wall time, not return instantly');
  });
});

test('OUTPUT LIMIT: a program that floods stdout is killed and marked truncated, never buffered without bound', async () => {
  await withWorkDir(async (workDir) => {
    const files = [{ path: 'main.py', content: 'while True:\n    print("x" * 1000)\n' }];
    const tightOutputConfig: ExecutionConfig = { ...GENEROUS_CONFIG, outputLimitBytes: 4096, wallTimeLimitMs: 3000 };
    const runResult = await provider.run({ files, mainPath: 'main.py', language: 'python', languageVersion: '3.12', config: tightOutputConfig, workDir, stdin: '' });

    assert.equal(runResult.outputTruncated, true);
    assert.ok(Buffer.byteLength(runResult.stdout, 'utf8') < tightOutputConfig.outputLimitBytes + 8192, 'stdout must not grow far past the configured limit');
  });
});

test('MEMORY: a process that tries to out-allocate its ulimit is actually constrained by the kernel, not just reported as fine', async () => {
  await withWorkDir(async (workDir) => {
    // Deliberately does not catch MemoryError — mirrors a naive/malicious allocation attempt.
    const files = [{ path: 'main.py', content: 'data = []\nwhile True:\n    data.append("x" * 10_000_000)\n' }];
    const tightMemConfig: ExecutionConfig = { ...GENEROUS_CONFIG, memoryLimitKb: 65536, wallTimeLimitMs: 5000 }; // 64MB cap
    const runResult = await provider.run({ files, mainPath: 'main.py', language: 'python', languageVersion: '3.12', config: tightMemConfig, workDir, stdin: '' });

    assert.notEqual(runResult.exitCode, 0, 'an unbounded allocator must not exit cleanly once it hits the real ulimit -v ceiling');
    assert.ok(!runResult.timedOut, 'this should fail on memory, not time out — confirms the memory ceiling is what stopped it');
  });
});

test('path traversal in a file path is rejected even at the execution layer (defense in depth beyond validation.ts)', async () => {
  await withWorkDir(async (workDir) => {
    const files = [{ path: '../../etc/cf_should_not_write_here', content: 'x' }];
    await assert.rejects(provider.run({ files, mainPath: '../../etc/cf_should_not_write_here', language: 'python', languageVersion: '3.12', config: GENEROUS_CONFIG, workDir, stdin: '' }));
  });
});

await run('executionProvider.test.ts');
