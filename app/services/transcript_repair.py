"""
PrepVista AI — LLM Transcript Repair Pass (Fix 2)
=================================================
The dictionary-based corrector in ``transcript.py`` can only fix the ~250 terms
it already knows about. Proper nouns that are unique to a candidate's resume —
college names ("Kangeyam Institute"), company names, niche tools, project names
— are mis-heard by STT and reach the evaluator as garbage ("congen Institute").

This module adds a single LLM repair pass that runs BEFORE the existing
``normalize_transcript`` + ``recover_*_intent`` chain in
``evaluator_scoring.evaluate_single_question``. It uses the candidate's OWN
resume as ground truth for proper nouns, so it can fix mishearings the static
dictionary will never cover, without changing the meaning of the answer.

Design contract (matches the rest of the scoring path):
  * NEVER raise into the scoring path. Any failure → return the raw transcript
    unchanged. A mis-heard proper noun is bad; a crashed evaluation is worse.
  * NEVER inflate the answer. The prompt forbids adding information, improving
    answer quality, or fixing grammar/structure — repair only fixes mishearings.
  * Cache per (session_id, turn_id) so report generation does not re-run the
    LLM for an answer that was already repaired during the live interview.
  * Skip cheaply for inputs that cannot benefit (system markers, empty/very
    short answers, or no resume context).
"""

from __future__ import annotations

import hashlib
import json
import re

import structlog
from cachetools import TTLCache

from app.config import get_settings
from app.services.llm import call_llm

logger = structlog.get_logger("prepvista.transcript_repair")

# ── Cache ───────────────────────────────────────────────────────────────────
# Keyed on (session_id, turn_id) when both are known (the live + report paths
# both pass them), else on a content hash so repeated identical answers in a
# test/replay still share a result. 1-hour TTL comfortably covers a live
# interview plus the report generated immediately after it; bounded so a long-
# running worker cannot grow this unboundedly.
_REPAIR_CACHE: TTLCache = TTLCache(maxsize=4096, ttl=3600)

# System markers injected by the interview runtime — these are control signals,
# not speech, and must pass through repair untouched.
_SYSTEM_MARKERS = (
    "[NO_ANSWER_TIMEOUT]",
    "[SYSTEM_DURATION_EXPIRED]",
    "[USER_REQUESTED_END]",
)

# An answer shorter than this (in words) cannot meaningfully contain a mis-heard
# proper noun worth an LLM round-trip — skip and save the call.
_MIN_WORDS_FOR_REPAIR = 4

# Hard caps so a pathological resume or answer cannot blow the token budget.
_MAX_RESUME_CHARS = 3500
_MAX_TRANSCRIPT_CHARS = 4000

_REPAIR_PROMPT_TEMPLATE = """You are a transcript repair engine.
The following is a speech-to-text transcript that may contain
mishearing errors, especially for proper nouns, college names,
company names, and technical terms.

CANDIDATE RESUME (use this as ground truth for proper nouns):
{resume_text}

RAW TRANSCRIPT:
{raw_transcript}

TASK:
1. Fix any words that are clearly mishearings of terms
   found in the resume above.
2. Fix obvious STT errors (repeated words, filler sounds
   written as words, broken proper nouns).
3. Do NOT change the meaning, add information, or improve
   the answer quality.
4. Do NOT fix grammar or sentence structure.
5. Return ONLY the corrected transcript. Nothing else.
   No explanation. No preamble.

CORRECTED TRANSCRIPT:"""


def _has_system_marker(text: str) -> bool:
    return any(marker in text for marker in _SYSTEM_MARKERS)


def _coerce_resume_text(resume_text: object) -> str:
    """Flatten a resume_summary (JSON string or dict) into readable plain text.

    The evaluator passes ``resume_summary`` which is usually a JSON string of
    the parsed resume. We surface the human-readable values (name, education,
    skills, project/experience names + tech) so the LLM has the proper nouns it
    needs as ground truth, without dumping raw JSON braces that waste tokens.
    """
    if resume_text is None:
        return ""

    data: object = resume_text
    if isinstance(resume_text, str):
        stripped = resume_text.strip()
        if not stripped:
            return ""
        try:
            parsed = json.loads(stripped)
            data = parsed
        except (ValueError, TypeError):
            # Already plain text — use as-is.
            return stripped[:_MAX_RESUME_CHARS]

    if isinstance(data, dict):
        parts: list[str] = []
        for key in ("candidate_name", "name", "broad_field", "headline", "summary"):
            value = data.get(key)
            if isinstance(value, str) and value.strip():
                parts.append(value.strip())

        for collection_key in ("education", "skills", "certifications"):
            items = data.get(collection_key)
            if isinstance(items, list):
                parts.extend(str(item).strip() for item in items if str(item).strip())

        for collection_key in ("projects", "experience"):
            items = data.get(collection_key)
            if not isinstance(items, list):
                continue
            for item in items:
                if not isinstance(item, dict):
                    if str(item).strip():
                        parts.append(str(item).strip())
                    continue
                for field in ("name", "title", "role", "company", "organization"):
                    value = item.get(field)
                    if isinstance(value, str) and value.strip():
                        parts.append(value.strip())
                tech = item.get("tech_stack") or item.get("tech") or []
                if isinstance(tech, list):
                    parts.extend(str(t).strip() for t in tech if str(t).strip())

        flattened = "\n".join(dict.fromkeys(p for p in parts if p))  # dedupe, keep order
        return flattened[:_MAX_RESUME_CHARS]

    return str(data)[:_MAX_RESUME_CHARS]


