import { NextRequest, NextResponse } from "next/server";
import { buildRequestScopedDeps } from "@/lib/hint-ladder/production-deps";
import { getHintLadderState } from "@/lib/hint-ladder/service";
import { httpStatusForError } from "@/lib/hint-ladder/errors";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const problemId = req.nextUrl.searchParams.get("problemId");
  if (!problemId) {
    return NextResponse.json({ error: "problemId query parameter is required." }, { status: 400 });
  }

  try {
    const { deps, studentId } = await buildRequestScopedDeps();
    const state = await getHintLadderState(deps, studentId, problemId);
    return NextResponse.json(state, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: "Could not load hint state." }, { status: httpStatusForError(err) });
  }
}
