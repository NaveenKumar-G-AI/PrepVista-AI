import { db } from "../db/client";
import { studentSuccessEvent } from "../db/schema";
import { newId } from "./id";

/**
 * Event contract from PART7 spec §63. This is an in-process pub/sub PLUS a
 * durable row in student_success_event (which also backs the Student
 * Success Timeline, spec §59). In the real repo, `publish` should call into
 * whatever the existing Part 1 event bus/message queue is — the payload
 * shapes below are the actual contract to preserve; the transport is not.
 */
export type PrepVistaEventType =
  | "TRAINING_PROGRAM_CREATED"
  | "TRAINING_PROGRAM_STARTED"
  | "TRAINING_PROGRAM_COMPLETED"
  | "TRAINING_ENROLLMENT_CREATED"
  | "TRAINING_COMPLETED"
  | "TRAINING_SESSION_CREATED"
  | "TRAINING_ATTENDANCE_RECORDED"
  | "ASSESSMENT_ASSIGNED"
  | "ASSESSMENT_STARTED"
  | "ASSESSMENT_COMPLETED"
  | "ASSESSMENT_RESULT_RECORDED"
  | "INTERVENTION_CREATED"
  | "INTERVENTION_ASSIGNED"
  | "INTERVENTION_STARTED"
  | "INTERVENTION_COMPLETED"
  | "INTERVENTION_OVERDUE"
  | "READINESS_UPDATED"
  | "READINESS_DECLINED"
  | "READINESS_IMPROVED"
  | "TRAINING_EFFECTIVENESS_UPDATED";

export interface PrepVistaEvent {
  type: PrepVistaEventType;
  institutionId: string;
  studentId?: string;
  payload: Record<string, unknown>;
}

type Subscriber = (event: PrepVistaEvent) => void | Promise<void>;

const subscribers = new Set<Subscriber>();

export const eventBus = {
  subscribe(fn: Subscriber): () => void {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  },

  async publish(event: PrepVistaEvent): Promise<void> {
    // Durable record — never lose an event even if no subscriber is wired up.
    await db.insert(studentSuccessEvent).values({
      id: newId("evt"),
      institutionId: event.institutionId,
      studentId: event.studentId ?? "institution",
      type: event.type,
      payload: event.payload,
    });

    for (const fn of subscribers) {
      await fn(event);
    }
  },
};
