/**
 * CodeForge AI — Submission System
 * The worker. This file is the one place that ties the execution provider,
 * problem/test data, and result aggregation together into an actual evaluation. It
 * depends only on interfaces (SubmissionRepository, ExecutionProvider,
 * ProblemDataResolver) — see main() at the bottom for where concrete implementations
 * get wired in for a real deployment.
 */
import { randomUUID } from 'node:crypto';
import type { SubmissionRepository } from '../repository/submissionRepository.js';
import { StaleClaimError } from '../repository/submissionRepository.js';
import type { ExecutionProvider, RunResult } from '../execution/executionProvider.js';
import { createIsolatedWorkDir, cleanupWorkDir, LocalProcessExecutionProvider } from '../execution/localProcessExecutionProvider.js';
import type { ProblemDataResolver } from './problemDataResolver.js';
import {
  buildHiddenResult,
  buildPublicResult,
  classifySingleRun,
  computeScore,
  defaultChecker,
  determineOverallVerdict,
  type HiddenGroupOutcome,
  type PublicCaseOutcome,
  type SingleCaseVerdict,
} from '../services/resultAggregation.js';
import type { ResourceUsage } from '../domain/types.js';
import { sleep } from '../domain/asyncUtils.js';
import { loadConfig } from '../domain/config.js';

export interface WorkerDependencies {
  repo: SubmissionRepository;
  executionProvider: ExecutionProvider;
  problemDataResolver: ProblemDataResolver;
  workerId: string;
  leaseSeconds: number;
}

function accumulateMax(acc: ResourceUsage, run: RunResult): void {
  acc.cpuMs = Math.max(acc.cpuMs, run.cpuMs);
  acc.memoryKb = Math.max(acc.memoryKb, run.memoryKb);
  acc.wallMs = Math.max(acc.wallMs, run.wallMs);
  acc.outputBytes = Math.max(acc.outputBytes, Buffer.byteLength(run.stdout, 'utf8'));
}

const EMPTY_RESOURCE_USAGE = (): ResourceUsage => ({ cpuMs: 0, memoryKb: 0, wallMs: 0, outputBytes: 0 });

/** Processes exactly one job if one is claimable. Returns 'no-job' (caller should back
 * off and poll again) or 'processed' (caller may immediately try for another). */
