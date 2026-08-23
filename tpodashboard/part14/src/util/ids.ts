import { nanoid } from "nanoid";
import { createHash } from "node:crypto";
import type { ActorContext } from "../types/action.types.js";

export function genActionId(): string {
  return `act_${nanoid(16)}`;
}

export function genAuditId(): string {
  return `aud_${nanoid(16)}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
    .join(",")}}`;
}

export function stableHash(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex").slice(0, 16);
}

/**
 * Idempotency keys are derived deterministically from WHO is asking, WHAT action,
 * WITH WHAT INPUT, bucketed by calendar day. This means:
 *  - a client retry of the same logical request (network timeout, double-tap, an
 *    LLM re-issuing the same tool call) always resolves to the same key and is
 *    therefore automatically deduped by the executor, regardless of which action
 *    record id was created for the retry.
 *  - the exact same request tomorrow gets a fresh key, because "send this week's
 *    reminder" is legitimately a new send, not a retry.
 * Spec section 28 example format: ACTION-2026-08-13-ABC-123
 */
export function genIdempotencyKey(ctx: ActorContext, actionType: string, input: unknown): string {
  const day = new Date().toISOString().slice(0, 10);
  const hash = stableHash({ institutionId: ctx.institutionId, userId: ctx.userId, actionType, input });
  return `ACTION-${day}-${actionType.toUpperCase().slice(0, 12)}-${hash}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function addMinutesIso(baseIso: string, minutes: number): string {
  return new Date(new Date(baseIso).getTime() + minutes * 60_000).toISOString();
}
