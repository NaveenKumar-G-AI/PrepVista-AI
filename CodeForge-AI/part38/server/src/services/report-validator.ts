import { TechnicalMasteryReportDtoSchema, type TechnicalMasteryReportDto } from "../domain/dto";

export class ReportValidationError extends Error {
  issues: string[];
  constructor(issues: string[]) {
    super(`Report failed validation: ${issues.join("; ")}`);
    this.name = "ReportValidationError";
    this.issues = issues;
  }
}

/**
 * Two layers, per brief §16:
 *  1. Schema validation (zod) — shape/type correctness. This is what makes
 *     "never fabricate missing information" enforceable: every field that
 *     isn't optional/nullable in domain/dto.ts MUST have come from a real
 *     port call, or assembly itself would have thrown before we got here.
 *  2. Business/cross-referential checks that a type checker can't express —
 *     e.g. a gap referencing a role that isn't in the roles list would be
 *     schema-valid but logically broken.
 */
export function validateReportDto(candidate: unknown): TechnicalMasteryReportDto {
  const parsed = TechnicalMasteryReportDtoSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new ReportValidationError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  }
  const dto = parsed.data;

  const issues: string[] = [];
  const roleNames = new Set(dto.roles.map((r) => r.roleName));
  for (const gap of dto.gaps) {
    if (!roleNames.has(gap.roleName)) {
      issues.push(`Gap references role "${gap.roleName}" which is not in roles[]`);
    }
  }
  const skillNames = new Set(dto.skills.map((s) => s.skillName));
  for (const gap of dto.gaps) {
    if (!skillNames.has(gap.skillName)) {
      issues.push(`Gap references skill "${gap.skillName}" which is not in skills[]`);
    }
  }
  if (dto.summary.targetRole && !roleNames.has(dto.summary.targetRole)) {
    issues.push(`summary.targetRole "${dto.summary.targetRole}" is not in roles[]`);
  }
  if (dto.metadata.sourceDataVersion < 1) {
    issues.push(`sourceDataVersion must be >= 1, got ${dto.metadata.sourceDataVersion}`);
  }

  if (issues.length > 0) {
    throw new ReportValidationError(issues);
  }
  return dto;
}
