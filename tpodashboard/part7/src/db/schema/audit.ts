import { pgTable, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";

/** Backs the Student Success Timeline (spec §59) and doubles as the durable
 *  log behind the in-process EventBus (see src/lib/eventBus.ts). */
export const studentSuccessEvent = pgTable(
  "student_success_event",
  {
    id: text("id").primaryKey(),
    institutionId: text("institution_id").notNull(),
    studentId: text("student_id").notNull(),
    type: text("type").notNull(), // matches docs/EVENTS.md contract
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("student_success_event_student_occurred_idx").on(t.studentId, t.occurredAt)]
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    institutionId: text("institution_id").notNull(),
    actorId: text("actor_id"),
    actorRole: text("actor_role"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    oldValue: jsonb("old_value").$type<unknown>(),
    newValue: jsonb("new_value").$type<unknown>(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_entity_idx").on(t.entityType, t.entityId),
    index("audit_log_institution_created_idx").on(t.institutionId, t.createdAt),
  ]
);