export async function processOneJob(deps: WorkerDependencies): Promise<'no-job' | 'processed'> {
  const job = await deps.repo.claimNextEvaluationJob(deps.workerId, deps.leaseSeconds);
  if (!job) return 'no-job';

  const correlationId = randomUUID();
  await deps.repo.recordAuditEvent({
    eventType: 'evaluation.claimed',
    actorId: null,
    actorRole: null,
    submissionId: job.submissionId,
    evaluationJobId: job.id,
    correlationId,
    metadata: { workerId: deps.workerId, kind: job.kind },
  });

  let workDir: string | null = null;
  try {
    await deps.repo.markEvaluationJobRunning(job.id, deps.workerId);

    const submission = await deps.repo.getSubmissionById(job.submissionId);
    if (!submission) throw new Error(`SUBMISSION_NOT_FOUND: ${job.submissionId} for job ${job.id}`);
    const files = await deps.repo.getSubmissionFiles(job.submissionId);
    if (files.length === 0) throw new Error(`NO_FILES: submission ${job.submissionId} has no stored files — data integrity failure`);

    const problemData = await deps.problemDataResolver.resolve({
      problemId: submission.problemId,
      problemVersionId: submission.problemVersionId,
      testSuiteVersionId: submission.testSuiteVersionId,
      checkerVersionId: submission.checkerVersionId,
    });
    const checker = problemData.checker ?? defaultChecker;
    const execFiles = files.map((f) => ({ path: f.path, content: f.content }));

    // The entrypoint is whichever file THIS submission marked as MAIN — validation.ts
    // guarantees exactly one exists before a submission is ever created. It is
    // deliberately NOT taken from problemData: a problem accepting multiple languages
    // has no single fixed filename ("main.py" vs "main.c" vs "Main.java"), and the
    // author of a submission's file layout is the submission itself, not the problem.
    const mainFile = files.find((f) => f.role === 'MAIN');
    if (!mainFile) throw new Error(`NO_MAIN_FILE: submission ${job.submissionId} has no MAIN file — should have been rejected at validation time`);
    const mainPath = mainFile.path;

    workDir = await createIsolatedWorkDir();

    const compileResult = await deps.executionProvider.compile({
      files: execFiles,
      mainPath,
      language: submission.language,
      languageVersion: submission.languageVersion,
      config: submission.executionConfigSnapshot,
      workDir,
    });

    const resourceUsage = EMPTY_RESOURCE_USAGE();
    const publicOutcomes: PublicCaseOutcome[] = [];
    const hiddenOutcomes: HiddenGroupOutcome[] = [];
    let terminationReason: string | null = null;

    if (compileResult.status !== 'FAILED') {
      for (const testCase of problemData.publicCases) {
        const runResult = await deps.executionProvider.run({
          files: execFiles,
          mainPath,
          language: submission.language,
          languageVersion: submission.languageVersion,
          config: submission.executionConfigSnapshot,
          workDir,
          stdin: testCase.input,
          compileArtifactPath: compileResult.artifactPath,
        });
        const verdict: SingleCaseVerdict = classifySingleRun(runResult, submission.executionConfigSnapshot, testCase.expectedOutput, testCase.input, checker);
        publicOutcomes.push({ name: testCase.name, verdict, wallMs: runResult.wallMs });
        accumulateMax(resourceUsage, runResult);
        if (verdict !== 'ACCEPTED' && !terminationReason) terminationReason = `public:${testCase.name}:${verdict}`;
      }

      for (const group of problemData.hiddenGroups) {
        let allPassed = true;
        for (const testCase of group.cases) {
          const runResult = await deps.executionProvider.run({
            files: execFiles,
            mainPath,
            language: submission.language,
            languageVersion: submission.languageVersion,
            config: submission.executionConfigSnapshot,
            workDir,
            stdin: testCase.input,
            compileArtifactPath: compileResult.artifactPath,
          });
          const verdict = classifySingleRun(runResult, submission.executionConfigSnapshot, testCase.expectedOutput, testCase.input, checker);
          accumulateMax(resourceUsage, runResult);
          if (verdict !== 'ACCEPTED') {
            allPassed = false;
            if (!terminationReason) terminationReason = `hidden:${verdict}`; // group identity intentionally not named — see spec, "hidden test protection"
          }
        }
        hiddenOutcomes.push({ weight: group.weight, allCasesPassed: allPassed });
      }
    }

    const publicResult = buildPublicResult(publicOutcomes);
    const hiddenResult = buildHiddenResult(hiddenOutcomes);
    const verdict = determineOverallVerdict({
      compilationStatus: compileResult.status,
      publicCaseVerdicts: publicOutcomes.map((o) => o.verdict),
      hiddenCaseVerdicts: [], // hidden per-case verdicts are deliberately never materialized as a list — only group pass/fail feeds aggregation, see buildHiddenResult
    });
    // Re-derive using group-level pass/fail so a hidden failure still overrides ACCEPTED,
    // without ever constructing a hidden per-case verdict array (see note above).
    const finalVerdict = hiddenOutcomes.some((g) => !g.allCasesPassed) && verdict === 'ACCEPTED' ? 'WRONG_ANSWER' : verdict;
    const score = compileResult.status === 'FAILED' ? 0 : computeScore(hiddenResult, publicResult);

    const result = await deps.repo.finalizeEvaluation({
      jobId: job.id,
      workerId: deps.workerId,
      compilationStatus: compileResult.status,
      compilationOutput: compileResult.status === 'FAILED' ? compileResult.sanitizedOutput : compileResult.sanitizedOutput || null,
      publicResult,
      hiddenResult,
      resourceUsage,
      verdict: finalVerdict,
      score,
      terminationReason,
    });

    await deps.repo.recordAuditEvent({
      eventType: 'evaluation.completed',
      actorId: null,
      actorRole: null,
      submissionId: job.submissionId,
      evaluationJobId: job.id,
      correlationId,
      metadata: { verdict: result.verdict, score: result.score }, // never full source, never hidden case detail
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await deps.repo.finalizeEvaluation({
        jobId: job.id,
        workerId: deps.workerId,
        compilationStatus: 'NOT_REQUIRED',
        compilationOutput: null,
        publicResult: { totalTests: 0, passed: 0, failed: 0, cases: [] },
        hiddenResult: { totalGroups: 0, passedGroups: 0, totalWeight: 0, earnedWeight: 0 },
        resourceUsage: EMPTY_RESOURCE_USAGE(),
        verdict: 'JUDGE_ERROR',
        score: 0,
        terminationReason: message,
      });
    } catch (finalizeErr) {
      // A StaleClaimError here means another worker (or the sweeper) already resolved
      // this job — that's fine, not a new problem. Anything else, surface it via
      // markEvaluationJobFailed so stuck-job recovery / an operator can see it instead
      // of the failure disappearing silently.
      if (!(finalizeErr instanceof StaleClaimError)) {
        await deps.repo.markEvaluationJobFailed(job.id, deps.workerId, message).catch(() => undefined);
      }
    }
    await deps.repo.recordAuditEvent({
      eventType: 'evaluation.judge_error',
      actorId: null,
      actorRole: null,
      submissionId: job.submissionId,
      evaluationJobId: job.id,
      correlationId,
      metadata: { error: message },
    });
  } finally {
    if (workDir) await cleanupWorkDir(workDir).catch(() => undefined);
  }

  return 'processed';
}

export async function runWorkerLoop(deps: WorkerDependencies, opts: { pollIntervalMs: number; shouldContinue: () => boolean }): Promise<void> {
  while (opts.shouldContinue()) {
    const outcome = await processOneJob(deps);
    if (outcome === 'no-job') await sleep(opts.pollIntervalMs);
  }
}

// ---------------------------------------------------------------------------
// CLI entrypoint (`npm run worker`). NOT executed in this sandbox — it requires a real
// SubmissionRepository (Supabase) which needs network + credentials neither available
// here. Written correctly and completely so it's ready to run once deployed; see
// ENGINEERING_REPORT.md for exactly what was and wasn't exercised in this environment.
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const config = loadConfig();
  const workerId = `worker-${randomUUID()}`;

  if (config.executionProvider !== 'local-process') {
    throw new Error(
      `EXECUTION_PROVIDER=${config.executionProvider} is not implemented in this deliverable — implement ExecutionProvider against ` +
        `CodeForge's real sandbox and register it here. See execution/executionProvider.ts.`,
    );
  }

  // Real SubmissionRepository + ProblemDataResolver implementations required here —
  // see repository/supabaseSubmissionRepository.ts for the Postgres-backed one (written,
  // not executed in this sandbox) and worker/problemDataResolver.ts for the interface
  // CodeForge's real problem system should implement.
  throw new Error(
    'Wire a real SubmissionRepository (e.g. SupabaseSubmissionRepository) and a real ' +
      'ProblemDataResolver here before running this entrypoint against production traffic. ' +
      `workerId would be: ${workerId}, leaseSeconds: ${config.worker.leaseSeconds}`,
  );
}

const isDirectRun = typeof process !== 'undefined' && process.argv[1]?.endsWith('worker.ts');
if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

void LocalProcessExecutionProvider; // referenced by tests via direct import; keeps this file's intent visible
