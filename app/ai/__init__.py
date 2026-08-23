"""
PrepVista AI — Provider-independent AI connectivity layer.
Ported from Part 4 of the TPO Dashboard AI Provider System.

Quick start:
    from app.ai.registry import get_registry
    provider = get_registry().get("groq")
    response = await provider.generate(request)

Do NOT import concrete adapter classes (GroqAdapter, OpenAIAdapter, etc.)
directly from outside this package — always go through the registry.
"""
from app.ai.provider  import ModelProvider, ProviderHealth, ProviderHealthStatus
from app.ai.registry  import ProviderRegistry, get_registry
from app.ai.types     import ModelRequest, ModelResponse, Message, Role, Usage
from app.ai.errors    import ProviderError, ConfigurationError, RateLimitError

__all__ = [
    "ModelProvider", "ProviderHealth", "ProviderHealthStatus",
    "ProviderRegistry", "get_registry",
    "ModelRequest", "ModelResponse", "Message", "Role", "Usage",
    "ProviderError", "ConfigurationError", "RateLimitError",
]