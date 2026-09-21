import { NextRequest, NextResponse } from "next/server";
import { buildRequestScopedDeps } from "@/lib/hint-ladder/production-deps";
import { getHintLadderHistory } from "@/lib/hint-ladder/service";
import { httpStatusForError } from "@/lib/hint-ladder/errors";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const problemId = req.nextUrl.searchParams.get("problemId");
  if (!problemId) {
    return NextResponse.json({ error: "problemId query parameter is required." }, { status: 400 });
  }

  try {
    const { deps, studentId } = await buildRequestScopedDeps();
    const history = await getHintLadderHistory(deps, studentId, problemId);
    // Only ever return the fields a student is allowed to see — never
    // the raw event payloads, provider names, model names, or latency
    // that hint_events also stores for observability.
    const safeHistory = history.map((h) => ({
      level: h.level,
      hintType: h.hintType,
      text: h.text,
      observation: h.observation,
      confidence: h.confidence,
      codeLocation: h.codeLocation,
      createdAt: h.createdAt,
      effectiveness: h.effectiveness,
      source: h.source,
    }));
    return NextResponse.json({ history: safeHistory }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: "Could not load hint history." }, { status: httpStatusForError(err) });
  }
}
