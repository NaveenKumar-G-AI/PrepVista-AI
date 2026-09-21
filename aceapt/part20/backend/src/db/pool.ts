import pg from "pg";
import "dotenv/config";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  // eslint-disable-next-line no-console
  console.warn(
    "[db] DATABASE_URL is not set. Copy .env.example to .env and fill it in " +
      "before starting the server — see README.md."
  );
}

export const pool = new Pool({
  connectionString: connectionString || undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
});

export async function withClient<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  return withClient(async (client) => {
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  });
}
