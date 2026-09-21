import dotenv from "dotenv";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { Pool } from "pg";

dotenv.config({ path: path.join(__dirname, "..", ".env.local") });
dotenv.config({ path: path.join(__dirname, "..", ".env") });

async function main() {
  const isLocal = process.argv.includes("--local");
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  try {
    await client.query(
      "create table if not exists _codeforge_migrations (name text primary key, applied_at timestamptz not null default now())"
    );

    const files: string[] = [];
    if (isLocal) {
      files.push(...readdirSync(path.join(__dirname, "..", "db", "local-dev")).map((f) => path.join("db/local-dev", f)));
    }
    files.push(
      ...readdirSync(path.join(__dirname, "..", "db", "migrations"))
        .filter((f) => f.endsWith(".sql"))
        .sort()
        .map((f) => path.join("db/migrations", f))
    );

    for (const rel of files) {
      const applied = await client.query("select 1 from _codeforge_migrations where name = $1", [rel]);
      if (applied.rowCount && applied.rowCount > 0) {
        console.log(`skip (already applied): ${rel}`);
        continue;
      }
      const sql = readFileSync(path.join(__dirname, "..", rel), "utf8");
      console.log(`applying: ${rel}`);
      await client.query(sql);
      await client.query("insert into _codeforge_migrations (name) values ($1)", [rel]);
    }

    console.log("Migrations complete.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
