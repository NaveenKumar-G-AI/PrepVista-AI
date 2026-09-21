import * as shortcutRepo from '../repositories/shortcutRepository';
import * as stateRepo from '../repositories/studentStateRepository';
import * as validationRepo from '../repositories/validationRepository';
import * as analytics from '../repositories/analyticsRepository';
import { DomainError } from '../domain/types';
import type { ConditionRule, QuestionContext, ShortcutRow } from '../domain/types';
import type { ShortcutSource, StrategyClassification, StrategyType } from '../domain/enums';
import { evaluateApplicability } from './applicabilityService';
import { buildRecommendation, type RecommendationCandidate, type StandardMethodStats } from './recommendationService';
import { getPerformanceSummary } from './performanceService';
import { currentFocus } from './trainingService';
import { validateShortcut } from './validationService';

function canView(shortcut: ShortcutRow | undefined, studentId: string): shortcut is ShortcutRow {
  return Boolean(shortcut) && (shortcut!.owner_student_id === null || shortcut!.owner_student_id === studentId);
}

function requireVisible(shortcutId: string, tenantId: string, studentId: string): ShortcutRow {
  const shortcut = shortcutRepo.getShortcutById(shortcutId);
  if (!canView(shortcut, studentId)) throw new DomainError('Shortcut not found.', 404, 'NOT_FOUND');
  if (shortcut.tenant_id !== tenantId) throw new DomainError('Shortcut not found.', 404, 'NOT_FOUND');
  return shortcut;
}

export interface ShortcutSummaryDTO {
  shortcutId: string;
  canonicalName: string;
  category: string;
  domain: string;
  strategyType: StrategyType;
  classification: StrategyClassification;
  status: string;
  isPersonal: boolean;
  trustState: string;
  reliability: number;
  usageCount: number;
  avgTimeSavedRatio: number | null;
  pinned: boolean;
  createdAt: string;
}

function toSummary(shortcut: ShortcutRow, studentId: string): ShortcutSummaryDTO {
  const state = stateRepo.getState(studentId, shortcut.shortcut_id);
  return {
    shortcutId: shortcut.shortcut_id,
    canonicalName: shortcut.canonical_name,
    category: shortcut.category,
    domain: shortcut.domain,
    strategyType: shortcut.strategy_type,
    classification: shortcut.classification,
    status: shortcut.status,
    isPersonal: shortcut.owner_student_id === studentId,
    trustState: state?.state ?? 'EXPERIMENTAL',
    reliability: state?.reliability ?? 0,
    usageCount: state?.usage_count ?? 0,
    avgTimeSavedRatio: state?.avg_time_saved_ratio ?? null,
    pinned: Boolean(state?.pinned),
    createdAt: shortcut.created_at,
  };
}

export interface MyShortcutsDTO {
  trusted: ShortcutSummaryDTO[];
  developing: ShortcutSummaryDTO[];
  needsReview: ShortcutSummaryDTO[];
  recentlyAdded: ShortcutSummaryDTO[];
  recommended: ShortcutSummaryDTO[];
  todaysFocus: string | null;
}

/**
 * Backs "MY SHORTCUTS" (secs. 82, 174, 228). Bucketing notes, since the
 * spec names the buckets but not their exact rules:
 *  - trusted / needsReview: read directly off the per-student trust state.
 *  - developing: has usage evidence (DEVELOPING or RELIABLE) but isn't
 *    TRUSTED yet.
 *  - recentlyAdded: the 5 most recently created shortcuts visible to this
 *    student, regardless of bucket (sec. 86).
 *  - recommended: global shortcuts the student hasn't tried yet (sec. 87
 *    ties this to "the next learning activity", which needs a real
 *    recommendation engine this build doesn't have - see
 *    getRecommendedStrategy for the question-level version, which *is*
 *    fully implemented).
 */
export function getMyShortcuts(tenantId: string, studentId: string): MyShortcutsDTO {
  const visible = shortcutRepo.listVisibleShortcuts(tenantId, studentId);
  const summaries = visible.map((s) => toSummary(s, studentId));

  const trusted = summaries.filter((s) => s.trustState === 'TRUSTED');
  const developing = summaries.filter((s) => s.trustState === 'DEVELOPING' || s.trustState === 'RELIABLE');
  const needsReview = summaries.filter((s) => s.trustState === 'NEEDS_REVIEW');
  const recentlyAdded = [...summaries].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 5);
  const recommended = summaries.filter((s) => !s.isPersonal && s.usageCount === 0).slice(0, 5);

  return { trusted, developing, needsReview, recentlyAdded, recommended, todaysFocus: currentFocus(studentId) };
}

export function searchShortcuts(tenantId: string, studentId: string, query: string): ShortcutSummaryDTO[] {
  return shortcutRepo.searchVisibleShortcuts(tenantId, studentId, query).map((s) => toSummary(s, studentId));
}

