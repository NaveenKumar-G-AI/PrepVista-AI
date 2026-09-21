import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { loadIncidentContext, toErrorResponse } from "@/lib/api/handler";
import { listHypotheses, recordEvent, updateHypothesisStatus } from "@/lib/repo/investigation";
import { getPool } from "@/lib/repo/pool";

const patchSchema = z.object({
  status: z.enum(["CONFIRMED", "REJECTED"]),
  evidenceRefs: z.array(z.string()).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ incidentId: string; hypothesisId: string }> }
) {
  try {
    const { incidentId, hypothesisId } = await params;
    const { userId, instance } = await loadIncidentContext(incidentId);
    const body = patchSchema.parse(await req.json());

    const pool = getPool();
    const existing = await listHypotheses(pool, incidentId);
    const target = existing.find((h) => h.id === hypothesisId);
    if (!target) {
      return NextResponse.json({ error: "not_found", message: "Hypothesis not found." }, { status: 404 });
    }

    const updated = await updateHypothesisStatus(pool, hypothesisId, body.status, body.evidenceRefs);
    await recordEvent(
      pool,
      incidentId,
      userId,
      body.status === "CONFIRMED" ? "CONFIRM_HYPOTHESIS" : "REJECT_HYPOTHESIS",
      { hypothesisId },
      instance.simMinutesElapsed
    );

    return NextResponse.json({ hypothesis: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "invalid_request", message: err.errors[0]?.message ?? "Invalid request." }, { status: 400 });
    }
    return toErrorResponse(err);
  }
}
