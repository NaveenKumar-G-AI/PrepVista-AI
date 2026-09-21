import { randomUUID } from 'crypto';
import { BudgetEngine, BudgetScope } from '../budget/BudgetEngine';
import { QuotaEngine } from '../budget/QuotaEngine';
import { CacheLayer, TASK_CACHE_SCOPE } from '../cache/CacheLayer';
import { ContextManager } from '../context/ContextManager';
import { CostCalculator } from '../cost/CostCalculator';
import { AIGatewayError, BudgetLimitError, DegradedModeError, NoEligibleModelError, PolicyRejectionError, QuotaLimitError, normalizeError } from '../errors';
import { PolicyEngine } from '../policy/PolicyEngine';
import { ProviderHealthCache } from '../providers/ProviderHealthCache';
import { ProviderRegistry } from '../providers/ProviderRegistry';
import { ModelRegistry } from '../registry/ModelRegistry';
import { CircuitBreaker, CircuitBreakerOptions } from '../reliability/CircuitBreaker';
import { FallbackRouter } from '../reliability/FallbackRouter';
import { RetryEngine } from '../reliability/RetryEngine';
import { ExperimentConfig, ModelRouter } from '../routing/ModelRouter';
import { AuditLog } from '../telemetry/AuditLog';
import { Telemetry } from '../telemetry/Telemetry';
import { ConcurrencyController } from '../traffic/ConcurrencyController';
import { RateLimiter } from '../traffic/RateLimiter';
import {
  AIRequestContext,
  CacheScope,
  CostBasis,
  ErrorCategory,
  ModelDescriptor,
  Priority,
  RequestStatus,
  RoutingReason,
  TaskType,
  TokenUsage,
} from '../types';
import { EmergencyControls } from './EmergencyControls';

export interface AIGatewayResult {
  requestId: string;
  status: RequestStatus;
  text?: string;
  usage?: TokenUsage;
  model?: { id: string; provider: string; modelKey: string };
  costUsd?: number;
  costBasis?: CostBasis;
  cacheHit: boolean;
  retries: number;
  fallbackUsed: boolean;
  totalTimeMs: number;
  routingReasons: RoutingReason[];
  publicError?: { category: ErrorCategory; message: string };
}

export interface AIGatewayDeps {
  policyEngine: PolicyEngine;
  modelRegistry: ModelRegistry;
  providerRegistry: ProviderRegistry;
  providerHealthCache: ProviderHealthCache;
  modelRouter: ModelRouter;
  fallbackRouter: FallbackRouter;
  budgetEngine: BudgetEngine;
  quotaEngine: QuotaEngine;
  rateLimiter: RateLimiter;
  concurrencyController: ConcurrencyController;
  retryEngine: RetryEngine;
  circuitBreaker: CircuitBreaker;
  cacheLayer: CacheLayer;
  contextManager: ContextManager;
  costCalculator: CostCalculator;
  telemetry: Telemetry;
  auditLog: AuditLog;
  emergencyControls: EmergencyControls;
}

const CIRCUIT_OPTS: CircuitBreakerOptions = { failureThreshold: 5, windowMs: 60_000, cooldownMs: 30_000 };
const IDEMPOTENCY_TTL_MS = 10 * 60_000;

/**
 * The AI Gateway. This is the single entry point every CodeForge AI
 * feature should call instead of touching a provider SDK directly — see
 * the flow diagram in the Feature 39 spec:
 *
 *   Feature -> Gateway -> Policy -> Validation -> Routing -> Provider
 *           -> Response Validation -> Telemetry -> Feature
 *
 * Deliberately contains NO business logic about what any given task
 * means — it only knows how to move a validated request through policy,
 * budget, routing, execution, and telemetry safely. Domain logic (what
 * makes a good interview analysis, how to grade code) stays in the
 * calling feature, exactly as required by "Feature 39 owns the
 * infrastructure surrounding AI execution."
 */
export class AIGateway {
  private idempotencyStore = new Map<string, { result: AIGatewayResult; expiresAt: number }>();

  constructor(private deps: AIGatewayDeps) {}

