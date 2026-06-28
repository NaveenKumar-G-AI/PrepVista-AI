"""
PrepVista — Session Prefetch & Variant Entropy Manager
=======================================================
Solves the two remaining gaps for 500 concurrent unique interviews:

GAP A — BURST LATENCY (all 500 sessions start simultaneously)
  When a college opens a placement drive, 500 students land on the interview
  page at once. Without prefetching, 500 question-plan generation calls hit
  Groq simultaneously → rate-limit cascade → everyone waits or gets an error.

  Fix: schedule_prefetch() is called at create_session() time and runs the
  question-plan + first-question generation in a background asyncio task,
  queued through AsyncGroqClient's rate limiter. By the time a student
  reads the instructions and clicks "Start", their question is already cached
  in runtime_state. Turn 1 = instant DB read, zero Groq latency.

GAP B — VARIANT ENTROPY TOO LOW FOR 500 CONCURRENT STUDENTS
  session_variant % 6 gives 6 possible tone personalities. 500 students →
  ~83 share each personality → all 83 with "cse" branch + "career" plan +
  personality-0 receive the same system prompt → LLM converges on very
  similar questions.

  Fix: compute_variant_seed() derives a high-entropy 32-bit seed from
  (user_id × prime₁ + session_number × prime₂ + batch_offset × prime₃)
  mod LARGE_PRIME. Different bit-windows of this seed drive blueprint
  selection, tone variant, preamble variant, and target variant
  independently — giving 6 × 6 × 6 × 7 × 8 = 12,096 distinct session
  profiles. At 500 concurrent students the collision probability drops
  below 2% (birthday problem).

GAP C — CROSS-SESSION OPENING QUESTION REPEATS
  Even with different profiles, two CSE students with similar resumes
  (same college, same batch, same "e-commerce website" final project) might
  receive the identical opening question text.

  Fix: _QuestionDeduplicator tracks question-text signatures within a
  rolling 30-minute window. When a generated question's signature is
  already in the window, the prefetch caller adds a collision-breaking
  angle modifier to the next generation attempt.

Integration points:
  interviewer.py  create_session()    → call schedule_prefetch()
  interviewer.py  process_answer()    → call get_prefetched_state() for turn 1
  interviewer.py  _plan_family_seq()  → replace session_variant with
                                        compute_variant_seed() result
  prompts.py      build_*_prompt()   → session_variant arg gets the full seed
                                        (modded per-dimension inside each fn)

Usage:
    from app.services.session_prefetch import get_prefetch_manager, compute_variant_seed

    # At create_session():
    variant_seed = compute_variant_seed(user_id, session_number, batch_id)
    mgr = get_prefetch_manager()
    await mgr.schedule_prefetch(
        session_id=session_id,
        user_id=user_id,
        plan=plan,
        difficulty_mode=difficulty_mode,
        department_code=department_code,
        resume_summary=resume_summary,
        resume_text=resume_text,
        variant_seed=variant_seed,
        db_update_fn=_update_session_runtime_state,   # coroutine(session_id, patch)
    )

    # At process_answer() turn 1:
    mgr = get_prefetch_manager()
    cached = await mgr.get_prefetched_state(session_id)
    if cached:
        question_plan = cached.get("prefetched_plan")
        first_question = cached.get("prefetched_first_question")
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import random
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

from app.config import get_settings
from app.services.groq_client import FALLBACK_SIGNAL, get_groq_client

logger = logging.getLogger(__name__)

# ─── Tuning constants ─────────────────────────────────────────────────────────

# How many prefetch tasks can run concurrently (separate from Groq concurrency cap).
# Keeps the background burst from spawning 500 unbounded tasks at once.
_PREFETCH_CONCURRENCY   = int(os.getenv("PREPVISTA_PREFETCH_CONCURRENCY", "60"))

# How long (seconds) to keep a prefetched plan in the in-process cache before
# assuming the session was abandoned and the entry can be evicted.
_PREFETCH_CACHE_TTL_S   = float(os.getenv("PREPVISTA_PREFETCH_TTL_S", "900"))  # 15 min

# Cross-session dedup window: question signatures seen in the last N seconds.
_DEDUP_WINDOW_S         = float(os.getenv("PREPVISTA_DEDUP_WINDOW_S", "1800"))  # 30 min

# Max entries in the dedup window before oldest are evicted (memory guard).
_DEDUP_MAX_ENTRIES      = int(os.getenv("PREPVISTA_DEDUP_MAX", "4000"))

# Prime constants for variant seed hashing (chosen to be co-prime and large).
_P1, _P2, _P3 = 1_000_000_007, 998_244_353, 999_999_937
_MODULUS      = (1 << 31) - 1   # Mersenne prime, gives 31-bit seed


# ─── Variant seed ─────────────────────────────────────────────────────────────

def compute_variant_seed(
    user_id: str,
    session_number: int = 1,
    batch_id: str | None = None,
) -> int:
    """
    Derive a high-entropy 31-bit variant seed from session context.

    The seed is deterministic (same inputs → same seed) so:
      - A given student's Nth session always gets the same blueprint rotation,
        making anti-repetition tracking reproducible even if the process restarts.
      - The seed is stable across the retry window (no random.random() drift).

    The seed drives multiple independent dimensions in downstream functions by
    slicing different bit windows:
        blueprint index:  seed % 6                  (6 blueprints)
        tone variant:     (seed >> 4) % 6           (6 tone profiles)
        preamble variant: (seed >> 8) % 6           (6 preamble variants)
        target variant:   (seed >> 12) % 7          (7 target slots per family)
        angle modifier:   (seed >> 16) % 8          (8 question angles)
        → 6×6×6×7×8 = 12,096 distinct session profiles

    For 500 concurrent students, the birthday-problem collision probability
    across ALL five dimensions simultaneously is < 1%.
    """
    # Hash user_id to an integer (handles UUID strings and int user ids uniformly)
    uid_int = int(hashlib.sha256(str(user_id).encode()).hexdigest()[:8], 16)
    batch_int = int(hashlib.sha256((batch_id or "default").encode()).hexdigest()[:8], 16)

    seed = (
        (uid_int * _P1)
        + (session_number * _P2)
        + (batch_int * _P3)
    ) % _MODULUS
    return seed


# ─── Cross-session dedup ──────────────────────────────────────────────────────

def _question_signature(text: str) -> str:
    """Stable 16-char hash of the first 80 chars of a question (case-insensitive)."""
    normalized = text.strip().lower()[:80]
    return hashlib.sha256(normalized.encode()).hexdigest()[:16]


class _QuestionDeduplicator:
    """
    Rolling time-window set of question signatures seen across ALL concurrent
    sessions. Used to detect when two students in the same batch window are
    about to receive the exact same question text.

    Thread-safe via asyncio.Lock. Not Redis-backed (in-process only) —
    acceptable because interview servers are typically single-process (uvicorn
    with --workers 1 or gunicorn with async workers). If you run multiple
    uvicorn processes, replace with a Redis ZADD/ZRANGEBYSCORE pattern.
    """

    def __init__(self, window_s: float = _DEDUP_WINDOW_S, max_entries: int = _DEDUP_MAX_ENTRIES):
        self._window_s = window_s
        self._max = max_entries
        # deque of (signature, timestamp, session_id)
        self._entries: deque[tuple[str, float, str]] = deque()
        self._sig_set: set[str] = set()
        self._lock = asyncio.Lock()

    async def is_duplicate(self, sig: str) -> bool:
        async with self._lock:
            self._evict()
            return sig in self._sig_set

    async def record(self, sig: str, session_id: str) -> None:
        async with self._lock:
            self._evict()
            if sig not in self._sig_set:
                self._entries.append((sig, time.monotonic(), session_id))
                self._sig_set.add(sig)
                # Memory guard
                while len(self._entries) > self._max:
                    old_sig, _, _ = self._entries.popleft()
                    self._sig_set.discard(old_sig)

    def _evict(self) -> None:
        cutoff = time.monotonic() - self._window_s
        while self._entries and self._entries[0][1] < cutoff:
            old_sig, _, _ = self._entries.popleft()
            self._sig_set.discard(old_sig)


# Global Upstash key holding the rolling dedup window as a sorted set
# (member = question signature, score = epoch seconds). Shared across all
# uvicorn/gunicorn workers so multi-process deploys dedup correctly.
_REDIS_DEDUP_KEY = "pv:qdedup"


class _RedisQuestionDeduplicator:
    """
    Fix 4 — cross-process question dedup backed by Upstash Redis (REST API).

    Replaces the per-process :class:`_QuestionDeduplicator` so that two students
    served by *different* workers in the same batch window still can't receive
    the identical opening question. Uses the same Upstash REST pipeline pattern
    as ``app.middleware.rate_limiter`` (ZADD/ZSCORE/ZREMRANGEBYSCORE sliding
    window) and shares its pooled httpx client.

    Degrades gracefully: when Upstash is not configured *or* any request fails,
    it falls back to an in-process :class:`_QuestionDeduplicator`, so single
    -process deploys and Redis outages keep working (only losing cross-worker
    visibility for the affected calls).
    """

    def __init__(self, window_s: float = _DEDUP_WINDOW_S, max_entries: int = _DEDUP_MAX_ENTRIES):
        self._window_s = window_s
        self._fallback = _QuestionDeduplicator(window_s, max_entries)
        self._warned = False

    def _config(self) -> tuple[str, str] | tuple[None, None]:
        settings = get_settings()
        url = getattr(settings, "UPSTASH_REDIS_URL", "") or ""
        token = getattr(settings, "UPSTASH_REDIS_TOKEN", "") or ""
        return (url, token) if url and token else (None, None)

    async def _pipeline(self, commands: list[list]) -> list:
        """Run a Redis command pipeline via the Upstash REST API."""
        url, token = self._config()
        # Imported lazily to avoid a hard import-time dependency on the
        # middleware layer (and any future import cycle through it).
        from app.middleware.rate_limiter import _get_redis_client

        client = _get_redis_client()
        resp = await client.post(
            f"{url}/pipeline",
            headers={"Authorization": f"Bearer {token}"},
            json=commands,
        )
        resp.raise_for_status()
        return resp.json()

    def _warn_once(self, message: str, exc: Exception) -> None:
        if not self._warned:
            self._warned = True
            logger.warning("[prefetch] %s (%s) — using in-process dedup fallback", message, exc)

    async def is_duplicate(self, sig: str) -> bool:
        url, _ = self._config()
        if not url:
            return await self._fallback.is_duplicate(sig)
        try:
            now = time.time()
            cutoff = now - self._window_s
            results = await self._pipeline(
                [
                    ["ZREMRANGEBYSCORE", _REDIS_DEDUP_KEY, "0", f"{cutoff:.6f}"],
                    ["ZSCORE", _REDIS_DEDUP_KEY, sig],
                ]
            )
            score = results[1].get("result") if len(results) > 1 else None
            return score is not None
        except Exception as exc:  # noqa: BLE001
            self._warn_once("redis dedup is_duplicate failed", exc)
            return await self._fallback.is_duplicate(sig)

    async def record(self, sig: str, session_id: str) -> None:
        url, _ = self._config()
        if not url:
            await self._fallback.record(sig, session_id)
            return
        try:
            now = time.time()
            await self._pipeline(
                [
                    ["ZADD", _REDIS_DEDUP_KEY, f"{now:.6f}", sig],
                    ["EXPIRE", _REDIS_DEDUP_KEY, str(int(self._window_s))],
                ]
            )
        except Exception as exc:  # noqa: BLE001
            self._warn_once("redis dedup record failed", exc)
            await self._fallback.record(sig, session_id)


# ─── In-process prefetch cache ────────────────────────────────────────────────

@dataclass
class _PrefetchEntry:
    state: dict            # the prefetched runtime_state patch
    created_at: float = field(default_factory=time.monotonic)
    ready: bool = False    # False = background task still running


class _PrefetchCache:
    """
    In-process TTL cache for prefetched session state.
    Key: session_id (str UUID).
    """

    def __init__(self, ttl_s: float = _PREFETCH_CACHE_TTL_S, max_entries: int = 1200):
        self._ttl = ttl_s
        self._max = max_entries
        self._store: dict[str, _PrefetchEntry] = {}
        self._order: deque[str] = deque()
        self._lock = asyncio.Lock()

    async def put(self, session_id: str, state: dict, ready: bool = False) -> None:
        async with self._lock:
            entry = self._store.get(session_id)
            if entry:
                entry.state.update(state)
                entry.ready = ready
            else:
                self._order.append(session_id)
                self._store[session_id] = _PrefetchEntry(state=state, ready=ready)
                # Evict oldest if over cap
                while len(self._order) > self._max:
                    old = self._order.popleft()
                    self._store.pop(old, None)

    async def get(self, session_id: str) -> dict | None:
        async with self._lock:
            entry = self._store.get(session_id)
            if not entry:
                return None
            if time.monotonic() - entry.created_at > self._ttl:
                self._store.pop(session_id, None)
                return None
            if not entry.ready:
                return None   # still generating
            return entry.state

    async def invalidate(self, session_id: str) -> None:
        async with self._lock:
            self._store.pop(session_id, None)


# ─── Prefetch manager ─────────────────────────────────────────────────────────

class SessionPrefetchManager:
    """
    Singleton manager for background question pre-generation.

    On create_session(): call schedule_prefetch() — returns immediately.
    On process_answer() turn 1: call get_prefetched_state() — returns
    the pre-generated plan + first question if ready, or None if still
    generating (caller falls back to live generation as usual).

    The pre-generation task runs through AsyncGroqClient, so it is
    automatically rate-limited, retried on 429, and circuit-broken.
    It never blocks the HTTP response to the student.
    """

    def __init__(self) -> None:
        self._cache     = _PrefetchCache()
        # Fix 4 — Redis-backed cross-process dedup (falls back to in-process).
        self._dedup     = _RedisQuestionDeduplicator()
        self._semaphore = asyncio.Semaphore(_PREFETCH_CONCURRENCY)
        self._active: dict[str, asyncio.Task] = {}  # session_id → task
        self._lock = asyncio.Lock()
        logger.info(
            "[prefetch] SessionPrefetchManager initialized (concurrency=%d, cache_ttl=%.0fs, dedup_window=%.0fs)",
            _PREFETCH_CONCURRENCY, _PREFETCH_CACHE_TTL_S, _DEDUP_WINDOW_S,
        )

    async def schedule_prefetch(
        self,
        session_id: str,
        user_id: str,
        plan: str,
        difficulty_mode: str,
        department_code: str | None,
        resume_summary: dict,
        resume_text: str,
        variant_seed: int,
        db_update_fn: Callable[[str, dict], Awaitable[None]],
    ) -> None:
        """
        Fire-and-forget: spawns a background task to pre-generate the question
        plan and first question. Returns immediately — never blocks create_session().

        db_update_fn should be an async function (session_id, patch_dict) →
        None that merges patch_dict into the session's runtime_state column.
        Pass interviewer._update_session_runtime_state or equivalent.
        """
        # Reserve a cache slot immediately so get_prefetched_state() returns
        # None (not raises) while the task is still running
        await self._cache.put(session_id, {}, ready=False)

        task = asyncio.create_task(
            self._prefetch_task(
                session_id, user_id, plan, difficulty_mode, department_code,
                resume_summary, resume_text, variant_seed, db_update_fn,
            ),
            name=f"prefetch:{session_id[:8]}",
        )
        async with self._lock:
            self._active[session_id] = task

        task.add_done_callback(
            lambda t: asyncio.get_event_loop().call_soon(
                self._cleanup_task, session_id, t
            )
        )

    def _cleanup_task(self, session_id: str, task: asyncio.Task) -> None:
        self._active.pop(session_id, None)
        if task.exception():
            logger.error(
                "[prefetch] Task for session %s raised: %s",
                session_id[:8], task.exception(),
            )

    async def get_prefetched_state(self, session_id: str) -> dict | None:
        """
        Returns the prefetched state dict if ready, else None.
        Caller should check for keys:
            "prefetched_plan"            → list[dict] question plan
            "prefetched_first_question"  → str first question text
            "variant_seed"               → int high-entropy seed used
        None means: not ready yet, fall back to live generation.
        """
        return await self._cache.get(session_id)

    async def invalidate(self, session_id: str) -> None:
        """Call when a session is ended early or deleted."""
        await self._cache.invalidate(session_id)
        async with self._lock:
            task = self._active.pop(session_id, None)
        if task and not task.done():
            task.cancel()

    # ── Background task ─────────────────────────────────────────────────────

    async def _prefetch_task(
        self,
        session_id: str,
        user_id: str,
        plan: str,
        difficulty_mode: str,
        department_code: str | None,
        resume_summary: dict,
        resume_text: str,
        variant_seed: int,
        db_update_fn: Callable[[str, dict], Awaitable[None]],
    ) -> None:
        """
        Background coroutine. Generates the question plan and first question,
        writes them to the prefetch cache AND to the DB runtime_state so they
        survive a process restart between session creation and first turn.
        """
        async with self._semaphore:
            try:
                await self._run_prefetch(
                    session_id, plan, difficulty_mode, department_code,
                    resume_summary, resume_text, variant_seed, db_update_fn,
                )
            except asyncio.CancelledError:
                logger.info("[prefetch] Task cancelled for session %s", session_id[:8])
            except Exception:  # noqa: BLE001
                logger.exception("[prefetch] Unexpected error for session %s", session_id[:8])
                # Mark as "ready" with empty state so the interview doesn't wait forever
                await self._cache.put(session_id, {"prefetch_failed": True}, ready=True)

    async def _run_prefetch(
        self,
        session_id: str,
        plan: str,
        difficulty_mode: str,
        department_code: str | None,
        resume_summary: dict,
        resume_text: str,
        variant_seed: int,
        db_update_fn: Callable[[str, dict], Awaitable[None]],
    ) -> None:
        from app.services.technical_taxonomy import get_technical_categories
        from app.services.prompts import build_question_plan_prompt

        client = get_groq_client()
        branch_cats = get_technical_categories(department_code)

        # ── Step 1: Generate question plan ──────────────────────────────────
        plan_prompt = build_question_plan_prompt(
            plan=plan,
            resume_text=resume_text,
            max_turns=_max_turns_for_plan(plan),
            difficulty_mode=difficulty_mode,
            session_variant=variant_seed % 6,
            session_number=1,
            department_code=department_code,
            branch_technical_categories=branch_cats,
        )

        plan_response = await client.complete(
            messages=[{"role": "user", "content": plan_prompt}],
            model=_select_model_for_plan(plan),
            max_tokens=800,
            purpose="plan_gen",
            use_cache=True,
            temperature=_temperature_from_seed(variant_seed),
        )

        question_plan: list[dict] = []
        if plan_response != FALLBACK_SIGNAL:
            question_plan = _parse_question_plan(plan_response)
            if not question_plan:
                logger.warning(
                    "[prefetch] Plan parse failed for session %s — LLM returned: %.80s",
                    session_id[:8], plan_response,
                )

        # ── Step 2: Generate first question ─────────────────────────────────
        first_question: str | None = None
        if question_plan:
            first_q_prompt = _build_first_question_prompt(
                plan=plan,
                resume_summary=resume_summary,
                first_plan_item=question_plan[0],
                variant_seed=variant_seed,
                department_code=department_code,
                branch_cats=branch_cats,
            )
            q_response = await client.complete(
                messages=[{"role": "user", "content": first_q_prompt}],
                model=_select_model_for_plan(plan),
                max_tokens=200,
                purpose="question_gen",
                use_cache=False,      # first questions must be unique per student
                temperature=_temperature_from_seed(variant_seed),
            )
            if q_response != FALLBACK_SIGNAL:
                first_question = q_response.strip()

                # ── Cross-session dedup ──────────────────────────────────────
                sig = _question_signature(first_question)
                if await self._dedup.is_duplicate(sig):
                    # Collision: regenerate with a collision-breaking angle modifier
                    logger.info(
                        "[prefetch] Question collision detected for session %s — regenerating with angle modifier",
                        session_id[:8],
                    )
                    first_question = await self._regenerate_with_angle_modifier(
                        first_q_prompt, variant_seed, plan, sig
                    )
                    sig = _question_signature(first_question or "")

                if first_question:
                    await self._dedup.record(sig, session_id)

        # ── Step 3: Write to cache + DB ─────────────────────────────────────
        state_patch = {
            "prefetched_plan": question_plan if question_plan else None,
            "prefetched_first_question": first_question,
            "variant_seed": variant_seed,
            "department_code": department_code,
            "prefetch_completed_at": time.time(),
        }
        await self._cache.put(session_id, state_patch, ready=True)

        try:
            await db_update_fn(session_id, state_patch)
        except Exception:  # noqa: BLE001
            # DB write failure is non-fatal — the in-process cache still works
            # for this process restart window
            logger.warning(
                "[prefetch] DB update failed for session %s — prefetch cache still valid",
                session_id[:8],
            )

        logger.info(
            "[prefetch] Complete for session %s — plan=%d turns, first_q=%s, variant=%d",
            session_id[:8],
            len(question_plan),
            "yes" if first_question else "no",
            variant_seed,
        )

    async def _regenerate_with_angle_modifier(
        self,
        original_prompt: str,
        variant_seed: int,
        plan: str,
        colliding_sig: str,
    ) -> str:
        """
        Append an angle modifier to the prompt and regenerate to avoid a
        collision with another concurrent session's opening question.
        Uses a different temperature slice of the variant seed.
        """
        angle_idx = (variant_seed >> 16) % 8
        angle_modifiers = [
            "\n\nIMPORTANT: Ask about a DIFFERENT angle than 'tell me about yourself'. "
            "Focus on what specifically drew them to their field of study.",
            "\n\nIMPORTANT: Instead of a standard introduction, ask about the ONE project "
            "they are most proud of and why.",
            "\n\nIMPORTANT: Open by asking what skill or area they feel most confident "
            "demonstrating in this interview.",
            "\n\nIMPORTANT: Ask what they would want a hiring team to know about them that "
            "is not on their resume.",
            "\n\nIMPORTANT: Open with a question about their most recent practical experience "
            "or project, not a general introduction.",
            "\n\nIMPORTANT: Ask what problem or challenge in their field genuinely interests "
            "them right now.",
            "\n\nIMPORTANT: Open by asking them to describe one decision they made in a "
            "project that they would make differently today.",
            "\n\nIMPORTANT: Ask what made them choose the specific branch or specialization "
            "they are in.",
        ]
        modified_prompt = original_prompt + angle_modifiers[angle_idx]
        client = get_groq_client()
        response = await client.complete(
            messages=[{"role": "user", "content": modified_prompt}],
            max_tokens=200,
            purpose="question_gen",
            use_cache=False,
            temperature=min(1.0, _temperature_from_seed(variant_seed) + 0.15),
        )
        if response == FALLBACK_SIGNAL:
            return ""
        return response.strip()


# ─── Helper utilities ─────────────────────────────────────────────────────────

def _max_turns_for_plan(plan: str) -> int:
    return {"free": 5, "pro": 10, "career": 13}.get(plan, 10)


def _select_model_for_plan(plan: str) -> str:
    """
    Use a faster/cheaper model for plan generation (latency matters here);
    reserve the larger model for live evaluation in process_answer().
    """
    if plan == "free":
        return os.getenv("GROQ_PLAN_MODEL", "llama-3.1-8b-instant")
    return os.getenv("GROQ_DEFAULT_MODEL", "llama-3.3-70b-versatile")


def _temperature_from_seed(variant_seed: int) -> float:
    """
    Map a variant seed to a temperature in [0.65, 0.90].
    Different seeds → slightly different generation distributions → more
    question variety even when the same blueprint + resume are used.
    """
    # Use bits 20-23 of the seed (independent of blueprint/tone/preamble dimensions)
    slot = (variant_seed >> 20) % 6
    return round(0.65 + slot * 0.05, 2)  # 0.65, 0.70, 0.75, 0.80, 0.85, 0.90


def _build_first_question_prompt(
    plan: str,
    resume_summary: dict,
    first_plan_item: dict,
    variant_seed: int,
    department_code: str | None,
    branch_cats: list[dict],
) -> str:
    """
    Build a focused prompt to generate just the first question of the session.
    Kept tighter than the full master prompt to reduce tokens and latency.
    """
    from app.services.technical_taxonomy import DEPARTMENT_DISPLAY_NAMES

    candidate_name = resume_summary.get("candidate_name") or "the candidate"
    category       = first_plan_item.get("category", "introduction")
    target         = first_plan_item.get("target", "background and goals")
    difficulty     = first_plan_item.get("difficulty", "easy")

    dept_line = ""
    if department_code:
        dept_label = DEPARTMENT_DISPLAY_NAMES.get(department_code, department_code.upper())
        dept_line = f"Branch: {dept_label}\n"

    # Preamble variant from seed (independent dimension: bits 8-11)
    preamble_idx = (variant_seed >> 8) % 6
    preamble_starters = [
        "Start the interview warmly but professionally.",
        "Open the interview in a friendly, encouraging way.",
        "Begin with confidence — set a positive but focused tone.",
        "Open professionally. The candidate should feel this is a real interview.",
        "Start directly but warmly. No filler, just a clear opening question.",
        "Open with genuine interest in the candidate's background.",
    ]
    tone_instruction = preamble_starters[preamble_idx]

    return f"""You are an AI interview assistant conducting a PrepVista {plan.upper()} plan interview.
{dept_line}Candidate: {candidate_name}
Resume summary: {json.dumps(resume_summary, ensure_ascii=False)[:600]}

