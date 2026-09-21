import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { loadIncidentContext, toErrorResponse } from "@/lib/api/handler";
import { createHypothesis, listHypotheses, recordEvent } from "@/lib/repo/investigation";
import { getPool } from "@/lib/repo/pool";

export async function GET(_req: Request, { params }: { params: Promise<{ incidentId: string }> }) {
  try {
    const { incidentId } = await params;
    await loadIncidentContext(incidentId);
    const hypotheses = await listHypotheses(getPool(), incidentId);
    return NextResponse.json({ hypotheses });
  } catch (err) {
    return toErrorResponse(err);
  }
}

const createSchema = z.object({
  statement: z.string().min(5).max(2000),
  category: z.enum(["SYMPTOM", "IMMEDIATE_CAUSE", "ROOT_CAUSE", "CONTRIBUTING_FACTOR"]),
  implicatedCauseKey: z.string().min(1),
  evidenceRefs: z.array(z.string()).default([]),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ incidentId: string }> }) {
  try {
    const { incidentId } = await params;
    const { userId, instance, template } = await loadIncidentContext(incidentId);
    const body = createSchema.parse(await req.json());

    const validCauseKey = template.candidateCauseKeys.some((c) => c.key === body.implicatedCauseKey);
    if (!validCauseKey) {
      return NextResponse.json({ error: "invalid_request", message: "Unknown cause key." }, { status: 400 });
    }

    const pool = getPool();
    const hyp = await createHypothesis(pool, incidentId, userId, body);
    await recordEvent(pool, incidentId, userId, "CREATE_HYPOTHESIS", { hypothesisId: hyp.id }, instance.simMinutesElapsed);

    return NextResponse.json({ hypothesis: hyp }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "invalid_request", message: err.errors[0]?.message ?? "Invalid request." }, { status: 400 });
    }
    return toErrorResponse(err);
  }
}
