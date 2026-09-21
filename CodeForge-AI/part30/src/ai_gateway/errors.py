"""
Exception hierarchy for the AI Gateway.

The split between TransientProviderError and PermanentProviderError is load
bearing: resilience/retry.py retries the former and never retries the
latter (Feature 26 — "do not repeatedly retry permanent failures").
"""


class AIGatewayError(Exception):
    """Base class for every error raised by the gateway."""


# ---- Provider-level errors -------------------------------------------------

class TransientProviderError(AIGatewayError):
    """Worth retrying: the same request might succeed a moment later."""


class ProviderTimeoutError(TransientProviderError):
    pass


class ProviderRateLimitError(TransientProviderError):
    def __init__(self, message: str, retry_after_s: float | None = None):
        super().__init__(message)
        self.retry_after_s = retry_after_s


class ProviderServerError(TransientProviderError):
    """5xx-equivalent from the provider."""


class PermanentProviderError(AIGatewayError):
    """Not worth retrying: the request itself is the problem."""


class ProviderAuthError(PermanentProviderError):
    pass


class ProviderInvalidRequestError(PermanentProviderError):
    pass


class ModelNotSupportedError(PermanentProviderError):
    pass


# ---- Policy / gateway-level errors -----------------------------------------

class PolicyRejectionError(AIGatewayError):
    """The gateway refused to even attempt the request."""


class QualityFloorViolationError(PolicyRejectionError):
    pass


class BudgetExceededError(PolicyRejectionError):
    pass


class NoEligibleModelError(PolicyRejectionError):
    pass


class UnknownOperationError(PolicyRejectionError):
    """Raised when a caller invokes an operation with no registered
    OperationPolicy. The gateway must never silently invent defaults for
    an operation nobody has classified (Feature 11)."""


class CircuitOpenError(AIGatewayError):
    pass


class RateLimitExceededError(AIGatewayError):
    pass


class OutputValidationError(AIGatewayError):
    def __init__(self, message: str, raw_output: str | None = None):
        super().__init__(message)
        self.raw_output = raw_output


class IdempotencyConflictError(AIGatewayError):
    """A different result is already in flight or recorded for this
    idempotency key."""
