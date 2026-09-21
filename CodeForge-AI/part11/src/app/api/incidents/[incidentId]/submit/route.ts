import { NextResponse } from "next/server";
import { loadIncidentContext, toErrorResponse } from "@/lib/api/handler";
import { getPostmortem, submitPostmortem } from "@/lib/repo/postmortem";
import { validatePostmortem } from "@/lib/engine/postmortemValidation";
import { updateIncidentInstance } from "@/lib/repo/instance";
import { transition } from "@/lib/engine/stateMachine";
import { getPool } from "@/lib/repo/pool";

export async function POST(_req: Request, { params }: { params: Promise<{ incidentId: string }> }) {
  try {
    const { incidentId } = await params;
    const { instance } = await loadIncidentContext(incidentId);
    const pool = getPool();

    if (instance.state !== "RESOLVED") {
      return NextResponse.json(
        { error: "invalid_state", message: `Cannot submit from state ${instance.state}; incident must be RESOLVED.` },
        { status: 409 }
      );
    }

    const draft = await getPostmortem(pool, incidentId);
    const validation = validatePostmortem(draft ?? {});
    if (!validation.valid) {
      // brief CRITICAL TEST CASE: "Student submits invalid postmortem ->
      // validation failure" — returned as a normal 400, not a 500/crash.
      return NextResponse.json({ error: "incomplete_postmortem", ...validation }, { status: 400 });
    }

    await submitPostmortem(pool, incidentId);
    const updated = await updateIncidentInstance(pool, incidentId, { state: transition(instance.state, "POSTMORTEM") });

    return NextResponse.json({ incident: updated });
  } catch (err) {
    return toErrorResponse(err);
  }
}
