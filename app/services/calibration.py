"""
PrepVista AI — Placement Probability Calibration (Fix 3)
========================================================
Turns real, TPO-submitted hiring outcomes into the logistic-curve parameters
(bar, steepness) that placement_readiness uses to estimate hiring probability.

Pipeline
--------
1. TPOs submit outcomes via /api/outcomes/submit  -> placement_outcomes table
   (session_id, company_name, placed=True/False).
2. calibrate_company_parameters(company) pulls every labelled outcome for a
   company, reconstructs the same emphasis-weighted competency score
   placement_readiness computes live (from that session's question_evaluations),
   and fits (bar, steepness) that minimise log-loss between predicted
   probability and the actual placed label — using scipy.optimize.minimize.
3. Fitted params (>= MIN_SAMPLES outcomes) are written to placement_parameters.
4. load_calibrated_parameters() reads placement_parameters and pushes the values
   into placement_readiness via set_calibration_overrides(), cached with a
   1-hour TTL. Below MIN_SAMPLES a company keeps its hardcoded heuristic.

Why scores come from question_evaluations, not a "session_summary" table
------------------------------------------------------------------------
placement_readiness's live numbers are derived from each session's
question_evaluations (category_averages_from_evaluations -> pillars ->
emphasis-weighted score). Calibrating against that exact same signal keeps the
fit consistent with what students/TPOs actually see, with no dependency on a
denormalised summary table.

Dependency note
---------------
scipy + numpy are imported lazily inside the fit so that importing this module
(and the outcomes router) never fails if the scientific stack is not yet
installed. Calibration simply reports "unavailable" until scipy is present;
load_calibrated_parameters() and the live readiness path keep working on the
hardcoded heuristics regardless.
"""

from __future__ import annotations

import time

import structlog

from app.database.connection import DatabaseConnection
from app.services.placement_readiness import (
    COMPANY_PROFILES,
    _weighted_mean,
    compute_pillar_scores,
    category_averages_from_evaluations,
    set_calibration_overrides,
)

logger = structlog.get_logger("prepvista.calibration")

# Below this many labelled outcomes a logistic fit is statistically meaningless
# and would overfit noise — keep the hardcoded heuristic instead (Fix 3 §3).
MIN_SAMPLES = 30

# load_calibrated_parameters() refreshes the in-process override registry at
# most once per hour (Fix 3 §4). Cheap, and recalibration explicitly forces a
# refresh after writing new params.
_CACHE_TTL_SECONDS = 3600.0
_last_loaded_at: float = 0.0
_cached_overrides: dict[str, dict] = {}

# Probability is clamped before log-loss so a perfectly-separating fit cannot
# produce log(0) = -inf and blow up the optimiser.
_EPS = 1e-6


def _emphasis_for_company(company_name: str) -> dict[str, float] | None:
    for profile in COMPANY_PROFILES:
        if profile.name.lower() == (company_name or "").strip().lower():
            return profile.emphasis
    return None


def _session_weighted_score(evaluations: list[dict], emphasis: dict[str, float]) -> float | None:
    """Reconstruct the emphasis-weighted competency score for one session.

    Mirrors placement_readiness.compute_hiring_probabilities: per-question
    evaluations -> 0-100 category averages -> 5 pillars -> emphasis-weighted
    mean. Returns None when a session has no usable scored data.
    """
    category_averages = category_averages_from_evaluations(evaluations)
    pillars = compute_pillar_scores(category_averages)
    if not pillars:
        return None
    return _weighted_mean(pillars, emphasis)


async def _load_company_dataset(company_name: str) -> list[tuple[float, int]]:
    """Return [(weighted_score, placed_int), ...] for one company's outcomes.

    One DB round-trip pulls every labelled outcome joined to that session's
    question_evaluations; scores are reconstructed in Python so the fit uses the
    identical signal the live report shows.
    """
    emphasis = _emphasis_for_company(company_name)
    if emphasis is None:
        return []

    async with DatabaseConnection() as conn:
        rows = await conn.fetch(
            """
            SELECT o.session_id,
                   o.placed,
                   qe.rubric_category,
                   qe.score
            FROM placement_outcomes o
            JOIN question_evaluations qe ON qe.session_id = o.session_id
            WHERE o.company_name = $1
              AND o.placed IS NOT NULL
              AND o.session_id IS NOT NULL
            ORDER BY o.session_id
            """,
            company_name,
        )

    # Group evaluation rows by session.
    by_session: dict[object, dict] = {}
    for row in rows:
        sid = row["session_id"]
        bucket = by_session.setdefault(sid, {"placed": bool(row["placed"]), "evals": []})
        bucket["evals"].append({"rubric_category": row["rubric_category"], "score": row["score"]})

    dataset: list[tuple[float, int]] = []
    for bucket in by_session.values():
        weighted = _session_weighted_score(bucket["evals"], emphasis)
        if weighted is None:
            continue
        dataset.append((float(weighted), 1 if bucket["placed"] else 0))
    return dataset


