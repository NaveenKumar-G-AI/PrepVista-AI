import { getPool } from "../lib/db/pool";
import { Workspace } from "./workspace-client";

// This page reads live problem data from the database. Without this,
// `next build` prerenders it once at build time and serves that
// snapshot to everyone thereafter — caught for real during the build
// in this repo (the page came back marked "○ Static").
export const dynamic = "force-dynamic";

async function getProblem() {
  const pool = getPool("service");
  const { rows } = await pool.query(
    `select p.id, p.slug, p.title, pv.id as problem_version_id, pv.spec, pv.time_limit_ms, pv.memory_limit_mb
     from public.problems p
     join public.problem_versions pv on pv.id = p.current_problem_version_id
     where p.slug = $1 and p.status = 'published'`,
    ["pair-sum-equals-target"]
  );
  return rows[0] ?? null;
}

export default async function Page() {
  const problem = await getProblem();

  if (!problem) {
    return (
      <main style={{ padding: 48, fontFamily: "var(--font-display)" }}>
        <p style={{ color: "var(--mist-400)" }}>
          No published problem found. Run <code>npm run db:migrate &amp;&amp; npm run db:seed &amp;&amp; tsx scripts/seed-demo-problem.ts</code>{" "}
          first.
        </p>
      </main>
    );
  }

  return (
    <Workspace
      problemId={problem.id}
      title={problem.title}
      statement={problem.spec.statement}
      publicTests={problem.spec.publicTests}
      timeLimitMs={problem.time_limit_ms}
      memoryLimitMb={problem.memory_limit_mb}
    />
  );
}
