/**
 * INTEGRATION STUBS — stand-ins for tables owned by Parts 1 / 4 / 5 / 6.
 *
 * These exist ONLY so this schema is runnable and testable in isolation.
 * Part 7 tables reference these by plain string id columns, never by a
 * Drizzle foreign key — see docs/INTEGRATION_NOTES.md for why, and for what
 * to do with this file when merging into the real repo (short version:
 * delete it, and point the id columns at your real tables).
 */
import { pgTable, pgEnum, text, timestamp } from "drizzle-orm/pg-core";

export const institution = pgTable("institution", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const season = pgTable("season", {
  id: text("id").primaryKey(),
  institutionId: text("institution_id").notNull(),
  name: text("name").notNull(),
  startDate: timestamp("start_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),
});

export const userRoleEnum = pgEnum("user_role", [
  "TPO_HEAD",
  "PLACEMENT_OFFICER",
  "DEPT_COORDINATOR",
  "FACULTY",
  "STUDENT",
  "MANAGEMENT",
]);

export const userAccount = pgTable("user_account", {
  id: text("id").primaryKey(),
  institutionId: text("institution_id").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  role: userRoleEnum("role").notNull(),
  scopeDepartment: text("scope_department"),
  linkedStudentId: text("linked_student_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const student = pgTable("student", {
  id: text("id").primaryKey(),
  institutionId: text("institution_id").notNull(),
  seasonId: text("season_id").notNull(),
  name: text("name").notNull(),
  department: text("department").notNull(),
  batch: text("batch").notNull(),
  email: text("email").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Part 1's extensible skill catalog — deliberately not an enum (spec §27). */
export const skill = pgTable("skill", {
  id: text("id").primaryKey(),
  institutionId: text("institution_id").notNull(),
  name: text("name").notNull(),
  category: text("category"),
});

export const application = pgTable("application", {
  id: text("id").primaryKey(),
  studentId: text("student_id").notNull(),
  driveId: text("drive_id").notNull(),
  status: text("status").notNull(),
  appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
});

export const interviewResult = pgTable("interview_result", {
  id: text("id").primaryKey(),
  studentId: text("student_id").notNull(),
  applicationId: text("application_id"),
  outcome: text("outcome").notNull(), // ADVANCED | REJECTED | SELECTED
  interviewedAt: timestamp("interviewed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const offer = pgTable("offer", {
  id: text("id").primaryKey(),
  studentId: text("student_id").notNull(),
  applicationId: text("application_id"),
  status: text("status").notNull(), // EXTENDED | ACCEPTED | DECLINED | JOINED
  offeredAt: timestamp("offered_at", { withTimezone: true }).notNull().defaultNow(),
  joinedAt: timestamp("joined_at", { withTimezone: true }),
});