  async execute(ctx: AIRequestContext): Promise<AIGatewayResult> {
    const start = Date.now();
    const { auditLog, emergencyControls, telemetry } = this.deps;

    auditLog.record('AI_REQUEST', { task: ctx.task, feature: ctx.feature, priority: ctx.priority }, { organizationId: ctx.organizationId, actorId: ctx.userId, target: ctx.requestId });

    // --- Idempotency -----------------------------------------------------
    if (ctx.idempotencyKey) {
      const cached = this.checkIdempotency(ctx.organizationId, ctx.idempotencyKey);
      if (cached) return cached;
    }

    try {
      const result = await this.executeInner(ctx, start);
      if (ctx.idempotencyKey) this.storeIdempotency(ctx.organizationId, ctx.idempotencyKey, result);
      this.recordTelemetry(ctx, result, start);
      return result;
    } catch (err) {
      const result = this.toFailureResult(ctx, err, start);
      this.recordTelemetry(ctx, result, start);
      return result;
    }
  }

  private async executeInner(ctx: AIRequestContext, start: number): Promise<AIGatewayResult> {
    const { emergencyControls, auditLog } = this.deps;

    // --- Emergency controls (checked before anything else costs money) ---
    if (emergencyControls.isKillSwitchActive()) {
      throw new PolicyRejectionError('Global AI kill switch is active');
    }
    if (emergencyControls.isTaskDisabled(ctx.task)) {
      throw new PolicyRejectionError(`Task ${ctx.task} is currently disabled by an operator`);
    }
    if (emergencyControls.isBulkPaused() && ctx.priority === Priority.BULK) {
      throw new PolicyRejectionError('Bulk AI processing is currently paused by an operator');
    }

    // --- Policy resolution -------------------------------------------------
    const policy = this.deps.policyEngine.resolve({ organizationId: ctx.organizationId, feature: ctx.feature, task: ctx.task });
    auditLog.record('POLICY_APPLIED', { appliedScopes: policy.appliedScopes }, { organizationId: ctx.organizationId, target: ctx.requestId });

    // --- Quota ---------------------------------------------------------
    if (ctx.userId) {
      const quotaCheck = this.deps.quotaEngine.tryConsume('USER', ctx.userId);
      if (!quotaCheck.ok) {
        auditLog.record('QUOTA_BLOCKED', { scope: 'USER', scopeRef: ctx.userId }, { organizationId: ctx.organizationId, target: ctx.requestId });
        throw new QuotaLimitError(`USER:${ctx.userId}`);
      }
    }
    const orgQuota = this.deps.quotaEngine.tryConsume('ORGANIZATION', ctx.organizationId);
    if (!orgQuota.ok) {
      auditLog.record('QUOTA_BLOCKED', { scope: 'ORGANIZATION', scopeRef: ctx.organizationId }, { organizationId: ctx.organizationId, target: ctx.requestId });
      throw new QuotaLimitError(`ORGANIZATION:${ctx.organizationId}`);
    }

    // --- Rate limiting ---------------------------------------------------
    const rl = this.deps.rateLimiter.tryConsume(`org:${ctx.organizationId}`, policy.rateLimitPerMinute, policy.rateLimitPerMinute);
    if (!rl.allowed) {
      auditLog.record('RATE_LIMIT_TRIGGERED', { scope: `org:${ctx.organizationId}` }, { organizationId: ctx.organizationId, target: ctx.requestId });
      throw new AIGatewayError(ErrorCategory.RATE_LIMIT, 'AI service is busy right now. Please try again shortly.', { retryable: true, internalDetail: `org rate limit exceeded` });
    }

    // --- Context management ----------------------------------------------
    const contextResult = this.deps.contextManager.prepare(ctx.messages, policy.maxContextTokens);
    if (contextResult.rejected) {
      throw new AIGatewayError(ErrorCategory.INVALID_REQUEST, 'This request is too large to process. Please shorten it and try again.', {
        internalDetail: contextResult.reason,
        retryable: false,
      });
    }

    // --- Cache lookup -----------------------------------------------------
    const cacheScope = ctx.cacheScope ?? TASK_CACHE_SCOPE[ctx.task] ?? CacheScope.NONE;
    const inputHash = CacheLayer.hashInput(JSON.stringify(contextResult.messages));
    let cacheKey: string | null = null;
    if (policy.cachingEnabled && cacheScope !== CacheScope.NONE) {
      cacheKey = this.deps.cacheLayer.buildKey({
        scope: cacheScope,
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        task: ctx.task,
        inputHash,
        modelId: policy.preferredModel ?? 'any',
        promptVersion: 'v1',
        policyVersion: policy.appliedScopes.length, // coarse but real: changes whenever the applied-scope set changes shape
      });
      if (cacheKey) {
        const hit = this.deps.cacheLayer.get<AIGatewayResult>(cacheKey);
        if (hit) {
          return { ...hit, status: RequestStatus.CACHED, cacheHit: true, totalTimeMs: Date.now() - start };
        }
      }
    }

    // --- Routing -----------------------------------------------------------
    const routing = this.deps.modelRouter.route(
      { organizationId: ctx.organizationId, task: ctx.task, requiredCapabilities: ctx.requiredCapabilities, qualityRequirement: ctx.qualityRequirement, maxCostUsd: ctx.maxCostUsd, maxLatencyMs: ctx.maxLatencyMs },
      policy
    );
    if (!routing.model) {
      throw new NoEligibleModelError(ctx.task, `candidates considered: ${routing.candidatesConsidered.join(', ') || 'none'}`);
    }
    this.deps.auditLog.record('MODEL_SELECTED', { modelId: routing.model.id, reasons: routing.reasons }, { organizationId: ctx.organizationId, target: ctx.requestId });

    // --- Attempt primary, then walk the fallback chain on failure ---------
    const tried = new Set<string>();
    let candidate: ModelDescriptor | null = routing.model;
    let fallbackUsed = false;
    let totalRetries = 0;
    let lastError: unknown;

    while (candidate) {
      tried.add(candidate.id);
      try {
        const attempt = await this.attemptModel(ctx, candidate, policy, contextResult.messages);
        totalRetries += attempt.attempts - 1;

        const result: AIGatewayResult = {
          requestId: ctx.requestId,
          status: fallbackUsed ? RequestStatus.FALLBACK : RequestStatus.SUCCESS,
          text: attempt.generateResult.text,
          usage: attempt.generateResult.usage,
          model: { id: candidate.id, provider: candidate.provider, modelKey: candidate.modelKey },
          costUsd: attempt.cost.usd,
          costBasis: attempt.cost.basis,
          cacheHit: false,
          retries: totalRetries,
          fallbackUsed,
          totalTimeMs: Date.now() - start,
          routingReasons: fallbackUsed ? [RoutingReason.FALLBACK] : routing.reasons,
        };

        if (cacheKey) {
          this.deps.cacheLayer.set(cacheKey, result, 10 * 60_000);
          if (attempt.cost.usd > 0) this.deps.cacheLayer.recordSavedCost(attempt.cost.usd);
        }

        this.deps.modelRegistry.recordObservedLatency(candidate.id, result.totalTimeMs);
        return result;
      } catch (err) {
        lastError = err;
        this.deps.auditLog.record('PROVIDER_FAILURE', { modelId: candidate.id, error: err instanceof AIGatewayError ? err.category : 'UNKNOWN' }, { organizationId: ctx.organizationId, target: ctx.requestId });

        const next = this.deps.fallbackRouter.next(ctx.requiredCapabilities, policy, tried);
        if (!next) break;
        this.deps.auditLog.record('FALLBACK_TRIGGERED', { from: candidate.id, to: next.id }, { organizationId: ctx.organizationId, target: ctx.requestId });
        candidate = next;
        fallbackUsed = true;
      }
    }

    // Every candidate (primary + fallback chain) failed.
    if (lastError instanceof AIGatewayError) throw lastError;
    throw new DegradedModeError(`All eligible models failed for task ${ctx.task}`);
  }

