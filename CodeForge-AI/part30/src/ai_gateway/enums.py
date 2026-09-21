"""
Shared enumerations for the CodeForge AI Gateway.

These are intentionally centralized so that no other module (and no caller
in the wider CodeForge codebase) invents its own ad-hoc strings for these
concepts. Business logic should import from here, never hardcode literals.
"""

from enum import Enum


class TaskComplexity(str, Enum):
    """How demanding an AI operation actually is, in product terms.

    NOTE: These levels must be assigned per-operation by someone who has
    inspected the real CodeForge feature behavior (see policy/policy.py).
    This enum only defines the vocabulary; it does not decide which
    operation gets which level.
    """

    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class Priority(str, Enum):
    CRITICAL = "CRITICAL"
    INTERACTIVE = "INTERACTIVE"
    NORMAL = "NORMAL"
    BACKGROUND = "BACKGROUND"
    BATCH = "BATCH"


class QualityClass(str, Enum):
    """Ordered from weakest to strongest. Order matters for quality-floor
    comparisons in routing/router.py — do not reorder without updating
    _QUALITY_ORDER there."""

    BASIC = "BASIC"
    STANDARD = "STANDARD"
    ADVANCED = "ADVANCED"
    FRONTIER = "FRONTIER"


class LatencyClass(str, Enum):
    FAST = "FAST"
    STANDARD = "STANDARD"
    SLOW = "SLOW"


class RequestType(str, Enum):
    INTERACTIVE = "INTERACTIVE"
    BACKGROUND = "BACKGROUND"
    BATCH = "BATCH"


class Environment(str, Enum):
    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"


class RequestStatus(str, Enum):
    """Full request lifecycle. See request/lifecycle.py for the transition
    table that governs which moves are legal."""

    CREATED = "CREATED"
    VALIDATED = "VALIDATED"
    POLICY_EVALUATED = "POLICY_EVALUATED"
    CACHE_CHECKED = "CACHE_CHECKED"
    MODEL_SELECTED = "MODEL_SELECTED"
    PROVIDER_SELECTED = "PROVIDER_SELECTED"
    STARTED = "STARTED"
    COMPLETED = "COMPLETED"
    # failure / exceptional states
    TIMEOUT = "TIMEOUT"
    RETRYING = "RETRYING"
    FALLBACK = "FALLBACK"
    RATE_LIMITED = "RATE_LIMITED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"
    FAILED = "FAILED"


class CircuitState(str, Enum):
    HEALTHY = "HEALTHY"
    DEGRADED = "DEGRADED"
    OPEN = "OPEN"
    RECOVERY_CHECK = "RECOVERY_CHECK"


class BudgetScope(str, Enum):
    PLATFORM = "PLATFORM"
    ORGANIZATION = "ORGANIZATION"
    FEATURE = "FEATURE"
    USER = "USER"


class BudgetStatus(str, Enum):
    OK = "OK"
    APPROACHING = "APPROACHING"
    OPTIMIZATION_REQUIRED = "OPTIMIZATION_REQUIRED"
    EXCEEDED = "EXCEEDED"
