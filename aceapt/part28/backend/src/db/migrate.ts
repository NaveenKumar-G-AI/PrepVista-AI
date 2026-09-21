import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createAdminPool } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const pool = createAdminPool();
  const dir = path.join(__dirname, 'migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = readFileSync(path.join(dir, file), 'utf8');
    process.stdout.write(`Applying ${file}... `);
    await pool.query(sql);
    process.stdout.write('ok\n');
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
