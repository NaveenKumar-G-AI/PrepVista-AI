"""Normalized, provider-independent exception hierarchy.

Every provider adapter catches its own SDK's exceptions and re-raises one
of these instead. Nothing outside `app/ai/providers/` should ever catch a
provider SDK exception type directly -- that defeats the entire point of
having an abstraction layer.

None of these ever carry an API key, authorization header, or other
secret. See each class's docstring for what diagnostic metadata it does
carry.
"""

from __future__ import annotations

from app.ai.types import ProviderErrorInfo


class ProviderError(Exception):
    """Base class for every normalized provider-layer error.

    Carries diagnostic metadata that's safe to log: which provider/model
    was involved, the HTTP status code (if any), whether the failure is
    plausibly worth retrying, and the provider's own request ID (if any) --
    never prompt content, headers, or credentials.
    """

    code: str = "provider_error"
    default_retryable: bool = False

    def __init__(
        self,
        message: str,
        *,
        provider: str,
        model: str | None = None,
        status_code: int | None = None,
        retryable: bool | None = None,
        provider_request_id: str | None = None,
    ) -> None:
        super().__init__(message)
        self.provider = provider
        self.model = model
        self.status_code = status_code
        self.retryable = self.default_retryable if retryable is None else retryable
        self.provider_request_id = provider_request_id

    def to_info(self) -> ProviderErrorInfo:
        """A serializable summary suitable for an `ErrorEvent` or a log line."""
        return ProviderErrorInfo(
            code=self.code,
            message=str(self),
            provider=self.provider,
            model=self.model,
            status_code=self.status_code,
            retryable=self.retryable,
            provider_request_id=self.provider_request_id,
        )


class AuthenticationError(ProviderError):
    """The provider rejected the API key. Not retryable without operator action."""

    code = "authentication_error"
    default_retryable = False


class RateLimitError(ProviderError):
    """The provider throttled the request. Potentially retryable after backoff."""

    code = "rate_limit_error"
    default_retryable = True


class ProviderTimeoutError(ProviderError):
    """The request exceeded its configured timeout.

    Named `ProviderTimeoutError` rather than `TimeoutError` to avoid
    shadowing the Python builtin of the same name.
    """

    code = "timeout_error"
    default_retryable = True


class InvalidRequestError(ProviderError):
    """The provider rejected the request as malformed. Not retryable as-is."""

    code = "invalid_request_error"
    default_retryable = False


class ModelNotFoundError(ProviderError):
    """The requested model identifier is unknown to the provider."""

    code = "model_not_found_error"
    default_retryable = False


class ProviderUnavailableError(ProviderError):
    """The provider is down or returned a transient server-side failure."""

    code = "provider_unavailable_error"
    default_retryable = True


class MalformedResponseError(ProviderError):
    """The provider returned a response this adapter could not parse/normalize."""

    code = "malformed_response_error"
    default_retryable = False


class ConfigurationError(ProviderError):
    """The provider adapter itself is misconfigured (e.g. no API key set).

    Distinct from every error above: those describe a real interaction
    with the provider that failed; this means the request was never sent
    because required local configuration is missing.
    """

    code = "configuration_error"
    default_retryable = False


class ProviderNotRegisteredError(LookupError):
    """Raised by `ProviderRegistry.get()` for an unknown provider name.

    Deliberately not a `ProviderError` subclass: no provider was ever
    contacted, so there is nothing provider-specific to report.
    """

    def __init__(self, name: str, *, available: list[str]) -> None:
        self.name = name
        self.available = available
        super().__init__(
            f"No provider registered as {name!r}. Available providers: "
            f"{', '.join(sorted(available)) or '(none registered)'}."
        )
