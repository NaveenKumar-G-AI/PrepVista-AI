/**
 * Configurable taxonomy (spec §10, §19, §36): training categories, assessment
 * categories, and intervention types must NOT be hard-coded permanently.
 * Institutions add rows here instead of requiring a code change.
 */
import { pgTable, pgEnum, text, timestamp, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";

export const taxonomyDomainEnum = pgEnum("taxonomy_domain", [
  "TRAINING_CATEGORY",
  "ASSESSMENT_CATEGORY",
  "INTERVENTION_TYPE",
]);

export const taxonomyTerm = pgTable(
  "taxonomy_term",
  {
    id: text("id").primaryKey(),
    institutionId: text("institution_id").notNull(),
    domain: taxonomyDomainEnum("domain").notNull(),
    code: text("code").notNull(),
    label: text("label").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("taxonomy_term_institution_domain_code_unique").on(t.institutionId, t.domain, t.code),
    index("taxonomy_term_institution_domain_idx").on(t.institutionId, t.domain),
  ]
);
