"""Concrete `ModelProvider` adapters.

Import these directly only from `app.ai.registry` (lazily, inside
`build_default_registry`) or from tests. Everything else in the
application should obtain a provider through
`app.ai.registry.ProviderRegistry.get(name)`.
"""
