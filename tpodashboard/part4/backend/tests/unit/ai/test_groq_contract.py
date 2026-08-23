"""Runs the shared provider contract suite against `GroqProvider`."""

from __future__ import annotations

import pytest

from app.ai.providers.groq import GroqProvider
from app.ai.types import Message, ModelRequest, Role
from tests.unit.ai.contract import ProviderContractTests
from tests.unit.ai.fakes import openai_compatible_client_for_scenario


class TestGroqContract(ProviderContractTests):
    @pytest.fixture
    def provider_factory(self):  # type: ignore[no-untyped-def]
        def _factory(scenario: str) -> tuple[GroqProvider, ModelRequest]:
            client = openai_compatible_client_for_scenario(scenario)
            provider = GroqProvider(api_key=None, client=client)
            request = ModelRequest(
                messages=[Message(role=Role.user, content="Say hi")], model="llama-contract"
            )
            return provider, request

        return _factory
