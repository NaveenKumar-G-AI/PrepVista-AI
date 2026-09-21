import { NextRequest, NextResponse } from "next/server";
import { loadIncidentContext, toErrorResponse } from "@/lib/api/handler";

export async function GET(req: NextRequest, { params }: { params: Promise<{ incidentId: string }> }) {
  try {
    const { incidentId } = await params;
    const { instance, template } = await loadIncidentContext(incidentId);

    const url = new URL(req.url);
    const service = url.searchParams.get("service");
    const level = url.searchParams.get("level");
    const q = url.searchParams.get("q")?.toLowerCase();
    const requestId = url.searchParams.get("requestId");
    const traceId = url.searchParams.get("traceId");
    const errorsOnly = url.searchParams.get("errorsOnly") === "true";
    const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") ?? "50")));

    const nowOffsetSeconds = instance.simMinutesElapsed * 60;

    let lines = template.logLines.filter((l) => l.offsetSeconds <= nowOffsetSeconds);
    if (service) lines = lines.filter((l) => l.serviceKey === service);
    if (level) lines = lines.filter((l) => l.level === level);
    if (errorsOnly) lines = lines.filter((l) => l.level === "ERROR");
    if (requestId) lines = lines.filter((l) => l.requestId === requestId);
    if (traceId) lines = lines.filter((l) => l.traceId === traceId);
    if (q) lines = lines.filter((l) => l.message.toLowerCase().includes(q) || JSON.stringify(l.metadata).toLowerCase().includes(q));

    const total = lines.length;
    const startIdx = (page - 1) * pageSize;
    const pageLines = lines.slice(startIdx, startIdx + pageSize);

    return NextResponse.json({ total, page, pageSize, lines: pageLines });
  } catch (err) {
    return toErrorResponse(err);
  }
}
