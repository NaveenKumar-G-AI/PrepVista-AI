import { NextRequest, NextResponse } from "next/server";
import { resolveSession } from "../../../../lib/http/auth";
import { getPool } from "../../../../lib/db/pool";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const session = await resolveSession(req);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const pool = getPool("service");

  // Ownership check happens here (server-side, using the service
  // connection) AND redundantly inside get_safe_evaluation_result()
  // if ever called via a direct-to-Postgres path — defense in depth,
  // not a single point of truth either could silently drift from.
  const { rows: subRows } = await pool.query(
    `select student_id from public.submissions where id = $1`,
    [params.id]
  );
  const submission = subRows[0];
  if (!submission) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (submission.student_id !== session.userId && session.role === "student") {
    // Same response for "not yours" as "doesn't exist" — existence of
    // another student's submission id is not confirmed either.
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { rows } = await pool.query(`select public.get_safe_evaluation_result($1) as result`, [params.id]);
  return NextResponse.json(rows[0].result ?? { error: "not found" }, { status: 200 });
}
