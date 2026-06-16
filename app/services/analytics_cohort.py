"""
PrepVista AI - Analytics Cohort
Extracted from analytics.py - B2B/TPO cohort performance aggregations.

Re-exported by analytics.py (barrel file) for backward compatibility.
"""

from __future__ import annotations

import json
import math
from datetime import datetime, date, timezone, timedelta
from collections import defaultdict
from statistics import mean, median, pstdev
import structlog

from app.services.analytics_helpers import (
    _to_float,
    _format_category_name,
    _safe_str,
    _validate_uuid_str,
    _safe_department,
    _safe_graduation_year,
    _iso_date,
    _percentile_rank,
    _percentile_rank,
    _bucket_into_tier,
    _COHORT_ACTIVITY_DEFAULT_DAYS,
    _COHORT_ACTIVITY_MAX_DAYS,
    RUBRIC_CATEGORY_DISPLAY_ORDER,
    READINESS_TIER_READY,
    READINESS_TIER_ALMOST,
    READINESS_TIER_DEVELOPING,
    READINESS_TIER_AT_RISK,
    READINESS_TIER_NOT_STARTED,
    READINESS_TIER_COLOR,
    _STUCK_MIN_SESSIONS,
    _STUCK_SLOPE_THRESHOLD,
    _MIN_SESSIONS_FOR_RISK_EVAL,
)

logger = structlog.get_logger("prepvista.analytics")


async def fetch_cohort_overall_snapshot(
    conn,
    institution_id: str,
    department: str | None = None,
    graduation_year: int | None = None,
) -> list[dict]:
    """One row per student in the cohort with first/latest overall final_score.

    LEFT JOIN from `users` ensures students with zero finished+scored
    sessions still appear (session_count=0, scores=None) — they are the
    highest-priority "not started" signal for Q1/Q5; a TPO needs the FULL
    ~500-seat roster, not just students who have engaged at all.

    ASSUMPTION: `users(id, full_name, department, graduation_year,
    institution_id)` and `interview_sessions.target_role` — see Phase 4
    assumption ledger. The CONTRACT (return shape) is stable even if the
    underlying column names differ; only the SQL needs a rename.
    """
    try:
        safe_institution_id = _validate_uuid_str(institution_id, "institution_id")
    except ValueError as exc:
        logger.warning("cohort_overall_snapshot_invalid_institution_id", error=str(exc))
        return []

    safe_department = _safe_department(department)
    safe_grad_year = _safe_graduation_year(graduation_year)

    rows = await conn.fetch(
        """
        WITH scored_sessions AS (
            SELECT
                user_id,
                final_score,
                target_role,
                COALESCE(finished_at, created_at) AS session_date
            FROM interview_sessions
            WHERE state = 'FINISHED' AND final_score IS NOT NULL
        ),
        ranked AS (
            SELECT
                user_id,
                FIRST_VALUE(final_score) OVER (
                    PARTITION BY user_id ORDER BY session_date ASC
                ) AS first_score,
                FIRST_VALUE(final_score) OVER (
                    PARTITION BY user_id ORDER BY session_date DESC
                ) AS latest_score,
                FIRST_VALUE(target_role) OVER (
                    PARTITION BY user_id ORDER BY session_date DESC
                ) AS latest_target_role,
                FIRST_VALUE(session_date) OVER (
                    PARTITION BY user_id ORDER BY session_date DESC
                ) AS latest_session_date,
                COUNT(*) OVER (PARTITION BY user_id) AS session_count
            FROM scored_sessions
        ),
        per_student AS (
            SELECT DISTINCT ON (user_id)
                user_id, first_score, latest_score, latest_target_role,
                latest_session_date, session_count
            FROM ranked
        )
        SELECT
            u.id AS user_id,
            u.full_name,
            u.department,
            u.graduation_year,
            ps.first_score,
            ps.latest_score,
            ps.latest_target_role,
            ps.latest_session_date,
            COALESCE(ps.session_count, 0) AS session_count
        FROM users u
        LEFT JOIN per_student ps ON ps.user_id = u.id
        WHERE u.institution_id = $1
          AND ($2::text IS NULL OR u.department = $2)
          AND ($3::int IS NULL OR u.graduation_year = $3)
        ORDER BY ps.latest_score ASC NULLS FIRST
        """,
        safe_institution_id,
        safe_department,
        safe_grad_year,
    )

    return [
        {
            "user_id": str(row["user_id"]),
            "full_name": row["full_name"],
            "department": row["department"],
            "graduation_year": row["graduation_year"],
            "first_score": _to_float(row["first_score"]),
            "latest_score": _to_float(row["latest_score"]),
            "target_role": row["latest_target_role"],
            "latest_session_date": row["latest_session_date"],
            "session_count": row["session_count"],
        }
        for row in rows
    ]


