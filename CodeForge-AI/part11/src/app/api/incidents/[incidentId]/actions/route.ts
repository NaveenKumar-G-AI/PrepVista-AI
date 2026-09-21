import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { loadIncidentContext, toErrorResponse } from "@/lib/api/handler";
import { executeAction } from "@/lib/repo/executeAction";
import { withTransaction } from "@/lib/repo/pool";
import { ACTION_TYPES } from "@/lib/engine/types";

const actionSchema = z.object({
  actionType: z.enum(ACTION_TYPES),
  targetServiceKey: z.string().optional(),
  confirmed: z.boolean().default(false),
  idempotencyKey: z.string().min(1).max(200),
  evidenceKey: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ incidentId: string }> }) {
  try {
    const { incidentId } = await params;
    const { userId, instance, template } = await loadIncidentContext(incidentId);
    const body = actionSchema.parse(await req.json());

    const result = await withTransaction((client) =>
      executeAction(client, {
        template,
        instance,
        ownerId: userId,
        actionType: body.actionType,
        targetServiceKey: body.targetServiceKey,
        confirmed: body.confirmed,
        idempotencyKey: body.idempotencyKey,
        evidenceKey: body.evidenceKey,
      })
    );

    return NextResponse.json({
      incident: result.instance,
      narrative: result.narrative,
      wasNew: result.wasNew,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "invalid_request", message: err.errors[0]?.message ?? "Invalid request." }, { status: 400 });
    }
    return toErrorResponse(err);
  }
}
