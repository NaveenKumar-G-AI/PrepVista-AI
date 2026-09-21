import { NextResponse } from "next/server";
import { requireUserId, UnauthenticatedError } from "@/lib/supabase/server";
import { NotFoundError } from "@/lib/repo/authz";
import { InvalidTransitionError } from "@/lib/engine/stateMachine";
import { ActionNotDefinedError, ConfirmationRequiredError } from "@/lib/engine/actions";
import { getIncidentInstance } from "@/lib/repo/instance";
import { assertIncidentOwnership } from "@/lib/repo/authz";
import { getFullTemplateBySlug } from "@/lib/repo/catalog";
import { getPool } from "@/lib/repo/pool";
import { IncidentInstance, IncidentTemplate } from "@/lib/engine/types";

/**
 * Central error -> HTTP mapping. Every route in this app funnels errors
 * through here so students only ever see a clean, safe message — never a
 * raw stack trace or SQL error (brief: "Never expose internal stack
 * traces to students").
 */
export function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof UnauthenticatedError) {
    return NextResponse.json({ error: "unauthenticated", message: "Sign in required." }, { status: 401 });
  }
  if (err instanceof NotFoundError) {
    return NextResponse.json({ error: "not_found", message: err.message }, { status: 404 });
  }
  if (err instanceof ConfirmationRequiredError) {
    return NextResponse.json(
      { error: "confirmation_required", message: err.message, actionType: err.actionType },
      { status: 409 }
    );
  }
  if (err instanceof InvalidTransitionError) {
    return NextResponse.json(
      { error: "invalid_transition", message: err.message, from: err.from, to: err.to },
      { status: 409 }
    );
  }
  if (err instanceof ActionNotDefinedError) {
    return NextResponse.json({ error: "invalid_action", message: err.message }, { status: 400 });
  }
  // eslint-disable-next-line no-console
  console.error("[api] unhandled error:", err);
  return NextResponse.json({ error: "internal_error", message: "Something went wrong. Please try again." }, { status: 500 });
}

export interface LoadedIncidentContext {
  userId: string;
  instance: IncidentInstance;
  template: IncidentTemplate;
}

/**
 * Standard entry point for every /api/incidents/[incidentId]/* route:
 * verifies the caller is signed in, confirms they own this exact incident
 * (throws NotFoundError otherwise — see authz.ts for why "not found" and
 * not "forbidden"), and hydrates the full ground-truth template needed to
 * resolve engine logic server-side.
 */
export async function loadIncidentContext(incidentId: string): Promise<LoadedIncidentContext> {
  const userId = await requireUserId();
  const pool = getPool();
  await assertIncidentOwnership(pool, incidentId, userId);
  const instance = await getIncidentInstance(pool, incidentId);
  const template = await getFullTemplateBySlug(pool, (await templateSlugFor(instance.templateId)) ?? "");
  if (!template) throw new NotFoundError("Incident template");
  return { userId, instance, template };
}

async function templateSlugFor(templateId: string): Promise<string | null> {
  const pool = getPool();
  const res = await pool.query("select slug from incident_templates where id = $1", [templateId]);
  return res.rows[0]?.slug ?? null;
}