async def fetch_cohort_category_snapshot(
    conn,
    institution_id: str,
    department: str | None = None,
    graduation_year: int | None = None,
) -> list[dict]:
    """One row per (student, category) with first/latest skill_scores values.

    INNER JOIN by design: a student contributes to a category's cohort
    average only once they have at least one scored session in it — correct
    for rollups/percentiles/department comparisons (Q1, Q2, Q3, Q6).
    "Not started" students are represented separately via
    fetch_cohort_overall_snapshot for the at-risk roster (Q5).

    ASSUMPTION: same `users` columns as fetch_cohort_overall_snapshot.
    """
    try:
        safe_institution_id = _validate_uuid_str(institution_id, "institution_id")
    except ValueError as exc:
        logger.warning("cohort_category_snapshot_invalid_institution_id", error=str(exc))
        return []

    safe_department = _safe_department(department)
    safe_grad_year = _safe_graduation_year(graduation_year)

    rows = await conn.fetch(
        """
        WITH category_scores AS (
            SELECT
                ss.user_id,
                ss.category,
                ss.average_score,
                COALESCE(s.finished_at, s.created_at) AS session_date
            FROM skill_scores ss
            JOIN interview_sessions s ON s.id = ss.session_id
            WHERE s.state = 'FINISHED'
        ),
        ranked AS (
            SELECT
                user_id,
                category,
                FIRST_VALUE(average_score) OVER (
                    PARTITION BY user_id, category ORDER BY session_date ASC
                ) AS first_score,
                FIRST_VALUE(average_score) OVER (
                    PARTITION BY user_id, category ORDER BY session_date DESC
                ) AS latest_score,
                COUNT(*) OVER (PARTITION BY user_id, category) AS session_count
            FROM category_scores
        ),
        per_student_category AS (
            SELECT DISTINCT ON (user_id, category)
                user_id, category, first_score, latest_score, session_count
            FROM ranked
        )
        SELECT
            u.id AS user_id,
            u.department,
            u.graduation_year,
            psc.category,
            psc.first_score,
            psc.latest_score,
            psc.session_count
        FROM per_student_category psc
        JOIN users u ON u.id = psc.user_id
        WHERE u.institution_id = $1
          AND ($2::text IS NULL OR u.department = $2)
          AND ($3::int IS NULL OR u.graduation_year = $3)
        """,
        safe_institution_id,
        safe_department,
        safe_grad_year,
    )

    return [
        {
            "user_id": str(row["user_id"]),
            "department": row["department"],
            "graduation_year": row["graduation_year"],
            "category": row["category"],
            "first_score": _to_float(row["first_score"]),
            "latest_score": _to_float(row["latest_score"]),
            "session_count": row["session_count"],
        }
        for row in rows
    ]


async def fetch_cohort_activity(
    conn,
    institution_id: str,
    department: str | None = None,
    graduation_year: int | None = None,
    days: int = _COHORT_ACTIVITY_DEFAULT_DAYS,
) -> dict[str, int]:
    """Per-day count of finished sessions for the cohort, pre-aggregated in
    SQL via GROUP BY date(...). [Q6; viz: calendar activity heatmap]

    Returns {"YYYY-MM-DD": count, ...} for the last `days` days (clamped to
    [1, _COHORT_ACTIVITY_MAX_DAYS]). This dict IS the final viz shape —
    matches the {date: value} convention used by standard calendar-heatmap
    components, so no separate compute step is needed.
    """
    try:
        safe_institution_id = _validate_uuid_str(institution_id, "institution_id")
    except ValueError as exc:
        logger.warning("cohort_activity_invalid_institution_id", error=str(exc))
        return {}

    safe_department = _safe_department(department)
    safe_grad_year = _safe_graduation_year(graduation_year)
    safe_days = max(1, min(int(days or _COHORT_ACTIVITY_DEFAULT_DAYS), _COHORT_ACTIVITY_MAX_DAYS))
    since = datetime.now(timezone.utc) - timedelta(days=safe_days)

    rows = await conn.fetch(
        """
        SELECT
            DATE(COALESCE(s.finished_at, s.created_at)) AS session_date,
            COUNT(*) AS session_count
        FROM interview_sessions s
        JOIN users u ON u.id = s.user_id
        WHERE u.institution_id = $1
          AND ($2::text IS NULL OR u.department = $2)
          AND ($3::int IS NULL OR u.graduation_year = $3)
          AND s.state = 'FINISHED'
          AND COALESCE(s.finished_at, s.created_at) >= $4
        GROUP BY session_date
        ORDER BY session_date ASC
        """,
        safe_institution_id,
        safe_department,
        safe_grad_year,
        since,
    )

    return {_iso_date(row["session_date"]): row["session_count"] for row in rows}


