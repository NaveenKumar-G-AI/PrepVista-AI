import { generateId, now } from '../utils/misc.js';
import { HistoricalStats, Issue, QuestionVersion, ValidationRecord } from '../types/domain.js';
import { IssueSeverity, QualityStatus } from '../types/enums.js';
import { aiSignalToIssues, AISignal, isAIValidationConfigured, runAIValidation } from './aiValidator.js';
import { validateAnswer } from './answerValidator.js';
import { validateClarity } from './clarityValidator.js';
import { validateDifficulty } from './difficultyValidator.js';
import { validateDistractors } from './distractorValidator.js';
import { validateFairnessAndAccessibility } from './fairnessAccessibilityValidator.js';
import { validateSchema } from './schemaValidator.js';
import { SemanticSimilarityPort, validateSimilarity } from './similarityValidator.js';
import { validateSkillAlignment, SkillGraphPort } from './skillAlignmentValidator.js';
import { validateSolution } from './solutionValidator.js';
import { severityRank, ValidatorOutcome, worstSeverity } from './types.js';

export interface PipelineContext {
  pool?: QuestionVersion[];
  historicalStats?: HistoricalStats;
  skillGraphPort?: SkillGraphPort;
  semanticSimilarityPort?: SemanticSimilarityPort;
  /** Defaults to true; set false to skip the AI step entirely (e.g. cost-sensitive batch jobs —
   *  section 135: "Do not call an expensive model for every simple numeric question."). */
  useAI?: boolean;
}

export interface PipelineResult {
  issues: Issue[];
  validations: ValidationRecord[];
  aiSignal?: AISignal;
}

async function runNamed(name: string, fn: () => ValidatorOutcome | Promise<ValidatorOutcome>): Promise<{ record: ValidationRecord; issues: Issue[] }> {
  const outcome = await fn();
  const worst = worstSeverity(outcome.issues);
  return {
    record: {
      id: generateId(),
      questionVersionId: '', // filled in by the caller once the version id is known
      validator: name,
      status: outcome.issues.length === 0 ? 'PASS' : 'FLAGGED',
      severity: worst,
      issueCount: outcome.issues.length,
      validatedAt: now(),
    },
    issues: outcome.issues,
  };
}

/** Section 7/84: runs every validator, in the documented order, deterministic checks first. */
export async function runValidationPipeline(version: QuestionVersion, ctx: PipelineContext = {}): Promise<PipelineResult> {
  const validations: ValidationRecord[] = [];
  const issues: Issue[] = [];

  const steps: [string, () => ValidatorOutcome | Promise<ValidatorOutcome>][] = [
    ['SchemaValidator', () => validateSchema(version)],
    ['AnswerValidator', () => validateAnswer(version)],
    ['SolutionValidator', () => validateSolution(version)],
    ['SkillAlignmentValidator', () => validateSkillAlignment(version, ctx.skillGraphPort)],
    ['DifficultyValidator', () => validateDifficulty(version, ctx.historicalStats)],
    ['SimilarityValidator', () => validateSimilarity(version, ctx.pool ?? [], ctx.semanticSimilarityPort)],
    ['ClarityValidator', () => validateClarity(version)],
    ['DistractorValidator', () => validateDistractors(version)],
    ['FairnessAccessibilityValidator', () => validateFairnessAndAccessibility(version)],
  ];

  for (const [name, fn] of steps) {
    const { record, issues: stepIssues } = await runNamed(name, fn);
    validations.push(record);
    issues.push(...stepIssues);
  }

  let aiSignal: AISignal | undefined;
  if (ctx.useAI !== false && isAIValidationConfigured()) {
    const { record, issues: stepIssues } = await runNamed('AIValidator', async () => {
      aiSignal = await runAIValidation(version);
      return aiSignalToIssues(aiSignal, version.purpose);
    });
    validations.push(record);
    issues.push(...stepIssues);
  } else if (ctx.useAI !== false) {
    // Not configured at all — still record that this dimension has no data, per section 137
    // ("A question can remain 'needs review' rather than becoming falsely approved.").
    const { record, issues: stepIssues } = await runNamed('AIValidator', () =>
      aiSignalToIssues({ available: false, reason: 'AI validation not configured.' }, version.purpose),
    );
    validations.push(record);
    issues.push(...stepIssues);
  }

  return { issues, validations, aiSignal };
}

/**
 * Pure function, independently unit-testable: severity -> aggregate status.
 * Section 11/12: any CRITICAL issue is a hard gate (BLOCKED); everything else is a soft signal
 * that funnels toward human review rather than a silent auto-reject.
 * Section 75: the full issue list always travels with this status — it is never collapsed to a
 * single opaque number.
 */
export function determineQualityStatus(issues: Issue[]): QualityStatus {
  const open = issues.filter((i) => i.status === 'OPEN');
  if (open.some((i) => i.severity === IssueSeverity.CRITICAL)) return QualityStatus.BLOCKED;
  if (open.some((i) => severityRank(i.severity) >= severityRank(IssueSeverity.MEDIUM))) return QualityStatus.NEEDS_REVIEW;
  if (open.some((i) => severityRank(i.severity) >= severityRank(IssueSeverity.LOW))) return QualityStatus.PASS_WITH_WARNING;
  return QualityStatus.PASS;
}
