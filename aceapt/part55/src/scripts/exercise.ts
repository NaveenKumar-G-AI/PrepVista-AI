import 'dotenv/config';
import pg from 'pg';
import { DifficultyCalibrationService } from '../services/difficulty-calibration.service.js';
import { InitialDifficultyAiAdapter } from '../ai/initial-difficulty-ai.adapter.js';
import { appPool } from '../db/pool.js';

async function main() {
  const superPool = new pg.Pool({
    host: process.env.PGHOST ?? '127.0.0.1',
    port: Number(process.env.PGPORT ?? 5432),
    database: process.env.PGDATABASE,
    user: process.env.PGSUPERUSER,
    password: process.env.PGSUPERUSER_PASSWORD,
  });
  const { rows } = await superPool.query<{ id: string; content_preview: string }>(
    `SELECT id, content_preview FROM question_versions ORDER BY created_at ASC`
  );
  const { rows: tenantRows } = await superPool.query<{ id: string }>(`SELECT id FROM tenants LIMIT 1`);
  const tenantId = tenantRows[0]!.id;
  await superPool.end();

  const aiAdapter = new InitialDifficultyAiAdapter();
  const service = new DifficultyCalibrationService(appPool, aiAdapter, true);

  for (const qv of rows) {
    try {
      const result = await service.calibrateQuestionVersion(tenantId, qv.id, {
        triggeredBy: 'manual_exercise',
        force: true,
      });
      console.log(
        `${qv.content_preview?.slice(0, 50).padEnd(50)} | ${JSON.stringify({
          skipped: result.skipped,
          skipReason: result.skipReason,
          status: result.status,
          category: result.category,
          n: result.sampleSize,
          anomalies: result.anomaliesDetected,
          drift: result.driftDetected,
        })}`
      );
    } catch (err) {
      console.error(`FAILED for ${qv.id} (${qv.content_preview}):`, err);
    }
  }

  await appPool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