export interface ShortcutDetailDTO extends ShortcutSummaryDTO {
  description: string;
  skillId: string | null;
  formulaId: string | null;
  questionFamilyId: string | null;
  requiresOptions: boolean;
  isApproximation: boolean;
  acceptableError: number | null;
  version: number;
  steps: string[];
  conditions: ConditionRule[];
  nonApplicability: ConditionRule[];
  whenToUseText: string;
  whenNotToUseText: string;
  underlyingReason: string;
  expression: string | null;
  canonicalExpression: string | null;
  examples: Array<{ id: string; isCounterexample: boolean; input: Record<string, number>; expectedOutput: number | null; note: string }>;
  latestValidation: { status: string; validationType: string; validatedAt: string } | null;
  performance: ReturnType<typeof getPerformanceSummary>;
  notes: string;
  preferred: boolean;
}

export function getShortcutDetail(tenantId: string, studentId: string, shortcutId: string): ShortcutDetailDTO {
  const shortcut = requireVisible(shortcutId, tenantId, studentId);
  const version = shortcutRepo.getLatestVersion(shortcutId);
  const examples = version ? shortcutRepo.listExamples(shortcutId, version.version) : [];
  const validations = validationRepo.listValidations(shortcutId, version?.version);
  const state = stateRepo.getState(studentId, shortcutId);

  analytics.logEvent({ tenantId, studentId, eventType: 'shortcut_viewed', payload: { shortcutId } });

  return {
    ...toSummary(shortcut, studentId),
    description: shortcut.description,
    skillId: shortcut.skill_id,
    formulaId: shortcut.formula_id,
    questionFamilyId: shortcut.question_family_id,
    requiresOptions: Boolean(shortcut.requires_options),
    isApproximation: Boolean(shortcut.is_approximation),
    acceptableError: shortcut.acceptable_error,
    version: version?.version ?? 0,
    steps: version ? (JSON.parse(version.steps) as string[]) : [],
    conditions: version ? (JSON.parse(version.conditions) as ConditionRule[]) : [],
    nonApplicability: version ? (JSON.parse(version.non_applicability) as ConditionRule[]) : [],
    whenToUseText: version?.when_to_use_text ?? '',
    whenNotToUseText: version?.when_not_to_use_text ?? '',
    underlyingReason: version?.underlying_reason ?? '',
    expression: version?.expression ?? null,
    canonicalExpression: version?.canonical_expression ?? null,
    examples: examples.map((e) => ({
      id: e.id,
      isCounterexample: Boolean(e.is_counterexample),
      input: JSON.parse(e.input) as Record<string, number>,
      expectedOutput: e.expected_output,
      note: e.note,
    })),
    latestValidation: validations[0] ? { status: validations[0].status, validationType: validations[0].validation_type, validatedAt: validations[0].validated_at } : null,
    performance: getPerformanceSummary(studentId, shortcutId),
    notes: state?.notes ?? '',
    preferred: Boolean(state?.preferred),
  };
}

export interface CreatePersonalShortcutInput {
  tenantId: string;
  studentId: string;
  canonicalName: string;
  description: string;
  category: string;
  domain: string;
  strategyType: StrategyType;
  problemType: string; // free text describing when it's meant for - stored as question_family_id placeholder-free text in domain
  steps: string[];
  whenToUse: string;
  whenNotTo: string;
  expression?: string;
  canonicalExpression?: string;
  validationDomain?: { variables: Record<string, { min: number; max: number; integer?: boolean }> };
  requiresOptions?: boolean;
  isApproximation?: boolean;
  acceptableError?: number;
}

/** Sec. 90/91/20/21 - a student-created shortcut always starts UNVERIFIED, however confident the write-up sounds. */
export function createPersonalShortcut(input: CreatePersonalShortcutInput): ShortcutDetailDTO {
  const source: ShortcutSource = 'STUDENT_CREATED';
  const shortcut = shortcutRepo.insertShortcut({
    tenantId: input.tenantId,
    ownerStudentId: input.studentId,
    canonicalName: input.canonicalName,
    description: input.description,
    category: input.category,
    domain: input.domain,
    strategyType: input.strategyType,
    classification: 'PERSONAL',
    source,
    status: 'UNVERIFIED',
    requiresOptions: input.requiresOptions,
    isApproximation: input.isApproximation,
    acceptableError: input.acceptableError ?? null,
  });

  // whenToUse/whenNotTo from the simple creation form (sec. 90) are free
  // text, not machine-checkable rules - they're stored for display and
  // left out of `conditions`/`nonApplicability` on purpose. A shortcut with
  // no real ConditionRules is treated as unconditionally APPLICABLE by the
  // Applicability Engine (see applicabilityService.ts), which is the right
  // default here: the student hasn't declared a checkable condition yet,
  // so nothing should be silently marked UNKNOWN because of it.
  shortcutRepo.insertVersion({
    shortcutId: shortcut.shortcut_id,
    version: 1,
    description: input.description,
    steps: input.steps,
    conditions: [],
    nonApplicability: [],
    underlyingReason: '',
    expression: input.expression ?? null,
    canonicalExpression: input.canonicalExpression ?? null,
    validationDomain: input.validationDomain ?? null,
    whenToUseText: input.whenToUse,
    whenNotToUseText: input.whenNotTo,
  });

  analytics.logEvent({ tenantId: input.tenantId, studentId: input.studentId, eventType: 'shortcut_created', payload: { shortcutId: shortcut.shortcut_id } });
  analytics.logEvent({ tenantId: input.tenantId, studentId: input.studentId, eventType: 'shortcut_saved', payload: { shortcutId: shortcut.shortcut_id } });

  return getShortcutDetail(input.tenantId, input.studentId, shortcut.shortcut_id);
}