def compute_cohort_category_rollups(category_snapshot: list[dict]) -> dict:
    """Cohort-wide per-category averages, ranked weakest-first, plus radar shape. [Q1, Q3, Q6; viz: radar overlay]

    For each of the 19 valid rubric categories:
        cohort_avg_latest = mean(latest_score over students with data)
        cohort_avg_first  = mean(first_score over students with data)
        cohort_avg_delta  = cohort_avg_latest - cohort_avg_first
        student_count     = number of students contributing
    """
    by_category: dict[str, list[dict]] = defaultdict(list)
    for row in category_snapshot:
        by_category[row["category"]].append(row)

    rollups = []
    for category in RUBRIC_CATEGORY_DISPLAY_ORDER:
        rows = by_category.get(category, [])
        latest_values = [r["latest_score"] for r in rows if r["latest_score"] is not None]
        first_values = [r["first_score"] for r in rows if r["first_score"] is not None]
        avg_latest = round(mean(latest_values), 1) if latest_values else None
        avg_first = round(mean(first_values), 1) if first_values else None
        avg_delta = (
            round(avg_latest - avg_first, 1)
            if avg_latest is not None and avg_first is not None
            else None
        )
        rollups.append(
            {
                "category": category,
                "label": _format_category_name(category),
                "cohort_avg_latest": avg_latest,
                "cohort_avg_first": avg_first,
                "cohort_avg_delta": avg_delta,
                "student_count": len(rows),
            }
        )

    # Weakest-first ranking for Q3. Categories with no data sort LAST — they
    # are "unmeasured", not "weak"; surfacing them as #1 would mislead a TPO
    # into "fixing" a category nobody has been scored on yet.
    weakest_first = sorted(
        rollups,
        key=lambda r: (
            r["cohort_avg_latest"] is None,
            r["cohort_avg_latest"] if r["cohort_avg_latest"] is not None else 0.0,
        ),
    )

    radar = {
        "categories": [r["label"] for r in rollups],
        "series": [
            {
                "key": "cohort_average",
                "label": "Cohort Average",
                "values": [r["cohort_avg_latest"] for r in rollups],
            }
        ],
    }

    return {"by_category": rollups, "weakest_first": weakest_first, "radar": radar}


