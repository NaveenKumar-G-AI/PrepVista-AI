import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { loadIncidentContext, toErrorResponse } from "@/lib/api/handler";
import { recordEvent } from "@/lib/repo/investigation";
import { getPool } from "@/lib/repo/pool";
import { ASSISTANCE_MODES } from "@/lib/engine/types";

const schema = z.object({ mode: z.enum(ASSISTANCE_MODES) });

/**
 * Records that a hint/assistance mode was used (feeds
 * scoring.computeIndependence — see brief "INDEPENDENCE SCORE": tracked as
 * evidence, not as a punitive score). Only STRONG_GUIDANCE is allowed to
 * actually reveal the root cause, and only that reveal is flagged in the
 * event payload; the response text itself is out of scope for this route
 * (it belongs to a real AI-assistance UI this build doesn't include — see
 * README "Known limitations").
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ incidentId: string }> }) {
  try {
    const { incidentId } = await params;
    const { userId, instance } = await loadIncidentContext(incidentId);
    const body = schema.parse(await req.json());

    const revealedRootCause = body.mode === "STRONG_GUIDANCE";
    await recordEvent(
      getPool(),
      incidentId,
      userId,
      "ASSISTANCE_USED",
      { mode: body.mode, revealedRootCause },
      instance.simMinutesElapsed
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "invalid_request", message: err.errors[0]?.message ?? "Invalid request." }, { status: 400 });
    }
    return toErrorResponse(err);
  }
}
