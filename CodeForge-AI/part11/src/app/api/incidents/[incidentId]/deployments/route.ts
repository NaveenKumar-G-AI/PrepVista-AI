import { NextResponse } from "next/server";
import { loadIncidentContext, toErrorResponse } from "@/lib/api/handler";

export async function GET(_req: Request, { params }: { params: Promise<{ incidentId: string }> }) {
  try {
    const { incidentId } = await params;
    const { instance, template } = await loadIncidentContext(incidentId);
    const deployments = template.deployments.filter((d) => d.offsetMinutes <= instance.simMinutesElapsed);
    return NextResponse.json({ deployments });
  } catch (err) {
    return toErrorResponse(err);
  }
}