def compute_department_comparison(
    overall_snapshot: list[dict],
    category_snapshot: list[dict],
) -> dict:
    """Per-department readiness + growth + weakest-category, ranked so
    departments needing intervention sort first. [Q2, Q6; viz: department
    comparison bars + diverging bars]

    `diverging`: each department's avg_latest_score minus the
    institution-wide average — positive values are above-average
    departments, negative values are below-average.
    """
    by_dept_overall: dict[str | None, list[dict]] = defaultdict(list)
    for row in overall_snapshot:
        by_dept_overall[row["department"]].append(row)

    by_dept_category: dict[str | None, list[dict]] = defaultdict(list)
    for row in category_snapshot:
        by_dept_category[row["department"]].append(row)

    institution_latest = [r["latest_score"] for r in overall_snapshot if r["latest_score"] is not None]
    institution_avg = round(mean(institution_latest), 1) if institution_latest else None

    departments = []
    for dept, rows in by_dept_overall.items():
        latest_values = [r["latest_score"] for r in rows if r["latest_score"] is not None]
        first_values = [r["first_score"] for r in rows if r["first_score"] is not None]
        avg_latest = round(mean(latest_values), 1) if latest_values else None
        avg_first = round(mean(first_values), 1) if first_values else None
        avg_delta = (
            round(avg_latest - avg_first, 1)
            if avg_latest is not None and avg_first is not None
            else None
        )

        tier_counts: dict[str, int] = defaultdict(int)
        at_risk_count = 0
        for r in rows:
            tier = _bucket_into_tier(r["latest_score"])
            tier_counts[tier] += 1
            if tier == READINESS_TIER_AT_RISK or r["session_count"] == 0:
                at_risk_count += 1

        # Weakest category for THIS department: reuse
        # compute_cohort_category_rollups on the department's slice of
        # category_snapshot. ~19 categories x ~10 departments is a few
        # hundred pure-Python iterations total — no extra DB round trips.
        dept_rollups = compute_cohort_category_rollups(by_dept_category.get(dept, []))
        weakest = next(
            (r for r in dept_rollups["weakest_first"] if r["cohort_avg_latest"] is not None),
            None,
        )

        departments.append(
            {
                "department": dept,
                "student_count": len(rows),
                "avg_latest_score": avg_latest,
                "avg_first_score": avg_first,
                "avg_delta": avg_delta,
                "diverging_from_institution": (
                    round(avg_latest - institution_avg, 1)
                    if avg_latest is not None and institution_avg is not None
                    else None
                ),
                "readiness_tier_counts": dict(tier_counts),
                "at_risk_count": at_risk_count,
                "weakest_category": weakest["category"] if weakest else None,
                "weakest_category_label": weakest["label"] if weakest else None,
                "weakest_category_score": weakest["cohort_avg_latest"] if weakest else None,
            }
        )

    # Needs-intervention-first: lowest avg_latest_score first; departments
    # with no scored students sort last (same "unmeasured, not failing"
    # logic as compute_cohort_category_rollups).
    departments.sort(
        key=lambda d: (
            d["avg_latest_score"] is None,
            d["avg_latest_score"] if d["avg_latest_score"] is not None else 0.0,
        )
    )

    bars = {
        "departments": [d["department"] for d in departments],
        "series": [
            {"key": "avg_latest_score", "label": "Avg Readiness Score", "values": [d["avg_latest_score"] for d in departments]},
            {"key": "avg_delta", "label": "Avg Growth (First -> Latest)", "values": [d["avg_delta"] for d in departments]},
        ],
    }
    diverging = {
        "institution_avg_latest_score": institution_avg,
        "departments": [d["department"] for d in departments],
        "values": [d["diverging_from_institution"] for d in departments],
    }

    return {"departments": departments, "bars": bars, "diverging": diverging}


