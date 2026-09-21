import { randomUUID } from "node:crypto";
import type { ValidatorRegistry } from "../registry/ValidatorRegistry.js";
import { ValidationExecutor, DEFAULT_EXECUTOR_CONFIG } from "../executor/ValidationExecutor.js";
import type { ExecutorConfig } from "../executor/ValidationExecutor.js";
import { buildExecutionPlan } from "../planner/ValidationPlanner.js";
import { aggregate } from "../aggregator/ValidationAggregator.js";
import type { ValidationCache } from "../cache/ValidationCache.js";
import { ValidationFreshnessService } from "../freshness/ValidationFreshnessService.js";
import type { FreshnessVerdict } from "../freshness/ValidationFreshnessService.js";
import { ALL_PROFILES, ELIGIBILITY_PROFILE_MAP } from "../profiles/validationProfiles.js";
import type { ValidationProfile } from "../profiles/validationProfiles.js";
import type { ValidationRunRepository, ValidationAuditRepository } from "../repositories/ValidationRunRepository.js";
import type { QuestionVersionSnapshot, ValidationMode, ValidationRunResult, ValidationPorts, Role } from "../contracts/types.js";

export interface RequestedBy {
  role: Role;
  id: string;
}

export interface ValidateQuestionVersionParams {
  questionVersion: QuestionVersionSnapshot;
  mode: ValidationMode;
  requestedBy: RequestedBy;
  ports: ValidationPorts;
}

/** spec §14: maps each mode to the profile that governs which validators are
 *  required. FAST/RUNTIME are deliberately lighter than DEEP/ASSESSMENT — see
 *  spec §168: "no heavy validation in the student request path." */
function profileForMode(mode: ValidationMode): ValidationProfile {
  switch (mode) {
    case "ASSESSMENT":
      return ALL_PROFILES.ASSESSMENT_PROFILE!;
    case "FAST":
    case "RUNTIME":
      return ALL_PROFILES.PRACTICE_PROFILE!;
    case "STANDARD":
    case "DEEP":
    case "REVALIDATION":
    default:
      return ALL_PROFILES.TRANSFER_PROFILE!; // the broadest non-assessment profile — DEEP means deep
  }
}

export class QuestionValidationService {
  private readonly freshness = new ValidationFreshnessService();

  constructor(
    private readonly registry: ValidatorRegistry,
    private readonly runRepo: ValidationRunRepository,
    private readonly auditRepo: ValidationAuditRepository,
    private readonly cache?: ValidationCache,
    private readonly executorConfig: ExecutorConfig = DEFAULT_EXECUTOR_CONFIG
  ) {}

  /** spec §159 validateQuestionVersion / §135-137 generation/import/edit entry point. */
  async validateQuestionVersion(params: ValidateQuestionVersionParams): Promise<ValidationRunResult> {
    return this.runInternal(params, false);
  }

  /** spec §159 validateForAssessment — always uses the strict ASSESSMENT_PROFILE
   *  regardless of the mode passed in, since assessment eligibility must never
   *  be judged against a lighter profile "by accident." */
  async validateForAssessment(params: Omit<ValidateQuestionVersionParams, "mode">): Promise<ValidationRunResult> {
    return this.runInternal({ ...params, mode: "ASSESSMENT" }, false);
  }

  /** spec §129/§159 revalidateQuestion — forces fresh execution (no cache reads)
   *  and is always audited as an explicit action, distinct from an implicit
   *  trigger (spec §15). */
  async revalidateQuestion(params: ValidateQuestionVersionParams & { reason?: string }): Promise<ValidationRunResult> {
    const run = await this.runInternal(params, true);
    await this.auditRepo.record({
      tenantId: params.questionVersion.tenantId,
      questionId: params.questionVersion.questionId,
      validationRunId: run.runId,
      actorRole: params.requestedBy.role,
      actorId: params.requestedBy.id,
      action: "REVALIDATE_REQUESTED",
      reason: params.reason
    });
    return run;
  }

