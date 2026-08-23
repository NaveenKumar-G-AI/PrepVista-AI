"""Runs the shared provider contract suite against `OpenRouterProvider`."""

from __future__ import annotations

import pytest

from app.ai.providers.openrouter import OpenRouterProvider
from app.ai.types import Message, ModelRequest, Role
from tests.unit.ai.contract import ProviderContractTests
from tests.unit.ai.fakes import openai_compatible_client_for_scenario


class TestOpenRouterContract(ProviderContractTests):
    @pytest.fixture
    def provider_factory(self):  # type: ignore[no-untyped-def]
        def _factory(scenario: str) -> tuple[OpenRouterProvider, ModelRequest]:
            client = openai_compatible_client_for_scenario(scenario)
            provider = OpenRouterProvider(api_key=None, client=client)
            request = ModelRequest(
                messages=[Message(role=Role.user, content="Say hi")], model="openai/gpt-contract"
            )
            return provider, request

        return _factory