def compute_cohort_percentile_distribution(
    overall_snapshot: list[dict],
    bucket_width: int = 10,
) -> dict:
    """Histogram ('bell curve') of latest overall scores across the cohort. [Q1, Q6; viz: cohort percentile bell curve]

    Buckets are [0, w), [w, 2w), ..., with the final bucket closed at 100.
    mean/median/std_dev (population) are computed over students with a
    latest_score (session_count > 0); "not started" students are reported
    separately via not_started_students so they don't pull the curve toward
    zero before they've even taken a session.
    """
    scores = [r["latest_score"] for r in overall_snapshot if r["latest_score"] is not None]
    safe_width = bucket_width if bucket_width and bucket_width > 0 else 10
    bucket_count = math.ceil(100 / safe_width)

    buckets = [
        {"range_start": i * safe_width, "range_end": min((i + 1) * safe_width, 100), "count": 0}
        for i in range(bucket_count)
    ]
    for score in scores:
        clamped = min(max(score, 0.0), 100.0)
        idx = min(int(clamped // safe_width), bucket_count - 1)
        buckets[idx]["count"] += 1

    return {
        "buckets": buckets,
        "total_scored_students": len(scores),
        "not_started_students": sum(1 for r in overall_snapshot if r["session_count"] == 0),
        "mean": round(mean(scores), 1) if scores else None,
        "median": round(median(scores), 1) if scores else None,
        "std_dev": round(pstdev(scores), 1) if scores else None,
    }


def compute_readiness_distribution(overall_snapshot: list[dict]) -> dict:
    """Cohort readiness-tier breakdown plus a per-student grid. [Q1, Q2, Q6; viz: traffic-light readiness grid]
    """
    tier_counts: dict[str, int] = defaultdict(int)
    grid = []
    for row in overall_snapshot:
        tier = _bucket_into_tier(row["latest_score"])
        tier_counts[tier] += 1
        grid.append(
            {
                "user_id": row["user_id"],
                "full_name": row["full_name"],
                "department": row["department"],
                "graduation_year": row["graduation_year"],
                "latest_score": row["latest_score"],
                "session_count": row["session_count"],
                "readiness_tier": tier,
                "readiness_color": READINESS_TIER_COLOR.get(tier, "gray"),
            }
        )

    total = len(overall_snapshot)
    tier_order = (
        READINESS_TIER_READY,
        READINESS_TIER_ALMOST,
        READINESS_TIER_DEVELOPING,
        READINESS_TIER_AT_RISK,
        READINESS_TIER_NOT_STARTED,
    )
    tiers = [
        {
            "tier": tier,
            "color": READINESS_TIER_COLOR.get(tier, "gray"),
            "count": tier_counts.get(tier, 0),
            "pct": round(100 * tier_counts.get(tier, 0) / total, 1) if total else 0.0,
        }
        for tier in tier_order
    ]

    return {"tiers": tiers, "total_students": total, "grid": grid}


def compute_zero_offer_risk_roster(overall_snapshot: list[dict]) -> list[dict]:
    """Students flagged at-risk-of-zero-offers, most urgent first. [Q5, Q6]

    Cheap heuristic suitable for a 500-row cohort scan: approximates
    "is_stuck" from the first->latest delta (full regression is computed
    on-demand for the per-student detail view via
    compute_student_overall_growth, which has the full session history).

        approx_is_stuck = session_count >= _STUCK_MIN_SESSIONS
                          AND delta <= _STUCK_SLOPE_THRESHOLD * (session_count - 1)

    i.e. the average per-step change implied by delta/(session_count-1) is
    <= the per-session stuck threshold — exact for session_count==2, an
    approximation for more.

    at_risk_of_zero_offers (HARD flag) iff:
      - session_count == 0, OR
      - tier == At Risk AND session_count >= _MIN_SESSIONS_FOR_RISK_EVAL AND approx_is_stuck

    All other At-Risk / plateaued students still appear with risk_reasons but
    at_risk_of_zero_offers=False — a "watch list" tier the frontend can
    render separately from the urgent roster.
    """
    roster = []
    for row in overall_snapshot:
        latest = row["latest_score"]
        first = row["first_score"]
        session_count = row["session_count"]
        tier = _bucket_into_tier(latest)
        delta = round(latest - first, 1) if latest is not None and first is not None else None

        approx_is_stuck = (
            session_count >= _STUCK_MIN_SESSIONS
            and delta is not None
            and delta <= _STUCK_SLOPE_THRESHOLD * (session_count - 1)
        )

        risk_reasons: list[str] = []
        at_risk = False

        if session_count == 0:
            at_risk = True
            risk_reasons.append("No completed mock interviews yet.")
        elif tier == READINESS_TIER_AT_RISK:
            if session_count >= _MIN_SESSIONS_FOR_RISK_EVAL and approx_is_stuck:
                at_risk = True
                risk_reasons.append(
                    f"Score has stayed in the At Risk band across {session_count} "
                    f"sessions (change of {delta:+.1f} pts since first attempt)."
                )
            elif session_count >= _MIN_SESSIONS_FOR_RISK_EVAL:
                risk_reasons.append(
                    f"Latest score ({latest}) is in the At Risk band, but improving "
                    f"(change of {delta:+.1f} pts since first attempt) — keep monitoring."
                )
            else:
                risk_reasons.append(
                    f"First completed interview scored in the At Risk band ({latest})."
                )
        elif approx_is_stuck:
            risk_reasons.append(
                f"Score has plateaued (change of {delta:+.1f} pts across {session_count} sessions)."
            )

        if at_risk or risk_reasons:
            roster.append(
                {
                    "user_id": row["user_id"],
                    "full_name": row["full_name"],
                    "department": row["department"],
                    "graduation_year": row["graduation_year"],
                    "latest_score": latest,
                    "delta": delta,
                    "session_count": session_count,
                    "readiness_tier": tier,
                    "at_risk_of_zero_offers": at_risk,
                    "risk_reasons": risk_reasons,
                }
            )

    # Most urgent first: hard at_risk_of_zero_offers flags before soft
    # "watch list" entries; within each group, lowest latest_score first
    # (no-data/"Not Started" students sort first via the -1.0 sentinel).
    roster.sort(
        key=lambda r: (
            not r["at_risk_of_zero_offers"],
            r["latest_score"] if r["latest_score"] is not None else -1.0,
        )
    )
    return roster


def compute_cohort_growth_heatmap(
    category_snapshot: list[dict],
    overall_snapshot: list[dict],
    group_by_department: bool = True,
) -> dict:
    """Growth (first -> latest delta) heatmap. [Q4, Q2; viz: growth heatmap]

    group_by_department=True (default, cohort-wide view):
        rows = departments, cell = mean delta per (department, category) —
        roughly 10 x 19 cells, cheap enough for every cohort dashboard load.

    group_by_department=False (department drill-down):
        rows = individual students, cell = delta per (student, category).
        Callers should pass snapshots already filtered to one department
        (via the `department` param on fetch_cohort_*_snapshot) so this
        stays small — one department's roster x 19, not 500 x 19.

    A per-student-per-category regression slope across an entire 500-seat
    cohort would require pulling full session history for every
    student/category on every dashboard load. First->latest delta is the
    deliberate cohort-scale tradeoff; the full slope is available
    per-student via compute_student_category_growth on drill-down.
    """
    categories = list(RUBRIC_CATEGORY_DISPLAY_ORDER)
    category_labels = [_format_category_name(c) for c in categories]

    if group_by_department:
        groups: dict[str | None, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
        for row in category_snapshot:
            if row["first_score"] is None or row["latest_score"] is None:
                continue
            groups[row["department"]][row["category"]].append(row["latest_score"] - row["first_score"])

        rows_out: list[str | None] = []
        matrix: list[list[float | None]] = []
        for dept, by_cat in groups.items():
            rows_out.append(dept)
            matrix.append(
                [round(mean(by_cat[c]), 1) if by_cat.get(c) else None for c in categories]
            )
        return {"rows": rows_out, "row_label": "department", "categories": category_labels, "matrix": matrix}

    by_user_category: dict[str, dict[str, float]] = defaultdict(dict)
    for row in category_snapshot:
        if row["first_score"] is None or row["latest_score"] is None:
            continue
        by_user_category[row["user_id"]][row["category"]] = round(row["latest_score"] - row["first_score"], 1)

    rows_out = []
    matrix = []
    for row in overall_snapshot:
        rows_out.append(row["full_name"])
        student_deltas = by_user_category.get(row["user_id"], {})
        matrix.append([student_deltas.get(c) for c in categories])

    return {"rows": rows_out, "row_label": "student", "categories": category_labels, "matrix": matrix}


def compute_role_fit_sankey(
    overall_snapshot: list[dict],
    category_snapshot: list[dict],
) -> dict:
    """Sankey flow: target role -> role_fit readiness tier. [Q1, Q6; viz: Sankey role-fit]

    Uses each student's latest session's target_role (from
    fetch_cohort_overall_snapshot) and latest `role_fit` category score
    (from fetch_cohort_category_snapshot, category == "role_fit" — one of
    the 19 VALID_RUBRIC_CATEGORIES). Students missing either are excluded —
    they can't be placed in a flow.

    ASSUMPTION: interview_sessions.target_role — see Phase 4 ledger.
    """
    role_fit_by_user = {
        row["user_id"]: row["latest_score"]
        for row in category_snapshot
        if row["category"] == "role_fit" and row["latest_score"] is not None
    }

    flows: dict[tuple[str, str], int] = defaultdict(int)
    for row in overall_snapshot:
        role = row.get("target_role")
        score = role_fit_by_user.get(row["user_id"])
        if not role or score is None:
            continue
        tier = _bucket_into_tier(score)
        flows[(role, tier)] += 1

    roles = sorted({role for role, _ in flows})
    ordered_tiers = (
        READINESS_TIER_READY,
        READINESS_TIER_ALMOST,
        READINESS_TIER_DEVELOPING,
        READINESS_TIER_AT_RISK,
    )
    tiers_present = [t for t in ordered_tiers if any(tier == t for _, tier in flows)]

    nodes = [{"id": f"role:{r}", "label": r} for r in roles] + [
        {"id": f"tier:{t}", "label": t, "color": READINESS_TIER_COLOR.get(t, "gray")}
        for t in tiers_present
    ]
    links = [
        {"source": f"role:{role}", "target": f"tier:{tier}", "value": count}
        for (role, tier), count in flows.items()
    ]

    return {"nodes": nodes, "links": links}