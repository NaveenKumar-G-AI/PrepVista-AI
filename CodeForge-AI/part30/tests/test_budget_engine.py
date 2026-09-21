from decimal import Decimal

import pytest

from ai_gateway.cost.budget_engine import BudgetConfig, BudgetEngine
from ai_gateway.enums import BudgetScope, BudgetStatus


def test_status_progresses_through_thresholds():
    engine = BudgetEngine()
    engine.register(BudgetConfig(
        scope=BudgetScope.FEATURE, key="code_coach", period_limit_usd=Decimal("100"),
        approaching_threshold_pct=Decimal("0.75"), optimization_threshold_pct=Decimal("0.90"),
    ))

    assert engine.check(BudgetScope.FEATURE, "code_coach").status == BudgetStatus.OK

    engine.record_spend(BudgetScope.FEATURE, "code_coach", Decimal("76"))
    assert engine.check(BudgetScope.FEATURE, "code_coach").status == BudgetStatus.APPROACHING

    engine.record_spend(BudgetScope.FEATURE, "code_coach", Decimal("15"))  # total 91
    assert engine.check(BudgetScope.FEATURE, "code_coach").status == BudgetStatus.OPTIMIZATION_REQUIRED

    engine.record_spend(BudgetScope.FEATURE, "code_coach", Decimal("10"))  # total 101
    assert engine.check(BudgetScope.FEATURE, "code_coach").status == BudgetStatus.EXCEEDED


def test_worst_status_across_multiple_scopes_wins():
    engine = BudgetEngine()
    engine.register(BudgetConfig(scope=BudgetScope.PLATFORM, key="platform", period_limit_usd=Decimal("10000")))
    engine.register(BudgetConfig(scope=BudgetScope.USER, key="student_42", period_limit_usd=Decimal("1")))
    engine.record_spend(BudgetScope.USER, "student_42", Decimal("1.50"))  # this user is over budget

    worst = engine.worst_status([(BudgetScope.PLATFORM, "platform"), (BudgetScope.USER, "student_42")])
    assert worst == BudgetStatus.EXCEEDED


def test_missing_budget_scope_is_ignored_in_worst_status():
    engine = BudgetEngine()
    engine.register(BudgetConfig(scope=BudgetScope.PLATFORM, key="platform", period_limit_usd=Decimal("100")))
    # ORGANIZATION scope was never registered for this org — should not crash, should just be skipped
    worst = engine.worst_status([(BudgetScope.PLATFORM, "platform"), (BudgetScope.ORGANIZATION, "unregistered_org")])
    assert worst == BudgetStatus.OK


def test_degradation_ladder_is_cumulative_and_never_empty_at_exceeded():
    actions_ok = BudgetEngine.degradation_actions(BudgetStatus.OK)
    actions_approaching = BudgetEngine.degradation_actions(BudgetStatus.APPROACHING)
    actions_optimize = BudgetEngine.degradation_actions(BudgetStatus.OPTIMIZATION_REQUIRED)
    actions_exceeded = BudgetEngine.degradation_actions(BudgetStatus.EXCEEDED)

    assert actions_ok == []
    assert set(actions_approaching).issubset(set(actions_optimize))
    assert set(actions_optimize).issubset(set(actions_exceeded))
    assert "preserve_critical_only" in actions_exceeded
    assert "preserve_critical_only" not in actions_optimize, "product must degrade gradually, not disable everything at once"


def test_unregistered_scope_raises_on_direct_check():
    engine = BudgetEngine()
    with pytest.raises(KeyError):
        engine.check(BudgetScope.FEATURE, "never_registered")


def test_zero_limit_budget_is_exceeded_by_any_spend():
    engine = BudgetEngine()
    engine.register(BudgetConfig(scope=BudgetScope.FEATURE, key="disabled_feature", period_limit_usd=Decimal("0")))
    assert engine.check(BudgetScope.FEATURE, "disabled_feature").status == BudgetStatus.OK
    engine.record_spend(BudgetScope.FEATURE, "disabled_feature", Decimal("0.01"))
    assert engine.check(BudgetScope.FEATURE, "disabled_feature").status == BudgetStatus.EXCEEDED


def test_invalid_threshold_ordering_rejected():
    with pytest.raises(ValueError):
        BudgetConfig(
            scope=BudgetScope.FEATURE, key="x", period_limit_usd=Decimal("10"),
            approaching_threshold_pct=Decimal("0.9"), optimization_threshold_pct=Decimal("0.5"),
        )