  /** Runs one model attempt end-to-end: budget reservation, concurrency, circuit breaker, retries, cost settlement. */
  private async attemptModel(ctx: AIRequestContext, model: ModelDescriptor, policy: import('../policy/PolicyEngine').EffectivePolicy, messages: AIRequestContext['messages']) {
    const { budgetEngine, concurrencyController, retryEngine, circuitBreaker, costCalculator, providerRegistry, emergencyControls } = this.deps;

    if (emergencyControls.isProviderDisabled(model.provider)) {
      throw new AIGatewayError(ErrorCategory.PROVIDER_ERROR, 'AI service is temporarily unavailable. Please try again later.', {
        internalDetail: `Provider ${model.provider} disabled by operator`,
        retryable: false,
      });
    }

    const maxOutputTokens = Math.min(ctx.maxOutputTokens ?? 1024, model.maxOutputTokens);
    const approxInputTokens = Math.ceil(messages.reduce((s, m) => s + m.content.length, 0) / 4);
    const estimatedCostUsd = costCalculator.preflightEstimate(model, approxInputTokens, maxOutputTokens);

    const scopes: Array<{ scope: BudgetScope; scopeRef: string }> = [
      { scope: BudgetScope.ORGANIZATION, scopeRef: ctx.organizationId },
      { scope: BudgetScope.FEATURE, scopeRef: ctx.feature },
    ];
    if (ctx.userId) scopes.push({ scope: BudgetScope.USER, scopeRef: ctx.userId });

    const reservation = budgetEngine.reserveAcrossScopes(scopes, estimatedCostUsd);
    if (!reservation.ok) {
      this.deps.auditLog.record('BUDGET_BLOCKED', { scope: reservation.blockedScope, estimatedCostUsd }, { organizationId: ctx.organizationId, target: ctx.requestId });
      throw new BudgetLimitError(`${reservation.blockedScope}`, `remaining $${reservation.remainingUsd?.toFixed(4)}`);
    }

    const concurrencyKey = `${model.provider}:${model.modelKey}`;
    const override = emergencyControls.getConcurrencyOverride(model.provider) ?? emergencyControls.getConcurrencyOverride(concurrencyKey);
    const effectiveLimit = override !== undefined ? Math.min(policy.maxConcurrency, override) : policy.maxConcurrency;

    const handle = await concurrencyController.acquire(concurrencyKey, effectiveLimit, { queueTimeoutMs: policy.timeoutMs * 2 });

    try {
      const circuitKey = concurrencyKey;
      const outcome = await retryEngine.execute(async () => {
        circuitBreaker.beforeCall(circuitKey, CIRCUIT_OPTS);
        try {
          const provider = providerRegistry.get(model.provider);
          const generateResult = await provider.generate({
            modelKey: model.modelKey,
            messages,
            maxOutputTokens,
            timeoutMs: policy.timeoutMs,
          });
          circuitBreaker.onSuccess(circuitKey);
          return generateResult;
        } catch (err) {
          circuitBreaker.onFailure(circuitKey, CIRCUIT_OPTS);
          throw normalizeError(err, model.provider);
        }
      }, { maxAttempts: policy.maxRetries + 1 });

      const cost = costCalculator.actual(model, outcome.result.usage, outcome.result.usageIsExact);
      for (const id of reservation.reservationIds) budgetEngine.settle(id, cost.usd / reservation.reservationIds.length);

      return { generateResult: outcome.result, cost, attempts: outcome.attempts };
    } catch (err) {
      for (const id of reservation.reservationIds) budgetEngine.release(id);
      throw err;
    } finally {
      handle.release();
    }
  }

