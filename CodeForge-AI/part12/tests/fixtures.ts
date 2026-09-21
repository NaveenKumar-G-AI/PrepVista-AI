import { randomUUID } from 'node:crypto';
import type { CreateSubmissionAtomicParams, FinalizeEvaluationParams } from '../src/repository/submissionRepository.js';
import { computeFileHashes, computeSourceFingerprint } from '../src/services/hashing.js';
import type { SubmissionFileInput } from '../src/domain/types.js';

export const FIXTURE_EXECUTION_CONFIG = {
  cpuTimeLimitMs: 2000,
  wallTimeLimitMs: 4000,
  memoryLimitKb: 131072,
  outputLimitBytes: 65536,
  processLimit: 16,
  networkAllowed: false,
};

export function makeFiles(content = 'print(1)'): SubmissionFileInput[] {
  return [{ filename: 'main.py', path: 'main.py', content, role: 'MAIN', ordinal: 0 }];
}

export function makeCreateParams(overrides: Partial<CreateSubmissionAtomicParams> = {}): CreateSubmissionAtomicParams {
  const rawFiles = makeFiles();
  const files = overrides.files ?? computeFileHashes(rawFiles);

  return {
    userId: overrides.userId ?? randomUUID(),
    attemptId: overrides.attemptId ?? randomUUID(),
    problemId: overrides.problemId ?? randomUUID(),
    assessmentId: overrides.assessmentId ?? null,
    mode: overrides.mode ?? 'PRACTICE',
    problemVersionId: overrides.problemVersionId ?? randomUUID(),
    testSuiteVersionId: overrides.testSuiteVersionId ?? randomUUID(),
    checkerVersionId: overrides.checkerVersionId ?? randomUUID(),
    executionConfigSnapshot: overrides.executionConfigSnapshot ?? FIXTURE_EXECUTION_CONFIG,
    language: overrides.language ?? 'python',
    languageVersion: overrides.languageVersion ?? '3.12',
    sourceFingerprint: overrides.sourceFingerprint ?? computeSourceFingerprint(rawFiles),
    totalSourceBytes: overrides.totalSourceBytes ?? rawFiles.reduce((n, f) => n + Buffer.byteLength(f.content, 'utf8'), 0),
    files: overrides.files ?? files,
    idempotencyKey: overrides.idempotencyKey ?? randomUUID(),
    requestFingerprint: overrides.requestFingerprint ?? 'fixture-request-fingerprint',
    maxSubmissionsPerAttempt: overrides.maxSubmissionsPerAttempt ?? null,
  };
}

export function makeAcceptedFinalizeParams(overrides: Partial<FinalizeEvaluationParams> = {}): FinalizeEvaluationParams {
  return {
    jobId: overrides.jobId ?? randomUUID(),
    workerId: overrides.workerId ?? 'worker-fixture',
    compilationStatus: overrides.compilationStatus ?? 'SUCCESS',
    compilationOutput: overrides.compilationOutput ?? null,
    publicResult: overrides.publicResult ?? { totalTests: 3, passed: 3, failed: 0, cases: [] },
    hiddenResult: overrides.hiddenResult ?? { totalGroups: 5, passedGroups: 5, totalWeight: 100, earnedWeight: 100 },
    resourceUsage: overrides.resourceUsage ?? { cpuMs: 120, memoryKb: 8192, wallMs: 150, outputBytes: 32 },
    verdict: overrides.verdict ?? 'ACCEPTED',
    score: overrides.score ?? 100,
    terminationReason: overrides.terminationReason ?? null,
  };
}
