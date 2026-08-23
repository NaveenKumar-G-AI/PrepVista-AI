"""
Part 5 — automated regression suite (section 70/77). Run with:
    python3 -m unittest tests.test_part5 -v
Each test seeds its own fresh database so tests don't interfere with
each other or with the demo walkthrough's database file.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import seed_demo
from interviews.db import get_conn, DB_PATH
from interviews import scheduling, results as results_module, import_pipeline, services
from interviews.enums import AttendanceStatus, ResultValue, Role, InterviewStatus
from interviews.state_machine import InvalidTransitionError
from interviews.results import ResultError
from interviews.scheduling import SchedulingError
from interviews.security import AccessDeniedError


class Part5TestCase(unittest.TestCase):
    def setUp(self):
        self.ctx = seed_demo.run(fresh=True)


class TestStateMachine(Part5TestCase):
    def test_cannot_jump_scheduled_to_result_published(self):
        upcoming = services.get_upcoming_interviews(institution_id=self.ctx["institution_id"])
        fresh = next(iv for iv in upcoming if iv["interview_status"] == "SCHEDULED")
        row = scheduling.get_interview(fresh["id"])
        from interviews.results import _advance_interview_status
        with self.assertRaises(InvalidTransitionError):
            with get_conn() as conn:
                _advance_interview_status(conn, row, InterviewStatus.RESULT_PUBLISHED, "attacker", "FORCE")

    def test_cancelled_is_terminal(self):
        cancelled_id = self.ctx["cancelled_ids"][0]
        row = scheduling.get_interview(cancelled_id)
        self.assertEqual(row["interview_status"], "CANCELLED")
        from interviews.scheduling import _write_interview_status
        with self.assertRaises(InvalidTransitionError):
            with get_conn() as conn:
                _write_interview_status(conn, row, InterviewStatus.CONFIRMED, "someone", "TEST")


class TestResultPublicationStaging(Part5TestCase):
    def test_result_not_visible_to_student_until_published(self):
        pending = services.get_pending_results(self.ctx["institution_id"])
        target = pending[0]
        results_module.enter_result(target["id"], ResultValue.PASS_, "great performance", actor="tpo_admin_1")

        # Still internal — student view must show no result yet.
        view = services.get_result(target["id"], Role.STUDENT, target["student_id"], self.ctx["institution_id"])
        self.assertIsNone(view["result"])

        review = results_module.review_batch(self.ctx["drive_id"], self.ctx["round_execution_id"], actor="tpo_admin_1")
        self.assertGreaterEqual(review["reviewed_counts"].get("PASS", 0), 1)

        # Reviewed but not yet published — still hidden from the student.
        view = services.get_result(target["id"], Role.STUDENT, target["student_id"], self.ctx["institution_id"])
        self.assertIsNone(view["result"])

        results_module.publish([target["id"]], actor="tpo_admin_1")
        view = services.get_result(target["id"], Role.STUDENT, target["student_id"], self.ctx["institution_id"])
        self.assertEqual(view["result"], "PASS")

    def test_cannot_silently_overwrite_published_result(self):
        published_id = self.ctx["early_published_ids"][0]
        with self.assertRaises(ResultError):
            results_module.enter_result(published_id, ResultValue.HOLD, "oops", actor="careless_tpo")

    def test_correction_requires_reason(self):
        published_id = self.ctx["early_published_ids"][0]
        with self.assertRaises(ResultError):
            results_module.correct_result(published_id, ResultValue.HOLD, "", actor="tpo_admin_1")

    def test_correction_preserves_history(self):
        published_id = self.ctx["early_published_ids"][0]
        before = results_module.get_current_result(published_id)["result"]
        results_module.correct_result(published_id, ResultValue.HOLD, "panel re-review", actor="tpo_admin_1")
        history = results_module.result_history(published_id)
        self.assertEqual(len(history), 2)
        self.assertEqual(history[0]["result"], before)
        self.assertEqual(history[0]["is_current"], 0)
        self.assertEqual(history[1]["is_current"], 1)
        self.assertEqual(history[1]["result"], "HOLD")


class TestImportValidation(Part5TestCase):
    def test_unknown_duplicate_conflict_all_detected(self):
        preview = import_pipeline.validate_import(
            import_pipeline.parse_csv(self.ctx["csv_text"]),
            self.ctx["institution_id"], self.ctx["drive_id"], self.ctx["round_execution_id"],
        )
        self.assertEqual(preview["summary"]["unknown_student"], 1)
        self.assertEqual(preview["summary"]["duplicate_in_file"], 1)
        self.assertEqual(preview["summary"]["conflict"], 1)
        self.assertEqual(preview["summary"]["valid"], 12)

    def test_commit_only_writes_valid_rows(self):
        rows = import_pipeline.parse_csv(self.ctx["csv_text"])
        preview = import_pipeline.validate_import(rows, self.ctx["institution_id"], self.ctx["drive_id"], self.ctx["round_execution_id"])
        # This CSV was already committed once during seeding — re-running validate against
        # the now-current DB state should classify the 12 "already imported" rows as
        # conflicts-or-blocked-by-enter_result, not silently double-write. We assert the
        # commit step itself never writes more rows than were in preview["valid"].
        commit = import_pipeline.commit_import(preview, actor="test")
        self.assertLessEqual(commit["committed_count"], len(preview["valid"]))

    def test_malformed_file_rejected_before_any_write(self):
        with self.assertRaises(import_pipeline.ImportError_):
            import_pipeline.parse_csv("Not,The,Right,Headers\n1,2,3,4")


class TestSecurity(Part5TestCase):
    def test_student_cannot_view_other_students_interview(self):
        # Scoped to one round so each of the 30 students appears exactly once —
        # guarantees victim and attacker really are different people.
        listing = services.get_tpo_interview_list(self.ctx["institution_id"],
                                                    round_execution_id=self.ctx["round_execution_id"], limit=5)
        victim, attacker = listing[0], listing[1]
        self.assertNotEqual(victim["student_id"], attacker["student_id"])
        with self.assertRaises(AccessDeniedError):
            services.get_result(victim["id"], Role.STUDENT, attacker["student_id"], self.ctx["institution_id"])

    def test_cross_institution_denied(self):
        listing = services.get_tpo_interview_list(self.ctx["institution_id"], limit=1)
        with self.assertRaises(AccessDeniedError):
            services.get_result(listing[0]["id"], Role.TPO, "some_tpo", "a_different_institution")

    def test_scrubbed_view_excludes_internal_fields(self):
        listing = services.get_tpo_interview_list(self.ctx["institution_id"], limit=1)
        iv = listing[0]
        view = services.get_result(iv["id"], Role.STUDENT, iv["student_id"], self.ctx["institution_id"])
        for forbidden_key in ("entered_by", "result_source", "reviewed_by", "correction_reason"):
            self.assertNotIn(forbidden_key, view)


class TestConcurrency(Part5TestCase):
    def test_stale_version_write_is_rejected(self):
        # upcoming_ids[1] only ever had an issue reported/resolved against it during
        # seeding — neither touches the interviews row — so it's still SCHEDULED, version 1.
        iid = self.ctx["upcoming_ids"][1]
        stale_row = scheduling.get_interview(iid)
        self.assertEqual(stale_row["interview_status"], "SCHEDULED")

        # A legitimate concurrent write advances the real version.
        scheduling.student_confirm(iid, stale_row["student_id"], actor=stale_row["student_id"])

        from interviews.scheduling import _write_interview_status
        with self.assertRaises(SchedulingError):
            with get_conn() as conn:
                _write_interview_status(conn, stale_row, InterviewStatus.CANCELLED, "late_writer", "STALE_WRITE")

    def test_idempotent_publish_does_not_double_fire(self):
        target_id = self.ctx["early_published_ids"][0]  # already published during seeding
        before = len(services.get_interview_analytics(self.ctx["institution_id"], self.ctx["drive_id"]))
        result = results_module.publish([target_id], actor="tpo_admin_1")
        self.assertNotIn(target_id, result["published"])  # already published -> not re-published
        self.assertIn(target_id, result["skipped_not_reviewed"])


class TestRoundProgression(Part5TestCase):
    def test_only_published_pass_counts_toward_progression(self):
        # Enter a PASS but do not publish it — it must not show up as "eligible" yet.
        pending = services.get_pending_results(self.ctx["institution_id"])
        target = pending[-1]
        results_module.enter_result(target["id"], ResultValue.PASS_, "strong", actor="tpo_admin_1")
        progression_before = results_module.round_progression(self.ctx["drive_id"], self.ctx["round_execution_id"])
        student_ids_before = {s["student_id"] for s in progression_before["students"]}
        self.assertNotIn(target["student_id"], student_ids_before)


if __name__ == "__main__":
    unittest.main(verbosity=2)