def _fit_logistic(dataset: list[tuple[float, int]]) -> tuple[float, float] | None:
    """Fit (bar, steepness) minimising log-loss. Returns None if scipy is
    unavailable or the optimiser fails. Pure/synchronous — call off the loop if
    datasets ever grow large; for hundreds of outcomes this is sub-millisecond.
    """
    try:
        import numpy as np
        from scipy.optimize import minimize
    except Exception as exc:  # noqa: BLE001
        logger.warning("calibration_scipy_unavailable", error=str(exc))
        return None

    x = np.array([d[0] for d in dataset], dtype=float)
    y = np.array([d[1] for d in dataset], dtype=float)

    def neg_log_loss(params: "np.ndarray") -> float:
        bar, steepness = params
        # p = sigmoid(steepness * (x - bar))
        z = steepness * (x - bar)
        p = 1.0 / (1.0 + np.exp(-z))
        p = np.clip(p, _EPS, 1.0 - _EPS)
        return float(-np.mean(y * np.log(p) + (1.0 - y) * np.log(1.0 - p)))

    # Seed from a reasonable mid-range bar and the typical heuristic steepness.
    x0 = np.array([float(np.median(x)) if len(x) else 60.0, 0.09])
    bounds = [(20.0, 95.0), (0.01, 0.5)]
    try:
        result = minimize(neg_log_loss, x0, method="L-BFGS-B", bounds=bounds)
    except Exception as exc:  # noqa: BLE001
        logger.warning("calibration_optimise_failed", error=str(exc))
        return None

    if not getattr(result, "success", False):
        logger.warning("calibration_did_not_converge", message=str(getattr(result, "message", "")))
        # Even a non-"success" result can be usable; accept it if finite.
    bar, steepness = float(result.x[0]), float(result.x[1])
    if not (steepness > 0) or bar != bar or steepness != steepness:  # NaN guard
        return None
    return bar, steepness


async def calibrate_company_parameters(company_name: str) -> dict:
    """Fit and persist (bar, steepness) for one company from real outcomes.

    Returns a status dict:
        {"company", "status", "sample_n", "bar"?, "steepness"?}
      status: "calibrated" | "insufficient_data" | "no_company" |
              "scipy_unavailable" | "fit_failed"

    Below MIN_SAMPLES the company keeps its hardcoded heuristic and nothing is
    written. On success the fitted params are upserted into placement_parameters
    and the override registry is refreshed immediately.
    """
    company_name = (company_name or "").strip()
    if _emphasis_for_company(company_name) is None:
        return {"company": company_name, "status": "no_company", "sample_n": 0}

    dataset = await _load_company_dataset(company_name)
    sample_n = len(dataset)
    if sample_n < MIN_SAMPLES:
        return {"company": company_name, "status": "insufficient_data", "sample_n": sample_n}

    fitted = _fit_logistic(dataset)
    if fitted is None:
        # Distinguish "scipy missing" from "fit failed" for operator clarity.
        try:
            import scipy  # noqa: F401
        except Exception:
            return {"company": company_name, "status": "scipy_unavailable", "sample_n": sample_n}
        return {"company": company_name, "status": "fit_failed", "sample_n": sample_n}

    bar, steepness = fitted
    async with DatabaseConnection() as conn:
        await conn.execute(
            """
            INSERT INTO placement_parameters (company, bar, steepness, sample_n, calibrated_at)
            VALUES ($1, $2, $3, $4, now())
            ON CONFLICT (company) DO UPDATE
                SET bar = EXCLUDED.bar,
                    steepness = EXCLUDED.steepness,
                    sample_n = EXCLUDED.sample_n,
                    calibrated_at = now()
            """,
            company_name, bar, steepness, sample_n,
        )

    logger.info(
        "company_calibrated",
        company=company_name, bar=round(bar, 3), steepness=round(steepness, 4), sample_n=sample_n,
    )
    # Push the new value into the live readiness path right away.
    await load_calibrated_parameters(force=True)
    return {
        "company": company_name,
        "status": "calibrated",
        "sample_n": sample_n,
        "bar": round(bar, 3),
        "steepness": round(steepness, 4),
    }


async def load_calibrated_parameters(force: bool = False) -> dict[str, dict]:
    """Load placement_parameters into the readiness override registry.

    Cached with a 1-hour TTL (Fix 3 §4). `force=True` bypasses the TTL — used
    right after a recalibration writes new rows. On any DB error the existing
    overrides are left in place (fail-safe: never wipe good calibration because
    of one failed read).
    """
    global _last_loaded_at, _cached_overrides

    now = time.monotonic()
    if not force and (now - _last_loaded_at) < _CACHE_TTL_SECONDS and _cached_overrides:
        return _cached_overrides

    try:
        async with DatabaseConnection() as conn:
            rows = await conn.fetch(
                "SELECT company, bar, steepness, sample_n FROM placement_parameters"
            )
    except Exception as exc:  # noqa: BLE001
        logger.warning("calibration_load_failed", error=str(exc))
        return _cached_overrides

    overrides = {
        row["company"]: {
            "bar": float(row["bar"]),
            "steepness": float(row["steepness"]),
            "sample_n": int(row["sample_n"] or 0),
        }
        for row in rows
    }
    set_calibration_overrides(overrides)
    _cached_overrides = overrides
    _last_loaded_at = now
    logger.info("calibration_parameters_loaded", companies=len(overrides))
    return overrides
