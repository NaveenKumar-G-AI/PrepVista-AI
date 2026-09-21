import { NextResponse } from "next/server";
import { loadIncidentContext, toErrorResponse } from "@/lib/api/handler";

export async function GET(_req: Request, { params }: { params: Promise<{ incidentId: string }> }) {
  try {
    const { incidentId } = await params;
    const { instance, template } = await loadIncidentContext(incidentId);

    const alerts = template.alerts.filter((a) => {
      if (a.offsetMinutes > instance.simMinutesElapsed) return false;
      if (a.triggerCondition === "IF_ESCALATED" && instance.escalationLevel === 0) return false;
      return true;
    });

    return NextResponse.json({ alerts });
  } catch (err) {
    return toErrorResponse(err);
  }
}
