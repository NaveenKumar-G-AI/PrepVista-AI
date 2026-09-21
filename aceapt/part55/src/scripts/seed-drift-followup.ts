import 'dotenv/config';
import pg from 'pg';

/** Inserts a recent batch of attempts on driftQV with a facility that has
 * genuinely shifted (~50% vs baseline ~80%), dated within the last 30 days,
 * then leaves it to the caller to re-run calibration and check for
 * DIFFICULTY_DRIFT. Kept as a separate script (rather than folded into
 * seed.ts) because it deliberately runs *after* the first calibration pass
 * establishes a CALIBRATED baseline snapshot to diff against — that's the
 * actual condition §60-62 describes, not just "some old and new rows exist."
 */

const pool = new pg.Pool({
  host: process.env.PGHOST ?? '127.0.0.1',
  port: Number(process.env.PGPORT ?? 5432),
  database: process.env.PGDATABASE,
  user: process.env.PGSUPERUSER ?? process.env.PGUSER ?? 'postgres',
  password: process.env.PGSUPERUSER_PASSWORD ?? process.env.PGPASSWORD,
});

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(99);

async function main() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ id: string; tenant_id: string }>(
      `SELECT id, tenant_id FROM question_versions WHERE content_preview LIKE 'Facility looked stable%'`
    );
    const driftQV = rows[0];
    if (!driftQV) throw new Error('Run npm run seed first — driftQV not found.');

    const { rows: studentRows } = await client.query<{ id: string }>(
      `SELECT id FROM students WHERE tenant_id = $1 AND is_test_account = false LIMIT 100`,
      [driftQV.tenant_id]
    );

    await client.query('BEGIN');
    for (let i = 0; i < 60; i++) {
      const student = studentRows[Math.floor(rand() * studentRows.length)]!;
      const daysAgo = Math.floor(rand() * 25); // well within the 60-day recent window
      await client.query(
        `INSERT INTO attempts
          (tenant_id, student_id, question_version_id, is_correct, response_time_ms, mode,
           hints_used, exposure_number, is_novel, session_position_pct, respondent_ability_proxy,
           completed, created_at)
         VALUES ($1,$2,$3,$4,$5,'UNTIMED',0,1,true,$6,$7,true, now() - ($8 || ' days')::interval)`,
        [
          driftQV.tenant_id,
          student.id,
          driftQV.id,
          rand() < 0.5, // ~50% recent facility vs. ~80% baseline
          50000 + Math.floor(rand() * 20000),
          rand(),
          rand(),
          daysAgo,
        ]
      );
    }
    await client.query('COMMIT');
    console.log(`Inserted 60 recent (~50% facility) attempts on driftQV=${driftQV.id}`);
    console.log('Now run: npx tsx src/scripts/exercise.ts   (or POST /admin/questions/:id/difficulty/recalibrate)');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
