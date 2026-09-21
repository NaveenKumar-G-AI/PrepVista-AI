import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { loadIncidentContext, toErrorResponse } from "@/lib/api/handler";
import { createMessage, listMessages } from "@/lib/repo/investigation";
import { getPool } from "@/lib/repo/pool";

export async function GET(_req: Request, { params }: { params: Promise<{ incidentId: string }> }) {
  try {
    const { incidentId } = await params;
    const { userId, instance, template } = await loadIncidentContext(incidentId);
    const pool = getPool();

    let messages = await listMessages(pool, incidentId);

    // Lazily deliver any stakeholder trigger whose time has come and that
    // hasn't been delivered yet — evaluated against the actual sim clock,
    // not wall-clock time (brief: "TIME MODEL").
    const deliveredPersonas = new Set(messages.filter((m) => m.direction === "INBOUND").map((m) => m.sender));
    for (const trig of template.stakeholderTriggers) {
      if (instance.simMinutesElapsed >= trig.triggerAfterMinutes && !deliveredPersonas.has(trig.persona)) {
        await createMessage(pool, incidentId, userId, {
          sender: trig.persona,
          direction: "INBOUND",
          body: { prompt: trig.prompt, requiresFields: trig.requiresFields },
          simMinutesAt: trig.triggerAfterMinutes,
        });
      }
    }
    messages = await listMessages(pool, incidentId);

    return NextResponse.json({ messages });
  } catch (err) {
    return toErrorResponse(err);
  }
}

const replySchema = z.object({
  currentImpact: z.string().min(1),
  knownEvidence: z.string().min(1),
  hypothesis: z.string().min(1),
  mitigation: z.string().min(1),
  currentStatus: z.string().min(1),
  nextAction: z.string().min(1),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ incidentId: string }> }) {
  try {
    const { incidentId } = await params;
    const { userId, instance } = await loadIncidentContext(incidentId);
    const body = replySchema.parse(await req.json());

    const message = await createMessage(getPool(), incidentId, userId, {
      sender: "student",
      direction: "OUTBOUND",
      body,
      simMinutesAt: instance.simMinutesElapsed,
    });

    return NextResponse.json({ message }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "invalid_request", message: err.errors[0]?.message ?? "Invalid request." }, { status: 400 });
    }
    return toErrorResponse(err);
  }
}