/** Sec. 91-92 - "Test my shortcut". Only runs deterministic checks; never marks TRUSTED by itself (sec. 21-22). */
export function testShortcut(tenantId: string, studentId: string, shortcutId: string) {
  requireVisible(shortcutId, tenantId, studentId);
  const version = shortcutRepo.getLatestVersion(shortcutId);
  if (!version) throw new DomainError('This shortcut has no version to test.', 400, 'NO_VERSION');

  analytics.logEvent({ tenantId, studentId, eventType: 'shortcut_test_started', payload: { shortcutId } });
  const result = validateShortcut(shortcutId, version.version);
  analytics.logEvent({ tenantId, studentId, eventType: 'shortcut_test_completed', payload: { shortcutId, status: result.overallStatus } });
  return result;
}

export function archiveShortcut(studentId: string, shortcutId: string): void {
  const shortcut = shortcutRepo.getShortcutById(shortcutId);
  if (!shortcut || shortcut.owner_student_id !== studentId) {
    throw new DomainError('You can only archive shortcuts you created.', 403, 'FORBIDDEN');
  }
  shortcutRepo.updateShortcutStatus(shortcutId, 'DEPRECATED');
}

export function setPreference(tenantId: string, studentId: string, shortcutId: string, patch: { preferred?: boolean; pinned?: boolean; notes?: string }): void {
  const shortcut = shortcutRepo.getShortcutById(shortcutId);
  if (!canView(shortcut, studentId)) throw new DomainError('Shortcut not found.', 404, 'NOT_FOUND');
  const state = stateRepo.getOrCreateState(tenantId, studentId, shortcutId);
  stateRepo.setPreference(state.id, patch);
}

export interface ShortcutProfileDTO {
  trustedCount: number;
  developingCount: number;
  needsReviewCount: number;
  todaysFocus: string | null;
}

export function getShortcutProfile(tenantId: string, studentId: string): ShortcutProfileDTO {
  const my = getMyShortcuts(tenantId, studentId);
  return {
    trustedCount: my.trusted.length,
    developingCount: my.developing.length,
    needsReviewCount: my.needsReview.length,
    todaysFocus: my.todaysFocus,
  };
}

/** Sec. 34-40, 89, 94-98, 105-106, 178, 234 - the full applicability + trust + mode pipeline for one question. */
export function getRecommendedStrategy(params: {
  tenantId: string;
  studentId: string;
  context: QuestionContext;
  mode: 'LEARNING' | 'PRACTICE' | 'TIMED_TRAINING' | 'FORMAL_ASSESSMENT';
  assessmentAllowsStrategyAssistance?: boolean;
  standardMethodStats?: StandardMethodStats;
}) {
  const candidatesRaw = params.context.questionFamilyId
    ? shortcutRepo.listVisibleByFamily(params.tenantId, params.studentId, params.context.questionFamilyId)
    : shortcutRepo.listVisibleShortcuts(params.tenantId, params.studentId);

  const candidates: RecommendationCandidate[] = candidatesRaw.map((shortcut) => {
    const version = shortcutRepo.getLatestVersion(shortcut.shortcut_id);
    const applicability = evaluateApplicability(
      {
        conditions: version ? (JSON.parse(version.conditions) as ConditionRule[]) : [],
        nonApplicability: version ? (JSON.parse(version.non_applicability) as ConditionRule[]) : [],
        requiresOptions: Boolean(shortcut.requires_options),
        isApproximation: Boolean(shortcut.is_approximation),
        acceptableError: shortcut.acceptable_error,
      },
      params.context
    );
    const state = stateRepo.getState(params.studentId, shortcut.shortcut_id);
    return {
      shortcutId: shortcut.shortcut_id,
      canonicalName: shortcut.canonical_name,
      applicability: applicability.result,
      trustState: state?.state ?? 'EXPERIMENTAL',
      reliability: state?.reliability ?? 0,
      avgTimeSavedRatio: state?.avg_time_saved_ratio ?? null,
    };
  });

  return buildRecommendation({
    mode: params.mode,
    assessmentAllowsStrategyAssistance: Boolean(params.assessmentAllowsStrategyAssistance),
    candidates,
    standardMethodStats: params.standardMethodStats,
  });
}
