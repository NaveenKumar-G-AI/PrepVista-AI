import { NextRequest, NextResponse } from "next/server";
import { loadIncidentContext, toErrorResponse } from "@/lib/api/handler";
import { applyMitigationRecovery } from "@/lib/engine/metricGen";
import { listActions } from "@/lib/repo/investigation";
import { getPool } from "@/lib/repo/pool";

export async function GET(req: NextRequest, { params }: { params: Promise<{ incidentId: string }> }) {
  try {
    const { incidentId } = await params;
    const { instance, template } = await loadIncidentContext(incidentId);

    const url = new URL(req.url);
    const serviceFilter = url.searchParams.get("service");
    const metricFilter = url.searchParams.get("metric");

    // A mitigating action, if any, is when the "natural" (unmitigated)
    // trajectory stops applying and recovery begins — see metricGen.ts.
    const actionLog = await listActions(getPool(), incidentId);
    const mitigatingAction = actionLog.find((a) => {
      const def = template.actionDefs.find(
        (d) => d.actionType === a.actionType && (d.targetServiceKey ?? undefined) === (a.targetServiceKey ?? undefined)
      );
      return def?.isMitigation;
    });
    const mitigatedAtOffset = mitigatingAction ? mitigatingAction.simMinutesAt : null;

    const result: Record<string, { offsetMinutes: number; value: number }[]> = {};
    for (const [key, points] of Object.entries(template.metricSeries)) {
      const [serviceKey, metricName] = key.split(/:(.+)/);
      if (serviceFilter && serviceKey !== serviceFilter) continue;
      if (metricFilter && metricName !== metricFilter) continue;

      // Never show the student telemetry from "the future" relative to
      // their own investigation clock.
      const visible = points.filter((p) => p.offsetMinutes <= instance.simMinutesElapsed);
      const baseline = points[0]?.value ?? 0;
      result[key] = applyMitigationRecovery(visible, baseline, mitigatedAtOffset);
    }

    return NextResponse.json({ simMinutesElapsed: instance.simMinutesElapsed, series: result });
  } catch (err) {
    return toErrorResponse(err);
  }
}
