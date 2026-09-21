import { Client } from "pg";

/**
 * Test infrastructure only. Connects with the elevated admin role (table
 * owner) specifically BECAUSE the tables it truncates are the same ones
 * the app's least-privilege role is deliberately denied DELETE on (see
 * migrations/007) — resetting fixtures between tests is not a capability
 * the running application itself should ever have.
 */
let client: Client | null = null;

async function getClient(): Promise<Client> {
  if (client) return client;
  const url = process.env.DATABASE_ADMIN_URL;
  if (!url) throw new Error("DATABASE_ADMIN_URL must be set for tests (see vitest.config.ts `env`).");
  client = new Client({ connectionString: url });
  await client.connect();
  return client;
}

const TABLES = [
  "incident_timeline_event",
  "incident",
  "security_alert",
  "audit_event",
  "security_event",
  "app_session",
  "dependency_health_snapshot"
];

export async function resetDatabase(): Promise<void> {
  const c = await getClient();
  // TRUNCATE does not fire row-level triggers (so audit_event's
  // immutability trigger does not block this), and CASCADE handles the
  // incident -> incident_timeline_event FK.
  await c.query(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`);
}

export async function closeAdminClient(): Promise<void> {
  if (client) {
    await client.end();
    client = null;
  }
}
