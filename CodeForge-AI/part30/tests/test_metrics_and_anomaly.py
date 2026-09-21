from decimal import Decimal

import pytest

from ai_gateway.telemetry.anomaly import AnomalyKind, detect_anomaly, forecast_cost, forecast_cost_at_volume
from ai_gateway.telemetry.metrics import InsufficientSampleError, percentile


def test_percentile_basic():
    values = list(range(1, 101))  # 1..100
    assert percentile(values, 50) == 50
    assert percentile(values, 90) == 90
    assert percentile(values, 99) == 99


def test_percentile_refuses_thin_samples():
    with pytest.raises(InsufficientSampleError):
        percentile([1.0, 2.0], 95, min_sample_size=5)


def test_percentile_rejects_out_of_range_p():
    with pytest.raises(ValueError):
        percentile(list(range(10)), 150)


def test_anomaly_detection_flags_large_deviation():
    baseline = [100.0] * 20  # perfectly stable baseline
    result = detect_anomaly(AnomalyKind.TOKENS, observed_value=500.0, baseline_values=baseline)
    assert result.is_anomalous is True


def test_anomaly_detection_does_not_flag_normal_variation():
    baseline = [95.0, 100.0, 105.0, 98.0, 102.0, 99.0, 101.0, 97.0, 103.0, 100.0]
    result = detect_anomaly(AnomalyKind.LATENCY, observed_value=101.0, baseline_values=baseline)
    assert result.is_anomalous is False


def test_anomaly_detection_reports_thin_baseline_honestly():
    result = detect_anomaly(AnomalyKind.COST, observed_value=500.0, baseline_values=[1.0, 2.0], min_baseline_samples=10)
    assert result.is_anomalous is False
    assert result.baseline_sample_size == 2
    assert "too thin" in result.reason


def test_forecast_requires_minimum_history():
    with pytest.raises(ValueError):
        forecast_cost([Decimal("1.0"), Decimal("2.0")], period_days=30, period_label="monthly")


def test_forecast_is_labeled_forecast_not_actual():
    daily = [Decimal("10.00")] * 7
    result = forecast_cost(daily, period_days=30, period_label="monthly")
    assert result.confidence.value == "FORECAST"
    assert result.projected_cost_usd == Decimal("300.00")


def test_forecast_at_volume_scales_linearly():
    result = forecast_cost_at_volume(
        current_daily_cost_usd=Decimal("100.00"), current_daily_active_users=1000, projected_active_users=5000,
    )
    assert result.projected_cost_usd == Decimal("500.00")
