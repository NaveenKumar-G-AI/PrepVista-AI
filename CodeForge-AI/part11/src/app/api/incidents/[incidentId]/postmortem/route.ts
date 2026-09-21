import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { loadIncidentContext, toErrorResponse } from "@/lib/api/handler";
import { getPostmortem, upsertPostmortemDraft } from "@/lib/repo/postmortem";
import { getPool } from "@/lib/repo/pool";

export async function GET(_req: Request, { params }: { params: Promise<{ incidentId: string }> }) {
  try {
    const { incidentId } = await params;
    await loadIncidentContext(incidentId);
    const postmortem = await getPostmortem(getPool(), incidentId);
    return NextResponse.json({ postmortem });
  } catch (err) {
    return toErrorResponse(err);
  }
}

const draftSchema = z.object({
  summary: z.string().optional(),
  businessImpact: z.string().optional(),
  timeline: z.string().optional(),
  rootCause: z.string().optional(),
  contributingFactors: z.string().optional(),
  detection: z.string().optional(),
  mitigation: z.string().optional(),
  permanentFix: z.string().optional(),
  whatWentWell: z.string().optional(),
  whatWentWrong: z.string().optional(),
  preventiveActionKeys: z.array(z.string()).optional(),
  preventiveActionsNotes: z.string().optional(),
  fiveWhys: z.array(z.string()).optional(),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ incidentId: string }> }) {
  try {
    const { incidentId } = await params;
    const { userId, instance } = await loadIncidentContext(incidentId);

    if (instance.state !== "RESOLVED" && instance.state !== "POSTMORTEM") {
      return NextResponse.json(
        { error: "invalid_state", message: "The incident must be RESOLVED before writing a postmortem." },
        { status: 409 }
      );
    }

    const body = draftSchema.parse(await req.json());
    const saved = await upsertPostmortemDraft(getPool(), incidentId, userId, body);
    return NextResponse.json({ postmortem: saved });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "invalid_request", message: err.errors[0]?.message ?? "Invalid request." }, { status: 400 });
    }
    return toErrorResponse(err);
  }
}
