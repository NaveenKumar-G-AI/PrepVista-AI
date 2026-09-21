import { NextResponse } from "next/server";
import { loadIncidentContext, toErrorResponse } from "@/lib/api/handler";
import { NotFoundError } from "@/lib/repo/authz";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ incidentId: string; traceKey: string }> }
) {
  try {
    const { incidentId, traceKey } = await params;
    const { instance, template } = await loadIncidentContext(incidentId);

    const trace = template.traces.find((t) => t.traceKey === traceKey);
    if (!trace || trace.offsetSeconds > instance.simMinutesElapsed * 60) {
      throw new NotFoundError("Trace");
    }

    return NextResponse.json({ trace });
  } catch (err) {
    return toErrorResponse(err);
  }
}
