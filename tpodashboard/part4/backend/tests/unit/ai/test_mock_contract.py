"""Runs the shared provider contract suite against `MockModelProvider`."""

from __future__ import annotations

import pytest

from app.ai.providers.mock import MockModelProvider
from app.ai.types import Message, ModelRequest, Role
from tests.unit.ai.contract import ProviderContractTests

_SCENARIO_MAP = {
    "success": "normal",
    "tool_call": "tool_call",
    "rate_limit": "rate_limit",
    "timeout": "timeout",
}


class TestMockContract(ProviderContractTests):
    @pytest.fixture
    def provider_factory(self):  # type: ignore[no-untyped-def]
        def _factory(scenario: str) -> tuple[MockModelProvider, ModelRequest]:
            provider = MockModelProvider()
            request = ModelRequest(
                messages=[Message(role=Role.user, content="Say hi")],
                model="mock-model",
                metadata={"mock_scenario": _SCENARIO_MAP[scenario]},
            )
            return provider, request

        return _factory
