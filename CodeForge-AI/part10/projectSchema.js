/**
 * Project definition validation (Phase 40) + publish quality gate (Phase 69).
 *
 * Deliberately dependency-free (no zod/ajv) so this runs anywhere without
 * an install step. If your stack already uses zod, this is a straight port —
 * the shape and checks below are the spec either way.
 *
 * @typedef {import('../types').ProjectDefinition} ProjectDefinition
 * @typedef {import('../types').Rubric} Rubric
 */

export class ProjectValidationError extends Error {
  constructor(errors) {
    super(`Project definition failed validation: ${errors.join('; ')}`);
    this.errors = errors;
  }
}

const REQUIRED_FIELDS = [
  'id', 'title', 'role', 'difficulty', 'projectType',
  'skills', 'requirements', 'acceptanceCriteria', 'rubricId', 'timeEstimateMinutes',
];

const DIFFICULTIES = ['foundation', 'intermediate', 'advanced', 'production_simulation', 'engineering_challenge'];

// Phase 29 progression sanity bounds, in minutes. Not a hard product rule,
// just a guardrail against a "foundation" project scoped like a take-home.
const TIME_BOUNDS_MINUTES = {
  foundation: [15, 60],
  intermediate: [30, 120],
  advanced: [60, 240],
  production_simulation: [90, 300],
  engineering_challenge: [120, 480],
};

/**
 * @param {ProjectDefinition} project
 * @returns {true}
 * @throws {ProjectValidationError}
 */
export function validateProjectDefinition(project) {
  const errors = [];

  for (const field of REQUIRED_FIELDS) {
    if (project?.[field] === undefined || project?.[field] === null) {
      errors.push(`Missing field: ${field}`);
    }
  }

  if (project?.difficulty && !DIFFICULTIES.includes(project.difficulty)) {
    errors.push(`Unknown difficulty: "${project.difficulty}"`);
  }

  if (Array.isArray(project?.skills) && project.skills.length === 0) {
    errors.push('Project must declare at least one skill.');
  }

  if (Array.isArray(project?.acceptanceCriteria)) {
    const visible = project.acceptanceCriteria.filter((c) => c.testType === 'visible');
    const hidden = project.acceptanceCriteria.filter((c) => c.testType === 'hidden');
    if (visible.length === 0) errors.push('Project must define at least one visible acceptance criterion.');
    // Phase 15: hidden tests exist specifically to prevent hardcoded solutions to the visible ones.
    if (hidden.length === 0) errors.push('Project must define at least one hidden acceptance criterion (Phase 15 — prevents hardcoded solutions).');
    const ids = project.acceptanceCriteria.map((c) => c.id);
    if (new Set(ids).size !== ids.length) errors.push('Duplicate acceptance criteria IDs found.');
  } else {
    errors.push('acceptanceCriteria must be an array.');
  }

  if (project?.difficulty && project?.timeEstimateMinutes != null) {
    const [min, max] = TIME_BOUNDS_MINUTES[project.difficulty] ?? [0, Infinity];
    if (project.timeEstimateMinutes < min || project.timeEstimateMinutes > max) {
      errors.push(
        `timeEstimateMinutes (${project.timeEstimateMinutes}) is out of the expected range [${min}, ${max}] for difficulty "${project.difficulty}".`
      );
    }
  }

  if (errors.length) throw new ProjectValidationError(errors);
  return true;
}

/**
 * Publish quality gate (Phase 69/70) — beyond schema validity, checks the
 * project is actually gradeable end to end. Deterministic only; no AI in
 * this gate (Phase 42) so it can run in CI without a network call.
 *
 * @param {ProjectDefinition} project
 * @param {Rubric} rubric
 * @returns {{ passed: boolean, errors: string[] }}
 */
export function runQualityGate(project, rubric) {
  const errors = [];

  try {
    validateProjectDefinition(project);
  } catch (e) {
    errors.push(...e.errors);
  }

  if (!rubric || !Array.isArray(rubric.categories) || rubric.categories.length === 0) {
    errors.push('Rubric is missing or has no categories.');
  } else {
    const totalWeight = rubric.categories.reduce((sum, c) => sum + c.weight, 0);
    if (Math.abs(totalWeight - 100) > 0.01) {
      errors.push(`Rubric "${rubric.id}" weights must sum to 100 (got ${totalWeight}).`);
    }
    if (rubric.id !== project?.rubricId) {
      errors.push(`Rubric id "${rubric.id}" does not match project.rubricId "${project?.rubricId}".`);
    }
  }

  if (Array.isArray(project?.documentationRequirements) && project.documentationRequirements.length === 0 &&
      ['production_simulation', 'engineering_challenge'].includes(project?.difficulty)) {
    errors.push(`"${project.difficulty}" projects should declare at least one documentation requirement (Phase 28).`);
  }

  return { passed: errors.length === 0, errors };
}
