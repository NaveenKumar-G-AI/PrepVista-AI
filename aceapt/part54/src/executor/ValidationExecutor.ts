import type { ValidatorRegistry } from "../registry/ValidatorRegistry.js";
import type { ExecutionPlan } from "../planner/ValidationPlanner.js";
import type { ValidationResult, ValidatorInput, ValidationContext } from "../contracts/types.js";
import { buildResult } from "../contracts/validator.js";
import type { ValidationCache } from "../cache/ValidationCache.js";

export interface ExecutorConfig {
  /** Per-validator wall-clock budget (spec §83). A broken validator must not hang the run. */
  timeoutMs: number;
  /** Retries apply ONLY to infra failures (thrown exceptions / timeouts) — never to a
   *  validator that returned a normal FAIL result (spec §84, §209). */
  maxRetries: number;
  retryBackoffMs: number;
}

export const DEFAULT_EXECUTOR_CONFIG: ExecutorConfig = {
  timeoutMs: 8000,
  maxRetries: 2,
  retryBackoffMs: 150
};

/** States a dependency must reach for a dependent validator to be worth attempting. */
const DEPENDENCY_SATISFIED_STATES = new Set(["PASS", "PASS_WITH_WARNING"]);

/** Only these are stable, content-derived facts worth caching (spec §61, §165) —
 *  ERROR/SKIPPED/NOT_APPLICABLE are contextual to a single run, not properties
 *  of the immutable content, so caching them would be actively misleading. */
const CACHEABLE_STATES = new Set(["PASS", "PASS_WITH_WARNING", "FAIL"]);

export interface ExecuteOptions {
  /** REVALIDATION mode (spec §129) forces fresh execution — cache reads are
   *  skipped, though fresh results still populate the cache for later hits. */
  bypassCacheRead?: boolean;
}

export class ValidationExecutor {
  constructor(
    private readonly registry: ValidatorRegistry,
    private readonly config: ExecutorConfig = DEFAULT_EXECUTOR_CONFIG,
    private readonly cache?: ValidationCache
  ) {}

  /**
   * Executes `plan` layer by layer. Within a layer, validators run concurrently
   * (spec §167). Returns every result, including SKIPPED/NOT_APPLICABLE/ERROR —
   * the executor never drops a validator from the output just because it didn't
   * produce a "real" verdict (spec §92: "preserve both results").
   */
  async execute(
    plan: ExecutionPlan,
    baseInput: Omit<ValidatorInput, "context"> & { context: Omit<ValidationContext, "upstreamResults"> },
    options: ExecuteOptions = {}
  ): Promise<ValidationResult[]> {
    const resultsByName = new Map<string, ValidationResult>();

    for (const layer of plan.layers) {
      const layerResults = await Promise.all(layer.map((name) => this.runOne(name, baseInput, resultsByName, options)));
      for (const r of layerResults) resultsByName.set(r.validator, r);
    }

    return plan.allNames.map((name) => resultsByName.get(name)!).filter(Boolean);
  }

  private async runOne(
    name: string,
    baseInput: Omit<ValidatorInput, "context"> & { context: Omit<ValidationContext, "upstreamResults"> },
    priorResults: ReadonlyMap<string, ValidationResult>,
    options: ExecuteOptions
  ): Promise<ValidationResult> {
    const startedAt = Date.now();
    const validator = this.registry.get(name);
    if (!validator) {
      return buildResult({
        validator: name,
        category: "SCHEMA",
        status: "ERROR",
        severity: "MEDIUM",
        code: "VALIDATOR_UNAVAILABLE",
        message: `Validator "${name}" is not registered.`,
        validatorVersion: "unknown",
        startedAt
      });
    }

    const input: ValidatorInput = {
      ...baseInput,
      context: { ...baseInput.context, upstreamResults: priorResults }
    };

    // Dependency gate (spec §16, §93) — never call validate() if a prerequisite
    // did not reach a "good enough to build on" state.
    const failedDependency = validator.dependsOn.find((dep) => {
      const depResult = priorResults.get(dep);
      return !depResult || !DEPENDENCY_SATISFIED_STATES.has(depResult.status);
    });
    if (failedDependency) {
      const depResult = priorResults.get(failedDependency);
      return buildResult({
        validator: validator.name,
        category: validator.category,
        status: "SKIPPED",
        severity: "NONE",
        code: "DEPENDENCY_FAILED",
        message: `Skipped: dependency "${failedDependency}" did not pass (status=${depResult?.status ?? "MISSING"}).`,
        evidence: { dependency: failedDependency, dependencyStatus: depResult?.status ?? "MISSING" },
        validatorVersion: validator.version,
        startedAt,
        skippedReason: `DEPENDENCY_FAILED:${failedDependency}`
      });
    }

    // Applicability gate (spec §12, §90) — "not applicable" must never be
    // confused with "ran and passed."
    if (!validator.isApplicable(input)) {
      return buildResult({
        validator: validator.name,
        category: validator.category,
        status: "NOT_APPLICABLE",
        severity: "NONE",
        code: "VALID",
        message: "Not applicable to this question version.",
        validatorVersion: validator.version,
        startedAt
      });
    }

    const mode = baseInput.mode;
    const contentHash = baseInput.questionVersion.contentHash;

    if (this.cache && !options.bypassCacheRead) {
      const cached = await this.cache.get(contentHash, validator.name, validator.version, mode);
      if (cached) {
        return { ...cached, evidence: { ...cached.evidence, _servedFromCache: true } };
      }
    }

    const result = await this.runWithRetry(validator.name, () => validator.validate(input), validator.category, validator.version, startedAt);

    if (this.cache && CACHEABLE_STATES.has(result.status)) {
      await this.cache.set(contentHash, validator.name, validator.version, mode, result);
    }

    return result;
  }

  private async runWithRetry(
    name: string,
    fn: () => Promise<ValidationResult>,
    category: ValidationResult["category"],
    version: string,
    startedAt: number
  ): Promise<ValidationResult> {
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      attempt += 1;
      try {
        return await this.withTimeout(fn(), name);
      } catch (err) {
        const isLastAttempt = attempt > this.config.maxRetries;
        const isTimeout = err instanceof ValidatorTimeoutError;
        if (!isLastAttempt) {
          await sleep(this.config.retryBackoffMs * attempt);
          continue;
        }
        return buildResult({
          validator: name,
          category,
          status: "ERROR",
          severity: "MEDIUM",
          code: isTimeout ? "VALIDATOR_TIMEOUT" : "VALIDATOR_INTERNAL_ERROR",
          message: isTimeout
            ? `Validator "${name}" exceeded its ${this.config.timeoutMs}ms budget after ${attempt} attempt(s).`
            : `Validator "${name}" threw after ${attempt} attempt(s): ${(err as Error).message}`,
          evidence: { attempts: attempt, error: isTimeout ? "timeout" : String((err as Error).message ?? err) },
          validatorVersion: version,
          startedAt
        });
      }
    }
  }

  private withTimeout<T>(promise: Promise<T>, validatorName: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new ValidatorTimeoutError(validatorName)), this.config.timeoutMs);
      promise
        .then((v) => {
          clearTimeout(timer);
          resolve(v);
        })
        .catch((e) => {
          clearTimeout(timer);
          reject(e);
        });
    });
  }
}

class ValidatorTimeoutError extends Error {
  constructor(validatorName: string) {
    super(`Validator "${validatorName}" timed out`);
    this.name = "ValidatorTimeoutError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
