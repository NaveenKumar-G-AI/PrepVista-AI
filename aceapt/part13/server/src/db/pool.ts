import { Pool } from "pg";
import "dotenv/config";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

export const servicePool = process.env.DATABASE_SERVICE_URL
  ? new Pool({ connectionString: process.env.DATABASE_SERVICE_URL, max: 4 })
  : null;

pool.on("error", (err) => {
  // A background/idle client error should not crash the process — log and move on.
  console.error("Unexpected Postgres pool error", err);
});
