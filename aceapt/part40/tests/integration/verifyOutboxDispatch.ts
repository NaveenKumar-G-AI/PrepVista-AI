import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();
import { dispatchPendingOutboxEvents } from '../../src/integrations/feature36.adapter';

const pool = new Pool({
  host: process.env.PGHOST, port: Number(process.env.PGPORT), database: process.env.PGDATABASE,
  user: process.env.MIGRATE_PGUSER, password: process.env.MIGRATE_PGPASSWORD,
});

async function main() {
  const client = await pool.connect();
  const before = await client.query(`SELECT status, count(*) FROM outbox_events GROUP BY status`);
  console.log('before dispatch:', before.rows);

  const result = await dispatchPendingOutboxEvents(client);
  console.log('dispatch result:', result);

  const after = await client.query(`SELECT status, count(*) FROM outbox_events GROUP BY status`);
  console.log('after dispatch:', after.rows);

  const sample = await client.query(`SELECT event_type, target_feature, status, dispatched_at FROM outbox_events LIMIT 3`);
  console.log('sample rows:', sample.rows);

  client.release();
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
