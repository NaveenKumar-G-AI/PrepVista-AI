/**
 * CodeForge AI — Submission System
 * Runs on a schedule (cron, or the loop below) alongside the worker pool. Two jobs:
 *  1. Requeue jobs whose lease expired but still have retries left (recoverStuckEvaluationJobs
 *     already does this at the repository layer).
 *  2. For any job that came back DEAD_LETTER (retries exhausted), transition its
 *     submission to JUDGE_ERROR — this is the piece that actually satisfies "do not
 *     leave users permanently waiting": without it, a DEAD_LETTERed job is invisible to
 *     the student, who would just see QUEUED forever.
 */
import type { SubmissionRepository } from '../repository/submissionRepository.js';
import { InvalidStateError } from '../repository/submissionRepository.js';
import { sleep } from '../domain/asyncUtils.js';
import { loadConfig } from '../domain/config.js';

const IN_FLIGHT_STATUSES = ['QUEUED', 'COMPILING', 'RUNNING', 'EVALUATING'] as const;

export interface SweepResult {
  recovered: number;
  deadLettered: number;
  judgeErrorsSurfaced: number;
}

export async function sweepOnce(repo: SubmissionRepository, maxAgeSeconds: number): Promise<SweepResult> {
  const recovered = await repo.recoverStuckEvaluationJobs(maxAgeSeconds);
  let deadLettered = 0;
  let judgeErrorsSurfaced = 0;

  for (const item of recovered) {
    if (item.newStatus !== 'DEAD_LETTER') continue;
    deadLettered++;
    try {
      await repo.transitionSubmissionStatus(item.submissionId, [...IN_FLIGHT_STATUSES], 'JUDGE_ERROR', 'stuck-job-sweeper: retries exhausted');
      judgeErrorsSurfaced++;
    } catch (err) {
      // If the submission already moved on (e.g. a worker finished it in the tiny
      // window between the recovery query and this call), that's fine — it no longer
      // needs sweeping. Anything else, let it surface on the next sweep pass rather
      // than crash the whole sweep loop over one bad row.
      if (!(err instanceof InvalidStateError)) {
        console.error(`sweeper: failed to surface JUDGE_ERROR for submission ${item.submissionId}:`, err);
      }
    }
  }

  return { recovered: recovered.length, deadLettered, judgeErrorsSurfaced };
}

export async function runSweeperLoop(repo: SubmissionRepository, opts: { intervalMs: number; maxAgeSeconds: number; shouldContinue: () => boolean }): Promise<void> {
  while (opts.shouldContinue()) {
    await sweepOnce(repo, opts.maxAgeSeconds);
    await sleep(opts.intervalMs);
  }
}

// NOT executed in this sandbox — same reasons as worker.ts's main(): needs a real
// SubmissionRepository backed by Supabase, which needs network + credentials.
async function main(): Promise<void> {
  const config = loadConfig();
  throw new Error(
    `Wire a real SubmissionRepository here before running against production traffic. sweepIntervalMs: ${config.sweeper.intervalMs}, maxAgeSeconds: ${config.sweeper.maxAgeSeconds}`,
  );
}

const isDirectRun = typeof process !== 'undefined' && process.argv[1]?.endsWith('sweeper.ts');
if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
