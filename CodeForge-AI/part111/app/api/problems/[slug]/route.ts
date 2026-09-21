import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../../lib/db/pool";

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
): Promise<NextResponse> {
  const pool = getPool("service");

  // Explicit column allowlist — even though this query already can't
  // reach hidden_test_cases (different table entirely), the same
  // discipline applies here: select exactly what's safe, never `select *`.
  const { rows } = await pool.query(
    `select p.id, p.slug, p.title,
            pv.id as problem_version_id, pv.spec, pv.function_style, pv.entry_point,
            pv.time_limit_ms, pv.memory_limit_mb
     from public.problems p
     join public.problem_versions pv on pv.id = p.current_problem_version_id
     where p.slug = $1 and p.status = 'published'`,
    [params.slug]
  );
  const row = rows[0];
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({
    problemId: row.id,
    problemVersionId: row.problem_version_id,
    slug: row.slug,
    title: row.title,
    statement: row.spec.statement,
    inputFormat: row.spec.inputFormat,
    outputFormat: row.spec.outputFormat,
    publicTests: row.spec.publicTests,
    functionStyle: row.function_style,
    entryPoint: row.entry_point,
    timeLimitMs: row.time_limit_ms,
    memoryLimitMb: row.memory_limit_mb,
  });
}
