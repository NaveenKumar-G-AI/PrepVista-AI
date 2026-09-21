import 'dotenv/config';
import { appPool, makeSuperPool } from '../db/pool.js';
import { DifficultyCalibrationService } from '../services/difficulty-calibration.service.js';
import { InitialDifficultyAiAdapter } from '../ai/initial-difficulty-ai.adapter.js';

/**
 * §97-98: asynchronous calibration via a job queue. This reference
 * implementation ships the simplest thing that is honestly async — a
 * polling worker over difficulty_calibration_runs — rather than bundling a
 * Redis/BullMQ/RabbitMQ dependency that the real ACEAPT queue (§98: "reuse
 * existing — Celery, RabbitMQ, background workers — do not create duplicate
 * infrastructure") should replace this with. To integrate for real: point
 * whatever job runner ACEAPT already uses at
 * `DifficultyCalibrationService.calibrateQuestionVersion`, and delete this
 * file.
 *
 * enqueueCalibration() below is the actual integration seam other features
 * would call (e.g. "a new question version was published -> enqueue its
 * first calibration"); this file's poll loop is just this reference
 * implementation's stand-in consumer.
 */

const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 5000);

export async function enqueueCalibration(
  tenantId: string,
  questionVersionId: string,
  opts: { populationId?: string; triggeredBy?: string } = {}
): Promise<string> {
  const superPool = makeSuperPool();
  try {
    const { rows } = await superPool.query<{ id: string }>(
      `INSERT INTO difficulty_calibration_runs
        (tenant_id, scope, question_version_id, population_id, method, status, triggered_by)
       VALUES ($1,'SINGLE_QUESTION',$2,$3,'P0_FACILITY','QUEUED',$4)
       RETURNING id`,
      [tenantId, questionVersionId, opts.populationId ?? 'default', opts.triggeredBy ?? 'enqueue']
    );
    return rows[0]!.id;
  } finally {
    await superPool.end();
  }
}

async function pollOnce(service: DifficultyCalibrationService): Promise<number> {
  const superPool = makeSuperPool();
  let processed = 0;
  try {
    // Claim one QUEUED run at a time with SKIP LOCKED so multiple worker
    // instances can run concurrently without double-processing the same row.
    const { rows } = await superPool.query<{
      id: string;
      tenant_id: string;
      question_version_id: string;
      population_id: string;
    }>(
      `UPDATE difficulty_calibration_runs
       SET status = 'RUNNING', started_at = now()
       WHERE id = (
         SELECT id FROM difficulty_calibration_runs
         WHERE status = 'QUEUED' AND scope = 'SINGLE_QUESTION'
         ORDER BY created_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       RETURNING id, tenant_id, question_version_id, population_id`
    );
    const claimed = rows[0];
    if (!claimed || !claimed.question_version_id) return 0;

    // calibrateQuestionVersion creates its OWN run row internally, so this
    // queued row is only a dispatch ticket — mark it done immediately after
    // handing off, and let the real run row (created inside
    // calibrateQuestionVersion) carry the actual result/error.
    try {
      await service.calibrateQuestionVersion(claimed.tenant_id, claimed.question_version_id, {
        populationId: claimed.population_id,
        triggeredBy: 'worker',
      });
      await superPool.query(
        `UPDATE difficulty_calibration_runs SET status = 'SUCCEEDED', completed_at = now() WHERE id = $1`,
        [claimed.id]
      );
    } catch (err) {
      await superPool.query(
        `UPDATE difficulty_calibration_runs SET status = 'FAILED', completed_at = now(), error = $2 WHERE id = $1`,
        [claimed.id, err instanceof Error ? err.message : String(err)]
      );
    }
    processed = 1;
  } finally {
    await superPool.end();
  }
  return processed;
}

async function main() {
  const service = new DifficultyCalibrationService(appPool, new InitialDifficultyAiAdapter(), true);
  // eslint-disable-next-line no-console
  console.log(`Difficulty calibration worker started (polling every ${POLL_INTERVAL_MS}ms)`);
  for (;;) {
    try {
      const processed = await pollOnce(service);
      if (processed === 0) await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Worker poll failed:', err);
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
}

if (process.env.VITEST !== 'true') {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