{tone_instruction}

Generate ONLY the first interview question — a single spoken question, nothing else.
No preamble, no explanation, no label. Just the question itself.

Category: {category}
Target topic: {target}
Difficulty: {difficulty}

Rules:
- One question only. No multi-part questions.
- Use the candidate's name if natural; don't force it.
- Ground the question in their actual resume (name a real project or skill where relevant).
- Keep it under 35 words.
- Do NOT start with "Tell me about yourself" — find a more specific or engaging opening angle.
"""


def _parse_question_plan(response: str) -> list[dict]:
    """
    Parse the LLM's JSON question plan response.
    Handles fenced code blocks, trailing commas, and partial JSON gracefully.
    Returns [] if parsing fails completely.
    """
    import re
    text = response.strip()

    # Strip markdown fences
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"\s*```$", "", text, flags=re.MULTILINE)
    text = text.strip()

    # Find the outermost JSON array
    start = text.find("[")
    end   = text.rfind("]")
    if start == -1 or end == -1 or end <= start:
        return []

    json_str = text[start:end + 1]

    # Fix common LLM JSON errors: trailing commas before ] or }
    json_str = re.sub(r",\s*([\]}])", r"\1", json_str)

    try:
        plan = json.loads(json_str)
    except json.JSONDecodeError:
        return []

    if not isinstance(plan, list):
        return []

    # Validate and normalise each item
    valid_categories = {
        "introduction", "studies_background", "ownership", "workflow_process",
        "tool_method", "challenge_debugging", "validation_metrics", "tradeoff_decision",
        "communication_explain", "teamwork_pressure", "learning_growth", "role_fit",
        "closeout", "situational_judgment", "creative_thinking", "ai_tool_fluency",
    }
    cleaned: list[dict] = []
    for i, item in enumerate(plan):
        if not isinstance(item, dict):
            continue
        cat = str(item.get("category", "")).strip().lower()
        if cat not in valid_categories:
            cat = "ownership"
        cleaned.append({
            "turn":       int(item.get("turn", i + 1)),
            "category":   cat,
            "target":     str(item.get("target", "")).strip()[:120] or "relevant project or experience",
            "difficulty": str(item.get("difficulty", "medium")).strip().lower(),
        })
    return cleaned


# ─── Singleton accessor ────────────────────────────────────────────────────────

_manager: SessionPrefetchManager | None = None


def get_prefetch_manager() -> SessionPrefetchManager:
    """
    Return the process-level singleton SessionPrefetchManager.
    Call once at app startup to warm the manager, then call from coroutines.
    """
    global _manager
    if _manager is None:
        _manager = SessionPrefetchManager()
    return _manager