def _cache_key(
    raw_transcript: str,
    session_id: object,
    turn_id: object,
) -> str:
    if session_id is not None and turn_id is not None:
        return f"sid:{session_id}:turn:{turn_id}"
    digest = hashlib.sha256(raw_transcript.encode("utf-8", "ignore")).hexdigest()[:24]
    return f"hash:{digest}"


def _looks_degenerate(repaired: str, raw_transcript: str) -> bool:
    """Guard against an LLM that ignored instructions and returned prose.

    A correct repair is roughly the same length as the input. If the model
    returned an explanation/preamble, refusal, or rewrote the answer wholesale,
    the output will be far longer than the input — reject it and keep raw.
    """
    if not repaired:
        return True
    # Common preamble leakage despite "no preamble".
    lowered = repaired.lower()
    if lowered.startswith(("here is", "here's", "corrected transcript", "the corrected")):
        return True
    # Length sanity: repair should not balloon the answer (allow generous slack
    # for added punctuation/spacing).
    if len(repaired) > max(120, int(len(raw_transcript) * 2.0) + 120):
        return True
    return False


async def repair_transcript(
    raw_transcript: str,
    resume_text: str | dict | None,
    plan: str,
    *,
    session_id: object = None,
    turn_id: object = None,
) -> str:
    """Return a mishearing-corrected version of ``raw_transcript``.

    Falls back to the raw transcript unchanged on ANY of: empty/short input,
    system marker, no resume context, LLM failure/timeout, or a degenerate
    (too-long / preamble) model response. This function never raises.

    Result is cached on (session_id, turn_id) when both are provided so the
    report path reuses the live-interview repair instead of re-calling the LLM.
    """
    raw = (raw_transcript or "").strip()
    if not raw:
        return raw_transcript or ""

    # Control markers and very short answers cannot benefit — skip the round-trip.
    if _has_system_marker(raw):
        return raw_transcript
    if len(raw.split()) < _MIN_WORDS_FOR_REPAIR:
        return raw_transcript

    resume_flat = _coerce_resume_text(resume_text)
    if not resume_flat:
        # Without resume ground truth the repair pass has nothing the static
        # dictionary doesn't already cover — let the existing chain handle it.
        return raw_transcript

    cache_key = _cache_key(raw, session_id, turn_id)
    cached = _REPAIR_CACHE.get(cache_key)
    if cached is not None:
        return cached

    prompt = _REPAIR_PROMPT_TEMPLATE.format(
        resume_text=resume_flat[:_MAX_RESUME_CHARS],
        raw_transcript=raw[:_MAX_TRANSCRIPT_CHARS],
    )

    settings = get_settings()
    try:
        repaired = await call_llm(
            [{"role": "system", "content": prompt}],
            temperature=0.0,
            max_tokens=500,
            model=settings.GROQ_EVAL_MODEL,
            retries=1,
            timeout=6.0,
            fallback_timeout=7.0,
            # Repair quality matters more than provider; allow OpenAI fallback,
            # but the whole call is best-effort and degrades to raw on failure.
            allow_provider_fallback=True,
        )
    except Exception as exc:  # noqa: BLE001 — never break scoring on repair
        logger.warning(
            "transcript_repair_failed",
            error=str(exc),
            session_id=session_id,
            turn_id=turn_id,
        )
        _REPAIR_CACHE[cache_key] = raw_transcript
        return raw_transcript

    repaired = (repaired or "").strip()
    # Strip an accidental wrapping in quotes/backticks the model sometimes adds.
    repaired = repaired.strip("`").strip()
    repaired = re.sub(r"^CORRECTED TRANSCRIPT:\s*", "", repaired, flags=re.IGNORECASE).strip()

    if _looks_degenerate(repaired, raw):
        logger.info(
            "transcript_repair_rejected_degenerate",
            session_id=session_id,
            turn_id=turn_id,
            raw_len=len(raw),
            repaired_len=len(repaired),
        )
        _REPAIR_CACHE[cache_key] = raw_transcript
        return raw_transcript

    _REPAIR_CACHE[cache_key] = repaired
    return repaired
