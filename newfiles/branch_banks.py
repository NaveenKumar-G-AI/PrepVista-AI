"""
PrepVista — Branch Question Bank Loader
=======================================
Loads and validates the per-branch technical seed banks in `data/branch_<key>.json`
and exposes them to q_technical_domain.py. Each bank groups real seed questions by
topic and difficulty (easy/medium/hard). These steer the live LLM and act as graceful-
degradation fallbacks per engineering branch; they are NOT a fixed question paper.

Pure stdlib, defensive: a missing or malformed bank degrades to an empty result
rather than raising, so the technical module always stays serviceable.
"""

from __future__ import annotations

import json
import os
import random
from functools import lru_cache

BRANCH_KEYS: tuple[str, ...] = ("cse", "aids", "aiml", "ece", "eee", "mech", "civil", "cyber")
DIFFICULTIES: tuple[str, ...] = ("easy", "medium", "hard")

_DATA_DIR = os.path.join(os.path.dirname(__file__), "data")


def validate_bank(bank: dict) -> list[str]:
    """Return a list of problems with a branch bank (empty == valid)."""
    errs: list[str] = []
    if not isinstance(bank, dict):
        return ["bank is not an object"]
    if not bank.get("branch"):
        errs.append("missing 'branch'")
    if not bank.get("label"):
        errs.append("missing 'label'")
    topics = bank.get("topics")
    if not isinstance(topics, list) or not topics:
        errs.append("missing or empty 'topics'")
        return errs
    seen: set[str] = set()
    for t in topics:
        name = t.get("topic", "<unnamed>")
        if not t.get("subtopics"):
            errs.append(f"{name}: no subtopics")
        q = t.get("questions", {})
        for d in DIFFICULTIES:
            items = q.get(d, [])
            if not isinstance(items, list) or len(items) < 3:
                errs.append(f"{name}/{d}: fewer than 3 questions")
            for item in items:
                if not isinstance(item, str) or len(item.strip()) < 8:
                    errs.append(f"{name}/{d}: malformed question")
                elif item in seen:
                    errs.append(f"duplicate question: {item[:40]}")
                else:
                    seen.add(item)
    return errs


@lru_cache(maxsize=None)
def load_bank(branch: str) -> dict:
    """Load one branch bank from disk. Returns {} if missing/invalid."""
    key = (branch or "").strip().lower()
    path = os.path.join(_DATA_DIR, f"branch_{key}.json")
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            bank = json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}
    return bank if not validate_bank(bank) else bank  # keep even if minor issues; callers degrade


def available_branches() -> list[str]:
    """Which branch banks are actually present on disk and valid."""
    out: list[str] = []
    for key in BRANCH_KEYS:
        bank = load_bank(key)
        if bank and not validate_bank(bank):
            out.append(key)
    return out


def topics_for_branch(branch: str) -> list[str]:
    return [t.get("topic", "") for t in load_bank(branch).get("topics", [])]


def subtopics_for(branch: str, topic: str) -> list[str]:
    for t in load_bank(branch).get("topics", []):
        if t.get("topic") == topic:
            return list(t.get("subtopics", []))
    return []


def questions_for(branch: str, topic: str, difficulty: str) -> list[str]:
    for t in load_bank(branch).get("topics", []):
        if t.get("topic") == topic:
            return list(t.get("questions", {}).get(difficulty, []))
    return []


def all_questions(branch: str, difficulty: str | None = None) -> list[str]:
    out: list[str] = []
    for t in load_bank(branch).get("topics", []):
        q = t.get("questions", {})
        for d in (DIFFICULTIES if difficulty is None else (difficulty,)):
            out.extend(q.get(d, []))
    return out


def random_seed_question(branch: str, difficulty: str, rng: random.Random | None = None,
                         *, exclude: set[str] | None = None) -> str | None:
    """Pick a seed question for a branch+difficulty, avoiding `exclude` if possible."""
    pool = all_questions(branch, difficulty)
    if not pool:
        return None
    exclude = exclude or set()
    fresh = [q for q in pool if q not in exclude] or pool
    return (rng or random).choice(fresh)


def bank_stats(branch: str) -> dict[str, object]:
    bank = load_bank(branch)
    topics = bank.get("topics", [])
    by_diff = {d: sum(len(t.get("questions", {}).get(d, [])) for t in topics) for d in DIFFICULTIES}
    return {
        "branch": branch, "label": bank.get("label", ""), "present": bool(bank),
        "valid": bool(bank) and not validate_bank(bank), "topics": len(topics),
        "questions_by_difficulty": by_diff, "total_questions": sum(by_diff.values()),
    }


def all_bank_stats() -> list[dict[str, object]]:
    return [bank_stats(k) for k in BRANCH_KEYS]


__all__ = [
    "BRANCH_KEYS", "DIFFICULTIES", "validate_bank", "load_bank", "available_branches",
    "topics_for_branch", "subtopics_for", "questions_for", "all_questions",
    "random_seed_question", "bank_stats", "all_bank_stats",
]
