import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/supabase/server";
import { getPool } from "@/lib/repo/pool";
import { createIncidentInstance, listIncidentInstancesForUser } from "@/lib/repo/instance";
import { getPublicTemplateBySlug } from "@/lib/repo/catalog";
import { toErrorResponse } from "@/lib/api/handler";

export async function GET() {
  try {
    const userId = await requireUserId();
    const pool = getPool();
    const instances = await listIncidentInstancesForUser(pool, userId);
    return NextResponse.json({ incidents: instances });
  } catch (err) {
    return toErrorResponse(err);
  }
}

const createSchema = z.object({ templateSlug: z.string().min(1) });

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = createSchema.parse(await req.json());
    const pool = getPool();

    const publicTemplate = await getPublicTemplateBySlug(pool, body.templateSlug);
    if (!publicTemplate || !publicTemplate.published) {
      return NextResponse.json({ error: "not_found", message: "Unknown or unpublished incident template." }, { status: 404 });
    }

    const instance = await createIncidentInstance(pool, userId, publicTemplate.id);
    return NextResponse.json({ incident: instance, template: publicTemplate }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "invalid_request", message: err.errors[0]?.message ?? "Invalid request." }, { status: 400 });
    }
    return toErrorResponse(err);
  }
}
