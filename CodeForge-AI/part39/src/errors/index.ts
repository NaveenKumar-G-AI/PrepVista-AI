import { ErrorCategory } from '../types';

/**
 * Base class for every error the gateway raises internally. Carries a
 * normalized category (see ErrorTaxonomy) and a message that is always
 * safe to show a caller — raw provider errors are never surfaced directly;
 * see toPublicMessage().
 */
export class AIGatewayError extends Error {
  readonly category: ErrorCategory;
  readonly retryable: boolean;
  /** Extra diagnostic detail — safe for internal logs/admin views, not for end users. */
  readonly internalDetail?: string;

  constructor(category: ErrorCategory, publicMessage: string, opts?: { internalDetail?: string; retryable?: boolean }) {
    super(publicMessage);
    this.name = 'AIGatewayError';
    this.category = category;
    this.retryable = opts?.retryable ?? false;
    this.internalDetail = opts?.internalDetail;
  }
}

export class BudgetLimitError extends AIGatewayError {
  constructor(scope: string, internalDetail?: string) {
    super(ErrorCategory.BUDGET_LIMIT, 'AI service is temporarily unavailable due to budget limits. Please try again later.', {
      internalDetail: internalDetail ?? `Budget exhausted for scope: ${scope}`,
      retryable: false,
    });
    this.name = 'BudgetLimitError';
  }
}

export class QuotaLimitError extends AIGatewayError {
  constructor(scope: string) {
    super(ErrorCategory.QUOTA_LIMIT, 'You have reached your usage limit for this feature. Please try again later.', {
      internalDetail: `Quota exhausted for scope: ${scope}`,
      retryable: false,
    });
    this.name = 'QuotaLimitError';
  }
}

export class PolicyRejectionError extends AIGatewayError {
  constructor(reason: string) {
    super(ErrorCategory.POLICY_REJECTION, 'This request cannot be completed under current AI policy settings.', {
      internalDetail: reason,
      retryable: false,
    });
    this.name = 'PolicyRejectionError';
  }
}

export class NoEligibleModelError extends AIGatewayError {
  constructor(task: string, internalDetail?: string) {
    super(ErrorCategory.POLICY_REJECTION, 'AI service is temporarily unavailable for this type of request.', {
      internalDetail: internalDetail ?? `No eligible model for task: ${task}`,
      retryable: false,
    });
    this.name = 'NoEligibleModelError';
  }
}

export class CircuitOpenError extends AIGatewayError {
  constructor(key: string) {
    super(ErrorCategory.CIRCUIT_OPEN, 'AI service is temporarily unavailable. Please try again shortly.', {
      internalDetail: `Circuit open for: ${key}`,
      retryable: true,
    });
    this.name = 'CircuitOpenError';
  }
}

export class ProviderTimeoutError extends AIGatewayError {
  constructor(provider: string, timeoutMs: number) {
    super(ErrorCategory.TIMEOUT, 'AI service is taking too long to respond. Please try again.', {
      internalDetail: `${provider} exceeded ${timeoutMs}ms timeout`,
      retryable: true,
    });
    this.name = 'ProviderTimeoutError';
  }
}

export class ContentValidationError extends AIGatewayError {
  constructor(internalDetail: string) {
    super(ErrorCategory.CONTENT_VALIDATION, 'The AI response could not be validated. Please try again.', {
      internalDetail,
      retryable: true,
    });
    this.name = 'ContentValidationError';
  }
}

export class DegradedModeError extends AIGatewayError {
  constructor(internalDetail: string) {
    super(ErrorCategory.PROVIDER_ERROR, 'AI features are temporarily unavailable. The rest of CodeForge is unaffected.', {
      internalDetail,
      retryable: false,
    });
    this.name = 'DegradedModeError';
  }
}

/**
 * Normalizes an arbitrary caught error (provider SDK error, network error,
 * etc.) into an AIGatewayError. This is the single seam through which every
 * provider-specific error shape must pass before the rest of the gateway
 * ever sees it.
 */
export function normalizeError(err: unknown, providerName: string): AIGatewayError {
  if (err instanceof AIGatewayError) return err;

  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  if (lower.includes('timeout') || lower.includes('timed out')) {
    return new AIGatewayError(ErrorCategory.TIMEOUT, 'AI service is taking too long to respond. Please try again.', {
      internalDetail: `${providerName}: ${message}`,
      retryable: true,
    });
  }
  if (lower.includes('rate limit') || lower.includes('429')) {
    return new AIGatewayError(ErrorCategory.RATE_LIMIT, 'AI service is busy right now. Please try again shortly.', {
      internalDetail: `${providerName}: ${message}`,
      retryable: true,
    });
  }
  if (lower.includes('unauthorized') || lower.includes('401') || lower.includes('invalid api key') || lower.includes('authentication')) {
    return new AIGatewayError(ErrorCategory.AUTHENTICATION, 'AI service is temporarily unavailable. Please try again later.', {
      internalDetail: `${providerName}: ${message}`,
      retryable: false,
    });
  }
  if (lower.includes('econnreset') || lower.includes('enotfound') || lower.includes('network') || lower.includes('fetch failed')) {
    return new AIGatewayError(ErrorCategory.NETWORK_ERROR, 'AI service is temporarily unreachable. Please try again.', {
      internalDetail: `${providerName}: ${message}`,
      retryable: true,
    });
  }
  if (lower.includes('400') || lower.includes('invalid request') || lower.includes('validation')) {
    return new AIGatewayError(ErrorCategory.INVALID_REQUEST, 'This request could not be processed.', {
      internalDetail: `${providerName}: ${message}`,
      retryable: false,
    });
  }

  return new AIGatewayError(ErrorCategory.UNKNOWN, 'AI service is temporarily unavailable. Please try again.', {
    internalDetail: `${providerName}: ${message}`,
    retryable: false,
  });
}

/** Redacts common secret-shaped keys recursively. Used before anything is logged. */
const SECRET_KEY_PATTERN = /api[-_]?key|authorization|auth[-_]?token|secret|password|bearer|credential/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[REDACTED_DEPTH_LIMIT]';
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY_PATTERN.test(k) ? '[REDACTED]' : redact(v, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string' && /^(sk-|Bearer\s)/i.test(value)) {
    return '[REDACTED]';
  }
  return value;
}