  private async runInternal(params: ValidateQuestionVersionParams, bypassCacheRead: boolean): Promise<ValidationRunResult> {
    const profile = profileForMode(params.mode);
    const candidateNames = [...new Set([...profile.required, ...profile.optional])];
    const plan = buildExecutionPlan(this.registry, candidateNames);
    const executor = new ValidationExecutor(this.registry, this.executorConfig, this.cache);

    const startedAt = new Date().toISOString();
    const results = await executor.execute(
      plan,
      {
        questionVersion: params.questionVersion,
        mode: params.mode,
        context: { tenantId: params.questionVersion.tenantId, requestedBy: params.requestedBy, ports: params.ports }
      },
      { bypassCacheRead }
    );
    const completedAt = new Date().toISOString();

    const { overallStatus, highestSeverity, blockingCodes, eligibility } = aggregate(results, profile);
    const validatorVersionSet = Object.fromEntries(plan.allNames.map((name) => [name, this.registry.get(name)!.version]));

    const run: ValidationRunResult = {
      runId: randomUUID(),
      questionId: params.questionVersion.questionId,
      versionId: params.questionVersion.versionId,
      versionNumber: params.questionVersion.versionNumber,
      mode: params.mode,
      profile: profile.name,
      startedAt,
      completedAt,
      results,
      overallStatus,
      highestSeverity,
      blockingCodes,
      eligibility,
      contentHash: params.questionVersion.contentHash,
      validatorVersionSet
    };

    await this.runRepo.save(run, params.questionVersion.tenantId, params.requestedBy);
    return run;
  }

  /** spec §159 getValidationStatus / §147 delivery gate: a LIGHTWEIGHT read —
   *  does not run any validator, just reports the latest stored run's status
   *  plus whether it's still fresh for the CURRENT snapshot (spec §171). */
  async getValidationStatus(
    caller: RequestedBy,
    versionId: string,
    currentSnapshot: QuestionVersionSnapshot
  ): Promise<{ run: ValidationRunResult | null; freshness: FreshnessVerdict | null }> {
    const run = await this.runRepo.getLatestForVersion({ tenantId: currentSnapshot.tenantId, role: caller.role }, versionId);
    if (!run) return { run: null, freshness: null };
    const currentValidatorVersions = Object.fromEntries(this.registry.all().map((v) => [v.name, v.version]));
    const freshness = this.freshness.isFresh(run, currentSnapshot, currentValidatorVersions);
    return { run, freshness };
  }

  /** spec §159 getValidationResults — full evidence, for privileged callers
   *  (role-based redaction happens at the API boundary, see security/accessControl.ts). */
  async getValidationResults(caller: RequestedBy, tenantId: string | null, runId: string): Promise<ValidationRunResult | null> {
    return this.runRepo.getById({ tenantId, role: caller.role }, runId);
  }

  /** spec §159 getValidationHistory. */
  async getValidationHistory(caller: RequestedBy, tenantId: string | null, questionId: string): Promise<ValidationRunResult[]> {
    return this.runRepo.getHistoryForQuestion({ tenantId, role: caller.role }, questionId);
  }

  /** spec §159 checkEligibility / §146-148: the FAST, no-validator-execution
   *  path a delivery layer calls before serving a question to a student. Never
   *  runs deep validators inline — only interprets what's already stored. */
  async checkEligibility(
    caller: RequestedBy,
    forMode: keyof typeof ELIGIBILITY_PROFILE_MAP,
    versionId: string,
    currentSnapshot: QuestionVersionSnapshot
  ): Promise<{ eligible: boolean; reason: "NO_VALIDATION_ON_RECORD" | "STALE" | "INELIGIBLE" | "ELIGIBLE" }> {
    const { run, freshness } = await this.getValidationStatus(caller, versionId, currentSnapshot);
    if (!run) return { eligible: false, reason: "NO_VALIDATION_ON_RECORD" };
    if (freshness && !freshness.fresh) return { eligible: false, reason: "STALE" };
    const eligible = run.eligibility[forMode];
    return { eligible, reason: eligible ? "ELIGIBLE" : "INELIGIBLE" };
  }
}
