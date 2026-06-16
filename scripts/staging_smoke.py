"""
Release-day staging smoke runner for the interview flow.

Expected environment variables:
- PREPVISTA_BASE_URL
- PREPVISTA_BEARER_TOKEN
- PREPVISTA_RESUME_PDF
- PREPVISTA_PLAN (optional, default: pro)
- PREPVISTA_DIFFICULTY (optional, default: medium)
- PREPVISTA_DURATION (optional, default: 600)
"""

from __future__ import annotations

import json
import mimetypes
import os
import sys
import uuid
import urllib.error
import urllib.parse
import urllib.request


def _require_env(name: str) -> str:
    value = (os.getenv(name) or "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def _make_headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
    }


def _request_json(url: str, *, method: str = "GET", headers: dict[str, str] | None = None, body: bytes | None = None):
    request = urllib.request.Request(url=url, data=body, method=method, headers=headers or {})
    with urllib.request.urlopen(request, timeout=60) as response:
        payload = response.read()
    return json.loads(payload.decode("utf-8"))


def _build_multipart_form(fields: dict[str, str], file_field: str, file_path: str) -> tuple[bytes, str]:
    boundary = f"----PrepVistaBoundary{uuid.uuid4().hex}"
    lines: list[bytes] = []

    for key, value in fields.items():
        lines.extend(
            [
                f"--{boundary}".encode(),
                f'Content-Disposition: form-data; name="{key}"'.encode(),
                b"",
                str(value).encode("utf-8"),
            ]
        )

    mime_type = mimetypes.guess_type(file_path)[0] or "application/pdf"
    file_name = os.path.basename(file_path)
    with open(file_path, "rb") as handle:
        file_bytes = handle.read()

    lines.extend(
        [
            f"--{boundary}".encode(),
            f'Content-Disposition: form-data; name="{file_field}"; filename="{file_name}"'.encode(),
            f"Content-Type: {mime_type}".encode(),
            b"",
            file_bytes,
            f"--{boundary}--".encode(),
            b"",
        ]
    )

    body = b"\r\n".join(lines)
    return body, f"multipart/form-data; boundary={boundary}"


def main() -> int:
    base_url = _require_env("PREPVISTA_BASE_URL").rstrip("/")
    bearer_token = _require_env("PREPVISTA_BEARER_TOKEN")
    resume_pdf = _require_env("PREPVISTA_RESUME_PDF")
    plan = (os.getenv("PREPVISTA_PLAN") or "pro").strip().lower()
    difficulty_mode = (os.getenv("PREPVISTA_DIFFICULTY") or "medium").strip().lower()
    duration = (os.getenv("PREPVISTA_DURATION") or "600").strip()

    setup_fields = {
        "plan": plan,
        "difficulty_mode": difficulty_mode,
        "duration": duration,
        "proctoring_mode": "practice",
    }
    setup_body, content_type = _build_multipart_form(setup_fields, "resume", resume_pdf)
    setup_headers = _make_headers(bearer_token)
    setup_headers["Content-Type"] = content_type

    setup = _request_json(
        f"{base_url}/interviews/setup",
        method="POST",
        headers=setup_headers,
        body=setup_body,
    )
    session_id = setup["session_id"]
    access_token = setup["access_token"]

    def submit_answer(user_text: str, duration_actual: int = 0) -> dict:
        payload = json.dumps(
            {
                "user_text": user_text,
                "access_token": access_token,
                "duration_actual": duration_actual,
                "client_request_id": uuid.uuid4().hex,
            }
        ).encode("utf-8")
        headers = _make_headers(bearer_token)
        headers["Content-Type"] = "application/json"
        return _request_json(
            f"{base_url}/interviews/{session_id}/answer",
            method="POST",
            headers=headers,
            body=payload,
        )

    first = submit_answer("[START_INTERVIEW]")
    assert first["action"] == "continue", "setup should return the first active question"
    first_turn = int(first["turn"])
    first_question = str(first["text"])

    answered = submit_answer("I am a final-year student who built practical projects with clear ownership.")
    assert answered["action"] in {"continue", "finish"}

    repeated = submit_answer("repeat please")
    assert repeated["action"] == "continue", "clarification should keep the interview alive"
    assert int(repeated["turn"]) == int(answered["turn"]), "clarification must not increment the turn"

    timeout_retry_1 = submit_answer("[NO_ANSWER_TIMEOUT]")
    assert timeout_retry_1["action"] == "continue", "first timeout should stay question-level"
    assert int(timeout_retry_1["turn"]) == int(answered["turn"]), "timeout retry must not increment the turn early"

    timeout_retry_2 = submit_answer("[NO_ANSWER_TIMEOUT]")
    assert timeout_retry_2["action"] == "continue", "second timeout should still stay question-level for Pro/Career"
    assert int(timeout_retry_2["turn"]) == int(answered["turn"]), "second timeout retry must keep the same turn open"

    timeout_close = submit_answer("[NO_ANSWER_TIMEOUT]")
    assert timeout_close["action"] in {"continue", "finish"}, "timeout exhaustion should close the question safely"
    assert int(timeout_close["turn"]) >= int(answered["turn"]), "closed questions must not move backwards"

    final_payload = submit_answer("[USER_REQUESTED_END]", duration_actual=120)
    assert final_payload["action"] == "finish", "explicit exit should finish the session"
    summary = final_payload.get("summary") or {}

    report = _request_json(
        f"{base_url}/reports/{session_id}",
        headers=_make_headers(bearer_token),
    )
    report_summary = report.get("summary") or report.get("session", {}).get("summary") or {}

    pdf_request = urllib.request.Request(
        url=f"{base_url}/reports/{session_id}/pdf",
        headers=_make_headers(bearer_token),
        method="GET",
    )
    with urllib.request.urlopen(pdf_request, timeout=60) as response:
        pdf_bytes = response.read()

    assert summary.get("planned_questions") == report_summary.get("planned_questions"), "finish/report planned counts must match"
    assert summary.get("answered_questions") == report_summary.get("answered_questions"), "finish/report answered counts must match"
    assert report.get("session", {}).get("summary", {}).get("closed_questions") == report.get("summary", {}).get("closed_questions"), "session/report summary should stay aligned"
    assert first_question, "the first question text should be captured"
    assert pdf_bytes[:5] == b"%PDF-", "PDF response must be valid"

    print(
        json.dumps(
            {
                "status": "ok",
                "session_id": session_id,
                "plan": plan,
                "difficulty_mode": difficulty_mode,
                "first_turn": first_turn,
                "summary": summary,
                "report_summary": report_summary,
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except urllib.error.HTTPError as exc:
        print(f"HTTP error: {exc.code} {exc.reason}", file=sys.stderr)
        try:
            print(exc.read().decode("utf-8"), file=sys.stderr)
        except Exception:
            pass
        raise SystemExit(1) from exc
    except Exception as exc:  # pragma: no cover - release-day diagnostic path
        print(str(exc), file=sys.stderr)
        raise SystemExit(1) from exc
