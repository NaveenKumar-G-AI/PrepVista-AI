"""
Part 5 — thin HTTP adapter over the service layer. Section 84.H.

This is intentionally a thin, framework-specific EXAMPLE, not the
"real" API contract — the actual PrepVista repo almost certainly
already has its own HTTP framework, auth middleware, and route-naming
convention (a Phase-0 finding this standalone build cannot make), and
the interviews/ package underneath does not depend on Flask at all.
Swap this file for an adapter in whatever framework Parts 1-4 already
use; nothing else changes.

Auth here is a deliberately obvious stand-in (three headers) — replace
with the real session/JWT middleware Part 1 owns. Every route still
goes through security.py's scope checks regardless of how the actor
was authenticated, so swapping the auth layer doesn't weaken anything.
"""

from flask import Flask, request, jsonify

from interviews import services, scheduling, results as results_module, import_pipeline, analytics
from interviews.enums import Role, AttendanceStatus, ResultValue, IssueType
from interviews.security import AccessDeniedError
from interviews.scheduling import SchedulingError
from interviews.results import ResultError
from interviews.import_pipeline import ImportError_

app = Flask(__name__)


def _actor():
    """Stand-in for real auth middleware — see module docstring."""
    return {
        "id": request.headers.get("X-Actor-Id", "anonymous"),
        "role": request.headers.get("X-Actor-Role", "TPO"),
        "institution_id": request.headers.get("X-Institution-Id", "inst_sit"),
    }


@app.errorhandler(AccessDeniedError)
def handle_access_denied(e):
    return jsonify({"error": "access_denied", "message": str(e)}), 403


@app.errorhandler(SchedulingError)
def handle_scheduling_error(e):
    return jsonify({"error": "scheduling_error", "message": str(e)}), 409


@app.errorhandler(ResultError)
def handle_result_error(e):
    return jsonify({"error": "result_error", "message": str(e)}), 409


@app.errorhandler(ImportError_)
def handle_import_error(e):
    return jsonify({"error": "import_error", "message": str(e)}), 400


@app.get("/api/interviews/today")
def today():
    return jsonify(services.get_today_interviews(_actor()["institution_id"]))


@app.get("/api/interviews")
def list_interviews():
    a = _actor()
    return jsonify(services.get_tpo_interview_list(
        a["institution_id"],
        drive_id=request.args.get("drive_id"),
        round_execution_id=request.args.get("round_execution_id"),
        department=request.args.get("department"),
        status=request.args.get("status"),
        attendance=request.args.get("attendance"),
        search=request.args.get("search"),
    ))


@app.get("/api/interviews/<interview_id>")
def interview_detail(interview_id):
    a = _actor()
    iv = scheduling.get_interview(interview_id)
    if not iv:
        return jsonify({"error": "not_found"}), 404
    result = services.get_result(interview_id, Role(a["role"]), a["id"], a["institution_id"])
    return jsonify({"interview": iv, "result": result})


@app.post("/api/interviews/<interview_id>/attendance")
def post_attendance(interview_id):
    a = _actor()
    body = request.get_json(force=True)
    scheduling.record_attendance(interview_id, AttendanceStatus(body["status"]), actor=a["id"], reason=body.get("reason"))
    return jsonify({"ok": True})


@app.post("/api/interviews/<interview_id>/confirm")
def post_confirm(interview_id):
    a = _actor()
    scheduling.student_confirm(interview_id, a["id"], actor=a["id"])
    return jsonify({"ok": True})


@app.post("/api/interviews/<interview_id>/issue")
def post_issue(interview_id):
    a = _actor()
    body = request.get_json(force=True)
    iss_id = scheduling.report_issue(interview_id, a["id"], IssueType(body["issue_type"]), body.get("details", ""), actor=a["id"])
    return jsonify({"issue_id": iss_id})


@app.post("/api/interviews/<interview_id>/result")
def post_result(interview_id):
    a = _actor()
    body = request.get_json(force=True)
    rid = results_module.enter_result(interview_id, ResultValue(body["result"]), body.get("remarks"), actor=a["id"])
    return jsonify({"result_id": rid})


@app.post("/api/results/review")
def post_review():
    a = _actor()
    body = request.get_json(force=True)
    return jsonify(results_module.review_batch(body["drive_id"], body["round_execution_id"], actor=a["id"]))


@app.post("/api/results/publish")
def post_publish():
    a = _actor()
    body = request.get_json(force=True)
    return jsonify(results_module.publish(body["interview_ids"], actor=a["id"], require_no_gaps=body.get("require_no_gaps", False)))


@app.post("/api/results/import/preview")
def post_import_preview():
    a = _actor()
    body = request.get_json(force=True)
    rows = import_pipeline.parse_csv(body["csv_text"])
    return jsonify(import_pipeline.validate_import(rows, a["institution_id"], body["drive_id"], body["round_execution_id"]))


@app.get("/api/results/pending")
def get_pending():
    return jsonify(services.get_pending_results(_actor()["institution_id"]))


@app.get("/api/students/<student_id>/dashboard")
def student_dashboard(student_id):
    return jsonify(services.get_student_dashboard(student_id))


@app.get("/api/analytics")
def get_analytics():
    a = _actor()
    return jsonify(services.get_interview_analytics(a["institution_id"], request.args.get("drive_id")))


@app.get("/api/command-centre")
def command_centre():
    return jsonify(services.get_command_centre_cards(_actor()["institution_id"]))


if __name__ == "__main__":
    app.run(port=5057)
