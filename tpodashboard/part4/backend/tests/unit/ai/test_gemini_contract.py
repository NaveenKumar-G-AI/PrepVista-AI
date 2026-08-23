"""Runs the shared provider contract suite against `GeminiProvider`."""

from __future__ import annotations

import pytest

from app.ai.providers.gemini import GeminiProvider
from app.ai.types import Message, ModelRequest, Role
from tests.unit.ai.contract import ProviderContractTests
from tests.unit.ai.fakes import gemini_client_for_scenario


class TestGeminiContract(ProviderContractTests):
    @pytest.fixture
    def provider_factory(self):  # type: ignore[no-untyped-def]
        def _factory(scenario: str) -> tuple[GeminiProvider, ModelRequest]:
            client = gemini_client_for_scenario(scenario)
            provider = GeminiProvider(api_key=None, client=client)
            request = ModelRequest(
                messages=[Message(role=Role.user, content="Say hi")], model="gemini-contract"
            )
            return provider, request

        return _factory
