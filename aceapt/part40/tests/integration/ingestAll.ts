import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();
import { ingestSnapshot } from '../../src/services/marketIntelligence.service';

const pool = new Pool({
  host: process.env.PGHOST, port: Number(process.env.PGPORT), database: process.env.PGDATABASE,
  user: process.env.MIGRATE_PGUSER, password: process.env.MIGRATE_PGPASSWORD,
});

async function main() {
  const client = await pool.connect();
  const { rows: roles } = await client.query('SELECT id, slug FROM roles');
  const periods = ['2026-Q1', '2026-Q2', '2026-Q3'];

  for (const role of roles) {
    for (const period of periods) {
      const { rows: exists } = await client.query('SELECT 1 FROM opportunities WHERE role_id=$1 AND posted_at >= $2::date AND posted_at < ($2::date + interval \'3 months\') LIMIT 1', [role.id, periodStart(period)]);
      if (exists.length === 0) continue; // this role has no postings in this period (only ai-backend-engineering has all 3)
      const result = await ingestSnapshot(client, role.id, period);
      console.log(`${role.slug} ${period}: snapshot=${result.snapshotId.slice(0, 8)} signals=${result.signalsCreated}`);
    }
  }

  console.log('\n--- resulting snapshots ---');
  const { rows: snaps } = await client.query(
    `SELECT r.slug, ms.period, ms.skill_frequencies, ms.sample_size FROM market_snapshots ms JOIN roles r ON r.id = ms.role_id ORDER BY r.slug, ms.period`
  );
  for (const s of snaps) {
    console.log(`${s.slug} / ${s.period} (n=${s.sample_size}):`, JSON.stringify(s.skill_frequencies));
  }
  client.release();
  await pool.end();
}

function periodStart(period: string): string {
  const [y, q] = period.split('-Q').map(Number);
  const month = (q - 1) * 3 + 1;
  return `${y}-${String(month).padStart(2, '0')}-01`;
}

main().catch((e) => { console.error(e); process.exit(1); });
