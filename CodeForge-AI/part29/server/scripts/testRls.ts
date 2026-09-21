/**
 * Proves the RLS policies in db/rls_policies.sql actually restrict access —
 * not just that they parsed. Connects as `codeforge_authenticated`, a role
 * that is NOT the table owner (Postgres exempts owners from RLS by
 * default), and sets `request.jwt.claim.sub` per query the same way
 * Supabase's PostgREST layer does from a verified JWT.
 *
 * Run: npm run test:rls   (after npm run seed:demo)
 */
import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

const adminPool = new Pool({ connectionString: process.env.DATABASE_URL });
const authPool = new Pool({
  host: "localhost",
  port: 5432,
  database: "codeforge_growth",
  user: "codeforge_authenticated",
  password: "devpassword",
});

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean) {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.log(`  FAIL  ${label}`);
    failed++;
  }
}

async function asUser<T>(uid: string | null, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await authPool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ""]);
    return await fn(client);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

async function main() {
  const studentA = (await adminPool.query("select id from users where email = 'student.a@demo.codeforge.dev'")).rows[0]?.id;
  const studentB = (await adminPool.query("select id from users where email = 'student.b@demo.codeforge.dev'")).rows[0]?.id;
  const tpo = (await adminPool.query("select id from users where email = 'tpo@demo.codeforge.dev'")).rows[0]?.id;

  if (!studentA || !studentB || !tpo) {
    console.error("Demo fixtures not found — run `npm run seed:demo` first.");
    process.exit(1);
  }

  // Second TPO, deliberately NOT staffing the demo cohort, to prove
  // cohort scoping actually excludes outsiders.
  let outsiderTpo = (await adminPool.query("select id from users where email = 'outsider.tpo@demo.codeforge.dev'")).rows[0]?.id;
  if (!outsiderTpo) {
    outsiderTpo = (
      await adminPool.query(
        "insert into users (email, name, role) values ('outsider.tpo@demo.codeforge.dev','Outsider TPO','TPO') returning id"
      )
    ).rows[0].id;
  }

  console.log("\nRunning RLS access-control checks against the LIVE database (not application code)...\n");

  await asUser(studentA, async (client) => {
    const own = await client.query("select 1 from technical_growth_snapshots where student_id = $1", [studentA]);
    check("Student A can see their own snapshots", (own.rowCount ?? 0) > 0);

    const other = await client.query("select 1 from technical_growth_snapshots where student_id = $1", [studentB]);
    check("Student A CANNOT see Student B's snapshots", (other.rowCount ?? 0) === 0);

    const otherMilestones = await client.query("select 1 from growth_milestones where student_id = $1", [studentB]);
    check("Student A CANNOT see Student B's milestones", (otherMilestones.rowCount ?? 0) === 0);
  });

  await asUser(null, async (client) => {
    const anonA = await client.query("select 1 from technical_growth_snapshots where student_id = $1", [studentA]);
    check("An unauthenticated session sees nothing", (anonA.rowCount ?? 0) === 0);
  });

  await asUser(tpo, async (client) => {
    const cohortStudentRows = await client.query(
      "select 1 from technical_growth_snapshots where student_id = $1",
      [studentA]
    );
    check("Cohort TPO can see a student in their cohort", (cohortStudentRows.rowCount ?? 0) > 0);
  });

  await asUser(outsiderTpo, async (client) => {
    const shouldBeEmpty = await client.query(
      "select 1 from technical_growth_snapshots where student_id = $1",
      [studentA]
    );
    check("TPO outside the cohort CANNOT see the student's snapshots", (shouldBeEmpty.rowCount ?? 0) === 0);
  });

  await asUser(studentA, async (client) => {
    const writeAttempt = await client
      .query("update technical_growth_snapshots set value = 999 where student_id = $1", [studentA])
      .catch((e) => e);
    check(
      "Student A CANNOT write to their own growth snapshots (server-derived only)",
      writeAttempt instanceof Error
    );
  });

  console.log(`\n${passed} passed, ${failed} failed.\n`);
  await adminPool.end();
  await authPool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
