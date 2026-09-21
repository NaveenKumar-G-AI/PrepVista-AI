import { NextResponse } from "next/server";
import { loadIncidentContext, toErrorResponse } from "@/lib/api/handler";
import { getLatestEvaluation } from "@/lib/repo/evaluation";
import { evaluateIncident } from "@/lib/repo/evaluateIncident";
import { withTransaction } from "@/lib/repo/pool";
import { getPool } from "@/lib/repo/pool";

export async function GET(_req: Request, { params }: { params: Promise<{ incidentId: string }> }) {
  try {
    const { incidentId } = await params;
    await loadIncidentContext(incidentId);
    const evaluation = await getLatestEvaluation(getPool(), incidentId);
    return NextResponse.json({ evaluation });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(_req: Request, { params }: { params: Promise<{ incidentId: string }> }) {
  try {
    const { incidentId } = await params;
    const { instance, template } = await loadIncidentContext(incidentId);

    if (instance.state === "EVALUATED") {
      // Idempotent: evaluation is immutable, so re-requesting it just
      // returns the existing (already-final) result instead of erroring.
      const existing = await getLatestEvaluation(getPool(), incidentId);
      return NextResponse.json({ evaluation: existing });
    }

    const evaluation = await withTransaction((client) => evaluateIncident(client, template, instance));
    return NextResponse.json({ evaluation }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
