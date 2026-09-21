import { NextResponse } from "next/server";
import { loadIncidentContext, toErrorResponse } from "@/lib/api/handler";

export async function GET(_req: Request, { params }: { params: Promise<{ incidentId: string }> }) {
  try {
    const { incidentId } = await params;
    const { instance, template } = await loadIncidentContext(incidentId);
    const nowOffsetSeconds = instance.simMinutesElapsed * 60;

    const traces = template.traces
      .filter((t) => t.offsetSeconds <= nowOffsetSeconds)
      .map((t) => ({
        traceKey: t.traceKey,
        label: t.label,
        offsetSeconds: t.offsetSeconds,
        totalDurationMs: t.totalDurationMs,
        status: t.status,
        spanCount: t.spans.length,
      }));

    return NextResponse.json({ traces });
  } catch (err) {
    return toErrorResponse(err);
  }
}
