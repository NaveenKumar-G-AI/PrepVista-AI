import { randomUUID } from "node:crypto";
import type { ReadinessEvent } from "../types/domain.js";
import type { ReadinessRepository } from "../data/repository.js";

/**
 * Thin, intentional event logger. Every event exists to support a real
 * product need — reassessment triggers, adoption/override analytics, or
 * debugging — not "collect everything just in case" (spec section 17/23).
 */
export async function logEvent(
  repository: ReadinessRepository,
  studentId: string,
  type: ReadinessEvent["type"],
  payload: Record<string, unknown> = {},
): Promise<void> {
  const event: ReadinessEvent = {
    id: randomUUID(),
    studentId,
    type,
    payload,
    createdAt: new Date().toISOString(),
  };
  await repository.addEvent(event);
}
