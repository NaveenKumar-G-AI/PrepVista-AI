"""
Hardening regression suite (Fix 10).

Locks in the behaviour of the hardening initiative's risk areas so a future
refactor can't silently break them. Every test here is a PURE unit test — no DB,
no network, no LLM — so it runs in milliseconds in CI and gates merges.

Covered areas (one section each):
  * STT transcript repair guard      (Fix 2)
  * Cross-session question dedup     (Fix 4)
  * Grounded "better answer" gating  (Fix 5)
  * Score-scale 0-10 -> 0-100        (score-scale-dual-system)
  * Multi-format resume parsing      (Fix 6)
  * Report audit trail helpers       (Fix 7)
  * Redis question-memory cache I/O  (Fix 8)

The interviewer engine is imported through the ``app.services.interviewer``
barrel first, which resolves a pre-existing import cycle in the engine submodule.
"""

import pytest
from fastapi import HTTPException

# Barrel first — resolves the engine's import cycle before any submodule import.
from app.services.interviewer import _is_duplicate_question, _question_signature
from app.services import interviewer_question_engine as qe

from app.services.transcript_repair import _looks_degenerate
from app.services.placement_readiness import _rescale_to_100
from app.services.evaluator_feedback import (
    _MIN_GROUNDING_QUALITY,
    _contains_banned_fallback_phrase,
    _grounding_quality,
)
from app.services.resume_parser import (
    SUPPORTED_RESUME_EXTENSIONS,
    _resume_extension,
    validate_resume_upload,
)
from app.services.audio_storage import _turn_number_from_turn_id
from app.routers.reports import _transcript_was_corrected


# ── Fix 2: STT transcript repair guard ───────────────────────────────────────

def test_repair_guard_rejects_empty_output():
    assert _looks_degenerate("", "I used PyTorch on my project") is True


def test_repair_guard_rejects_preamble_leakage():
    assert _looks_degenerate("Here is the corrected transcript: ...", "short raw") is True


def test_repair_guard_rejects_ballooned_rewrite():
    raw = "I used pytorch"
    ballooned = "I used PyTorch. " + ("and then I explained at length " * 20)
    assert _looks_degenerate(ballooned, raw) is True


def test_repair_guard_accepts_same_length_correction():
    raw = "I used pie torch on my fienal year project"
    repaired = "I used PyTorch on my final year project"
    assert _looks_degenerate(repaired, raw) is False


# ── Fix 4: cross-session question dedup ───────────────────────────────────────

def test_identical_question_has_identical_signature():
    a = _question_signature("Tell me about your final year project.")
    b = _question_signature("Tell me about your final year project.")
    assert a and a == b


def test_exact_repeat_is_flagged_duplicate():
    q = "Walk me through how you built the recommendation system."
    sig = _question_signature(q)
    assert _is_duplicate_question(q, {sig}, []) is True


def test_distinct_question_is_not_duplicate():
    asked = "Tell me about your final year project."
    candidate = "What is your biggest weakness as a teammate?"
    assert _is_duplicate_question(candidate, {_question_signature(asked)}, [asked]) is False


def test_empty_candidate_is_not_duplicate():
    assert _is_duplicate_question("", {"anything"}, ["anything"]) is False


# ── Fix 5: grounded "better answer" gating ────────────────────────────────────

def test_banned_fallback_phrase_detected():
    assert _contains_banned_fallback_phrase("We should strengthen the method here.") is True


def test_banned_fallback_phrase_regex_variant():
    assert _contains_banned_fallback_phrase("My plan was to strengthen it next time.") is True


def test_clean_phrase_not_flagged():
    assert _contains_banned_fallback_phrase("I tuned the learning rate and re-ran the eval.") is False


def test_grounding_quality_zero_for_empty_facts():
    assert _grounding_quality({}) == 0


def test_grounding_quality_meets_threshold_with_real_signals():
    facts = {
        "project_grounded": True,
        "project_name": "Resume Ranker",
        "tool_grounded": True,
        "tool": "PyTorch",
        "method": "gradient boosting",
    }
    assert _grounding_quality(facts) >= _MIN_GROUNDING_QUALITY


