import { NextResponse } from "next/server";
import { loadIncidentContext, toErrorResponse } from "@/lib/api/handler";
import { getPublicTemplateBySlug } from "@/lib/repo/catalog";
import { getPool } from "@/lib/repo/pool";

export async function GET(_req: Request, { params }: { params: Promise<{ incidentId: string }> }) {
  try {
    const { incidentId } = await params;
    const { instance, template } = await loadIncidentContext(incidentId);
    const publicTemplate = await getPublicTemplateBySlug(getPool(), template.slug);
    return NextResponse.json({ incident: instance, template: publicTemplate });
  } catch (err) {
    return toErrorResponse(err);
  }
}
