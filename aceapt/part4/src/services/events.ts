import { randomUUID } from "node:crypto";
import type { LearningEventRecord, LearningEventType } from "../domain/types.js";

export function makeEvent(
  studentId: string,
  type: LearningEventType,
  skillId: string | null,
  actionId: string | null,
  payload: Record<string, unknown> | null = null
): LearningEventRecord {
  return { id: randomUUID(), studentId, type, skillId, actionId, payload, createdAt: new Date().toISOString() };
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** An action exists and belongs to the student, but the requested status change isn't legal from its current status. Maps to 409, not 403/404. */
export class InvalidTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTransitionError";
  }
}