  private checkIdempotency(organizationId: string, key: string): AIGatewayResult | undefined {
    const entry = this.idempotencyStore.get(`${organizationId}:${key}`);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      this.idempotencyStore.delete(`${organizationId}:${key}`);
      return undefined;
    }
    return entry.result;
  }

  private storeIdempotency(organizationId: string, key: string, result: AIGatewayResult): void {
    this.idempotencyStore.set(`${organizationId}:${key}`, { result, expiresAt: Date.now() + IDEMPOTENCY_TTL_MS });
  }

  private toFailureResult(ctx: AIRequestContext, err: unknown, start: number): AIGatewayResult {
    const normalized = err instanceof AIGatewayError ? err : normalizeError(err, 'gateway');
    const status = normalized.category === ErrorCategory.BUDGET_LIMIT || normalized.category === ErrorCategory.QUOTA_LIMIT || normalized.category === ErrorCategory.POLICY_REJECTION ? RequestStatus.BLOCKED : RequestStatus.FAILED;

    return {
      requestId: ctx.requestId,
      status,
      cacheHit: false,
      retries: 0,
      fallbackUsed: false,
      totalTimeMs: Date.now() - start,
      routingReasons: [],
      publicError: { category: normalized.category, message: normalized.message },
    };
  }

  private recordTelemetry(ctx: AIRequestContext, result: AIGatewayResult, start: number): void {
    this.deps.telemetry.record({
      requestId: ctx.requestId,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      feature: ctx.feature,
      task: ctx.task,
      status: result.status,
      provider: result.model?.provider,
      modelId: result.model?.id,
      routingReasons: result.routingReasons,
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
      totalTokens: result.usage?.totalTokens,
      costUsd: result.costUsd,
      costBasis: result.costBasis,
      totalTimeMs: result.totalTimeMs,
      retries: result.retries,
      cacheHit: result.cacheHit,
      errorCategory: result.publicError?.category,
      createdAt: new Date(start).toISOString(),
    });
  }
}
