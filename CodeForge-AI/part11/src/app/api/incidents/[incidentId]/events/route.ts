import { NextResponse } from "next/server";
import { loadIncidentContext, toErrorResponse } from "@/lib/api/handler";
import { listEvents } from "@/lib/repo/investigation";
import { getPool } from "@/lib/repo/pool";

export async function GET(_req: Request, { params }: { params: Promise<{ incidentId: string }> }) {
  try {
    const { incidentId } = await params;
    await loadIncidentContext(incidentId);
    const events = await listEvents(getPool(), incidentId);
    return NextResponse.json({ events });
  } catch (err) {
    return toErrorResponse(err);
  }
}
