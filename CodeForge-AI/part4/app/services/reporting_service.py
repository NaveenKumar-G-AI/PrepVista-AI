"""
Phase 29: "Prepare clean APIs for future authorized college/TPO reporting."

Deliberately cohort-level and aggregated only:
- No per-student browsing (that would be recruiter-style access, which
  Phase 29 explicitly forbids: "Do not create recruiter access.").
- No raw source code, explanation text, or AI diagnosis prose exposed —
  only counts and category labels (Phase 29: "Do not expose raw private
  AI conversations unnecessarily.").
- Every query groups by something other than student_id, so there is no
  code path here that can return a single identified student's private
  detail, even by accident of a narrow filter.
"""
from __future__ import annotations

from app.db import get_conn


def skill_distribution(skill_id: str | None = None) -> list[dict]:
    """Per-skill count of students at each level. No student identities."""
    conn = get_conn()
    if skill_id:
        rows = conn.execute(
            """SELECT skill_id, level, COUNT(*) AS student_count
               FROM skill_assessments WHERE skill_id = ?
               GROUP BY skill_id, level ORDER BY skill_id, level""",
            (skill_id,),
        ).fetchall()
    else:
        rows = conn.execute(
            """SELECT skill_id, level, COUNT(*) AS student_count
               FROM skill_assessments GROUP BY skill_id, level ORDER BY skill_id, level"""
        ).fetchall()
    return [dict(r) for r in rows]


def common_mistakes(skill_id: str | None = None, limit: int = 10) -> list[dict]:
    """Most frequent mistake categories cohort-wide. Category + count only —
    never the evidence_text (which can reference specifics of one attempt)
    or which students triggered them."""
    conn = get_conn()
    if skill_id:
        rows = conn.execute(
            """SELECT skill_id, category, COUNT(*) AS occurrence_count,
                      COUNT(DISTINCT student_id) AS distinct_students
               FROM mistake_instances WHERE skill_id = ?
               GROUP BY skill_id, category ORDER BY occurrence_count DESC LIMIT ?""",
            (skill_id, limit),
        ).fetchall()
    else:
        rows = conn.execute(
            """SELECT skill_id, category, COUNT(*) AS occurrence_count,
                      COUNT(DISTINCT student_id) AS distinct_students
               FROM mistake_instances
               GROUP BY skill_id, category ORDER BY occurrence_count DESC LIMIT ?""",
            (limit,),
        ).fetchall()
    return [dict(r) for r in rows]


def challenge_completion() -> list[dict]:
    """Per-challenge: how many distinct students have passed it at least
    once, and how many distinct students have attempted it. A completion
    rate a TPO can act on, without any per-student detail."""
    conn = get_conn()
    rows = conn.execute(
        """SELECT a.challenge_id, c.title, c.difficulty,
                  COUNT(DISTINCT a.student_id) AS students_attempted,
                  COUNT(DISTINCT CASE WHEN er.status = 'PASSED' THEN a.student_id END) AS students_passed
           FROM attempts a
           JOIN challenges c ON c.challenge_id = a.challenge_id AND c.challenge_version = a.challenge_version
           LEFT JOIN evaluation_results er ON er.attempt_id = a.attempt_id
           GROUP BY a.challenge_id, c.title, c.difficulty
           ORDER BY a.challenge_id"""
    ).fetchall()
    return [dict(r) for r in rows]


def improvement_signals() -> list[dict]:
    """Cohort-wide: how many students improved their score between their
    first and most recent attempt on the same challenge. A single
    aggregate number per challenge, not a per-student trajectory."""
    conn = get_conn()
    rows = conn.execute(
        """
        WITH first_last AS (
            SELECT a.student_id, a.challenge_id,
                   MIN(a.attempt_number) AS first_num, MAX(a.attempt_number) AS last_num
            FROM attempts a
            GROUP BY a.student_id, a.challenge_id
            HAVING COUNT(*) > 1
        )
        SELECT fl.challenge_id,
               COUNT(*) AS students_with_multiple_attempts,
               SUM(CASE WHEN er_last.tests_passed > er_first.tests_passed THEN 1 ELSE 0 END) AS students_improved
        FROM first_last fl
        JOIN attempts a_first ON a_first.student_id = fl.student_id AND a_first.challenge_id = fl.challenge_id
                                AND a_first.attempt_number = fl.first_num
        JOIN attempts a_last ON a_last.student_id = fl.student_id AND a_last.challenge_id = fl.challenge_id
                               AND a_last.attempt_number = fl.last_num
        JOIN evaluation_results er_first ON er_first.attempt_id = a_first.attempt_id
        JOIN evaluation_results er_last ON er_last.attempt_id = a_last.attempt_id
        GROUP BY fl.challenge_id
        """
    ).fetchall()
    return [dict(r) for r in rows]
