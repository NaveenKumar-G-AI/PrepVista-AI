import { NextResponse } from "next/server";
import { loadIncidentContext, toErrorResponse } from "@/lib/api/handler";
import { updateIncidentInstance } from "@/lib/repo/instance";
import { recordEvent } from "@/lib/repo/investigation";
import { transition } from "@/lib/engine/stateMachine";
import { getPool } from "@/lib/repo/pool";

export async function POST(_req: Request, { params }: { params: Promise<{ incidentId: string }> }) {
  try {
    const { incidentId } = await params;
    const { userId, instance } = await loadIncidentContext(incidentId);
    const pool = getPool();

    if (instance.state !== "CREATED") {
      // Idempotent: calling start twice just returns current state rather
      // than erroring, matching the brief's "repeated network requests
      // must not duplicate actions" spirit for a simple state kickoff.
      return NextResponse.json({ incident: instance });
    }

    let current = await updateIncidentInstance(pool, incidentId, { state: transition(instance.state, "ACTIVE") });
    current = await updateIncidentInstance(pool, incidentId, { state: transition(current.state, "INVESTIGATING") });
    await recordEvent(pool, incidentId, userId, "OWNERSHIP_TAKEN", {}, current.simMinutesElapsed);

    return NextResponse.json({ incident: current });
  } catch (err) {
    return toErrorResponse(err);
  }
}
