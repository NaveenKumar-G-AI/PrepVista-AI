"""
PrepVista AI — Normalized, provider-independent exception hierarchy.
Ported from Part 4. Every adapter catches SDK exceptions and re-raises one of these.
"""
from __future__ import annotations
from app.ai.types import ProviderErrorInfo


class ProviderError(Exception):
    code: str = "provider_error"
    default_retryable: bool = False

    def __init__(self, message: str, *, provider: str, model: str | None = None,
                 status_code: int | None = None, retryable: bool | None = None,
                 provider_request_id: str | None = None) -> None:
        super().__init__(message)
        self.provider            = provider
        self.model               = model
        self.status_code         = status_code
        self.retryable           = self.default_retryable if retryable is None else retryable
        self.provider_request_id = provider_request_id

    def to_info(self) -> ProviderErrorInfo:
        return ProviderErrorInfo(
            code=self.code, message=str(self), provider=self.provider,
            model=self.model, status_code=self.status_code,
            retryable=self.retryable, provider_request_id=self.provider_request_id,
        )


class AuthenticationError(ProviderError):
    code = "authentication_error"
    default_retryable = False


class RateLimitError(ProviderError):
    code = "rate_limit_error"
    default_retryable = True


class ProviderTimeoutError(ProviderError):
    code = "timeout_error"
    default_retryable = True


class InvalidRequestError(ProviderError):
    code = "invalid_request_error"
    default_retryable = False


class ModelNotFoundError(ProviderError):
    code = "model_not_found_error"
    default_retryable = False


class ProviderUnavailableError(ProviderError):
    code = "provider_unavailable_error"
    default_retryable = True


class MalformedResponseError(ProviderError):
    code = "malformed_response_error"
    default_retryable = False


class ConfigurationError(ProviderError):
    code = "configuration_error"
    default_retryable = False


class ProviderNotRegisteredError(LookupError):
    def __init__(self, name: str, *, available: list[str]) -> None:
        self.name      = name
        self.available = available
        super().__init__(
            f"No provider registered as {name!r}. "
            f"Available: {', '.join(sorted(available)) or '(none)'}."
        )