def test_grounding_quality_ignores_placeholder_values():
    # "the project" / "the method" are placeholders that must not count.
    facts = {"project_grounded": True, "project_name": "the project", "method": "the method"}
    assert _grounding_quality(facts) == 0


# ── score-scale dual system: 0-10 stored -> 0-100 ─────────────────────────────

def test_rescale_ten_point_to_hundred():
    assert _rescale_to_100(8, 10) == 80.0


def test_rescale_clamps_above_max():
    assert _rescale_to_100(12, 10) == 100.0


def test_rescale_floors_negative_at_zero():
    assert _rescale_to_100(-3, 10) == 0.0


def test_rescale_rejects_unusable_values():
    assert _rescale_to_100(None, 10) is None
    assert _rescale_to_100("oops", 10) is None
    assert _rescale_to_100(5, 0) is None


# ── Fix 6: multi-format resume parsing ────────────────────────────────────────

def test_supported_extensions_cover_docx_doc_and_images():
    for ext in (".pdf", ".docx", ".doc", ".png", ".jpg"):
        assert ext in SUPPORTED_RESUME_EXTENSIONS


def test_resume_extension_resolves_by_content_type_when_name_bare():
    assert _resume_extension("resume", "application/pdf") == ".pdf"


def test_resume_extension_prefers_filename():
    assert _resume_extension("cv.docx", "application/pdf") == ".docx"


def test_validate_upload_accepts_real_pdf_magic():
    assert validate_resume_upload(b"%PDF-1.7\n%abc", "cv.pdf", "application/pdf") == ".pdf"


def test_validate_upload_rejects_spoofed_pdf():
    with pytest.raises(HTTPException) as exc:
        validate_resume_upload(b"<html>not a pdf</html>", "cv.pdf", "application/pdf")
    assert exc.value.status_code == 400


def test_validate_upload_rejects_unsupported_extension():
    with pytest.raises(HTTPException):
        validate_resume_upload(b"MZ\x90\x00", "malware.exe", "application/octet-stream")


# ── Fix 7: report audit trail helpers ─────────────────────────────────────────

def test_turn_number_parses_plain_int_and_string():
    assert _turn_number_from_turn_id(5) == 5
    assert _turn_number_from_turn_id("7") == 7


def test_turn_number_parses_ws_window_id():
    # WebSocket records audio per rolling window as "<turn>-<window>".
    assert _turn_number_from_turn_id("5-3") == 5


def test_turn_number_returns_none_for_garbage():
    assert _turn_number_from_turn_id("full") is None
    assert _turn_number_from_turn_id(None) is None


def test_transcript_correction_detected_only_when_meaningfully_different():
    assert _transcript_was_corrected("i used pie torch", "I used PyTorch") is True
    # Case-only / whitespace differences are not "corrections".
    assert _transcript_was_corrected("I used PyTorch", "i used pytorch") is False
    assert _transcript_was_corrected("anything", None) is False
    assert _transcript_was_corrected("anything", "") is False


# ── Fix 8: Redis question-memory cache serialization ──────────────────────────

def test_recent_memory_serialize_roundtrip_preserves_sets():
    memory = {
        "recent_session_count": 4,
        "recent_targets": ["ai ml: rag pipeline"],
        "recent_target_signatures": {"sig_a", "sig_b"},
        "recent_angle_signatures": {"angle_a"},
        "recent_position_signatures": {"1:technical_depth"},
        "recent_questions": ["q1"],
        "recent_question_signatures": {"qsig_a", "qsig_b"},
    }
    hydrated = qe._deserialize_recent_memory(qe._serialize_recent_memory(memory))
    assert hydrated["recent_session_count"] == 4
    assert hydrated["recent_target_signatures"] == {"sig_a", "sig_b"}
    assert isinstance(hydrated["recent_question_signatures"], set)
    assert hydrated["recent_questions"] == ["q1"]


def test_recent_memory_deserialize_handles_garbage():
    assert qe._deserialize_recent_memory("not json") is None


def test_qmem_cache_key_is_namespaced_per_user_and_plan():
    assert qe._qmem_cache_key("user-123", "pro") == "pv:qmem:user-123:pro"
