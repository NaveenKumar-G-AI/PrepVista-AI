"""
PrepVista — Roster Resolver (Feature #01, M7)
=============================================
Breadth is the product's compounding asset and its moat (Dossier Part 8/13). This
module is the single entry point a student's company search hits — and it
**never dead-ends**:

    resolve_company("Hexaware")  → Tier-B  (mass_service template)
    resolve_company("Google")    → Tier-A  (hand-verified blueprint)
    resolve_company("Some Bank")→ Tier-C  (general → mass_service generic)
    resolve_company("Newco Ltd")→ Tier-C  (unknown → nearest archetype, generic badge)

Three tiers, resolved in order:
  * **Tier A** — one of the 11 hand-verified blueprints (``format_confidence >=
    0.85``, exotic rounds modeled). Matched by id / display name / alias.
  * **Tier B** — a named company in ``roster_tier_b.json`` mapped to an archetype;
    :func:`~app.services.company_sim.archetype_factory.materialize_blueprint`
    builds a first-class blueprint on the fly (~0.6 confidence, verify banner).
  * **Tier C** — any of the 611 names in ``company_directory.json`` (from
    ``companies.json``) via its ``CompanyType`` → archetype default (~0.42
    confidence, "generic format" badge). An unknown name still resolves to the
    ``mass_service`` generic so there is never a "company not found".

Every resolution is a full :class:`CompanyBlueprint` that runs unchanged through
the orchestrator → resolver → report. Adding/promoting a company is a **data**
edit (a name in Tier-B, or a new Tier-A JSON) — **zero code**. A "request full
modeling" call records a demand signal that prioritizes Tier-A/B promotion.

Pure stdlib, deterministic, never raises out of :func:`resolve_company`.
"""

from __future__ import annotations

import json
import os
import re
import time
from dataclasses import dataclass, field
from typing import Any

from app.services.company_sim.archetype_factory import materialize_blueprint
from app.services.company_sim.loader import (
    load_all_blueprints,
    load_archetypes,
)
from app.services.company_sim.models import CompanyBlueprint

_DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
_TIER_B_PATH = os.path.join(_DATA_DIR, "roster_tier_b.json")
_DIRECTORY_PATH = os.path.join(_DATA_DIR, "company_directory.json")
_REQUESTS_PATH = os.path.join(_DATA_DIR, "modeling_requests.jsonl")

_BADGE = {
    "A": "",
    "B": "Template-mapped — verify the exact rounds before your drive.",
    "C": "Generic format — confirm with your placement cell.",
}


def _norm(name: str) -> str:
    """Match key: lowercase, drop punctuation/spacing and common suffixes."""
    n = re.sub(r"[^a-z0-9]+", " ", str(name).lower()).strip()
    n = re.sub(r"\b(pvt|private|ltd|limited|inc|llp|technologies|technology|labs|india|"
               r"global|tech|solutions|services|systems|company|co)\b", "", n)
    return re.sub(r"\s+", "", n)


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(name).lower()).strip("_") or "company"


# ── cached data ─────────────────────────────────────────────────────────────────

def _read_json(path: str) -> dict[str, Any]:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


class _RosterIndex:
    """Lazily-built lookup over the three tiers (built once, reused)."""

    def __init__(self) -> None:
        self._built = False
        self.tier_a: dict[str, str] = {}                       # normname → company_id
        self.tier_a_bp: dict[str, CompanyBlueprint] = {}
        self.tier_b: dict[str, tuple[str, str]] = {}           # normname → (display, archetype)
        self.tier_c: dict[str, tuple[str, str]] = {}           # normname → (display, archetype)
        self.archetypes: dict[str, Any] = {}

    def build(self) -> "_RosterIndex":
        if self._built:
            return self
        self.archetypes = load_archetypes()
        # Tier A
        self.tier_a_bp = load_all_blueprints()
        for cid, bp in self.tier_a_bp.items():
            for key in {cid, bp.display_name, *bp.aliases}:
                self.tier_a[_norm(key)] = cid
        # Tier B
        tb = _read_json(_TIER_B_PATH).get("by_archetype", {})
        for arch, names in tb.items():
            for name in names:
                nn = _norm(name)
                if nn not in self.tier_a:      # a Tier-A company overrides its Tier-B listing
                    self.tier_b.setdefault(nn, (name, arch))
        # Tier C
        directory = _read_json(_DIRECTORY_PATH).get("companies", {})
        for name, meta in directory.items():
            nn = _norm(name)
            if nn not in self.tier_a and nn not in self.tier_b:
                self.tier_c.setdefault(nn, (name, meta.get("archetype", "mass_service")))
        self._built = True
        return self


_INDEX = _RosterIndex()


# ── resolution ──────────────────────────────────────────────────────────────────

@dataclass
class RosterResolution:
    query: str
    company_id: str
    display_name: str
    tier_rank: str                    # "A" | "B" | "C"
    source: str                       # "tier_a_blueprint" | "tier_b_template" | "tier_c_generic"
    archetype: str
    blueprint: CompanyBlueprint
    format_confidence: float
    badge: str
    matched: bool = True              # False == fell through to the generic default

    def to_dict(self) -> dict[str, Any]:
        return {
            "query": self.query, "company_id": self.company_id,
            "display_name": self.display_name, "tier_rank": self.tier_rank,
            "source": self.source, "archetype": self.archetype,
            "format_confidence": round(self.format_confidence, 2),
            "badge": self.badge, "matched": self.matched,
            "verify_banner": self.tier_rank != "A",
            "can_request_modeling": self.tier_rank != "A",
        }


def resolve_company(name: str) -> RosterResolution:
    """Resolve any company name to a runnable blueprint. Never returns ``None`` and
    never raises — an unknown name falls through to the ``mass_service`` generic."""
    idx = _INDEX.build()
    nn = _norm(name)

    # Tier A — hand-verified blueprint
    cid = idx.tier_a.get(nn)
    if cid:
        bp = idx.tier_a_bp[cid]
        return RosterResolution(
            query=name, company_id=cid, display_name=bp.display_name, tier_rank="A",
            source="tier_a_blueprint", archetype=bp.archetype, blueprint=bp,
            format_confidence=bp.format_confidence, badge=_BADGE["A"])

    # Tier B — named archetype mapping → materialize
    if nn in idx.tier_b:
        display, arch = idx.tier_b[nn]
        bp = _materialize(display, arch, "B", idx)
        return RosterResolution(
            query=name, company_id=bp.company_id, display_name=display, tier_rank="B",
            source="tier_b_template", archetype=arch, blueprint=bp,
            format_confidence=bp.format_confidence, badge=_BADGE["B"])

    # Tier C — directory name → CompanyType default → materialize
    if nn in idx.tier_c:
        display, arch = idx.tier_c[nn]
        bp = _materialize(display, arch, "C", idx)
        return RosterResolution(
            query=name, company_id=bp.company_id, display_name=display, tier_rank="C",
            source="tier_c_generic", archetype=arch, blueprint=bp,
            format_confidence=bp.format_confidence, badge=_BADGE["C"])

    # Unknown — nearest archetype default (never a dead-end)
    bp = _materialize(name.strip() or "Company", "mass_service", "C", idx)
    return RosterResolution(
        query=name, company_id=bp.company_id, display_name=name.strip() or "Company",
        tier_rank="C", source="tier_c_generic", archetype="mass_service", blueprint=bp,
        format_confidence=bp.format_confidence, badge=_BADGE["C"], matched=False)


def _materialize(display: str, archetype: str, tier_rank: str, idx: _RosterIndex) -> CompanyBlueprint:
    meta = idx.archetypes.get(archetype) or idx.archetypes.get("mass_service", {})
    return materialize_blueprint(
        _slug(display), display, meta, archetype_name=archetype, tier_rank=tier_rank,
        company_type=archetype)


# ── listing / search / demand-signal ────────────────────────────────────────────

@dataclass
class RosterEntry:
    company_id: str
    display_name: str
    tier_rank: str
    archetype: str

    def to_dict(self) -> dict[str, Any]:
        return {"company_id": self.company_id, "display_name": self.display_name,
                "tier_rank": self.tier_rank, "archetype": self.archetype}


def list_roster(tier: str | None = None) -> list[RosterEntry]:
    """Every company the roster can serve, optionally filtered to a tier."""
    idx = _INDEX.build()
    out: list[RosterEntry] = []
    if tier in (None, "A"):
        for cid, bp in sorted(idx.tier_a_bp.items()):
            out.append(RosterEntry(cid, bp.display_name, "A", bp.archetype))
    if tier in (None, "B"):
        for _nn, (display, arch) in sorted(idx.tier_b.items(), key=lambda kv: kv[1][0]):
            out.append(RosterEntry(_slug(display), display, "B", arch))
    if tier in (None, "C"):
        for _nn, (display, arch) in sorted(idx.tier_c.items(), key=lambda kv: kv[1][0]):
            out.append(RosterEntry(_slug(display), display, "C", arch))
    return out


def roster_counts() -> dict[str, int]:
    idx = _INDEX.build()
    return {"A": len(idx.tier_a_bp), "B": len(idx.tier_b), "C": len(idx.tier_c),
            "total": len(idx.tier_a_bp) + len(idx.tier_b) + len(idx.tier_c)}


def search(query: str, limit: int = 20) -> list[RosterEntry]:
    """Substring search across every tier (id / display name)."""
    q = _norm(query)
    if not q:
        return []
    hits = [e for e in list_roster() if q in _norm(e.display_name) or q in _norm(e.company_id)]
    # exact-ish matches first, then by tier
    hits.sort(key=lambda e: (0 if _norm(e.display_name) == q else 1, e.tier_rank))
    return hits[:limit]


def request_modeling(name: str, *, campus: str = "", note: str = "",
                     persist: bool = True) -> dict[str, Any]:
    """Record a "request full modeling" demand signal (Dossier Part 8/13). Each
    request prioritizes Tier-A/B promotion. Best-effort append to a JSONL log;
    never raises."""
    res = resolve_company(name)
    entry = {
        "ts": int(time.time()), "query": name, "resolved_as": res.display_name,
        "current_tier": res.tier_rank, "archetype": res.archetype,
        "campus": campus, "note": note,
    }
    if persist:
        try:
            with open(_REQUESTS_PATH, "a", encoding="utf-8") as f:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        except OSError:
            pass
    return {"recorded": True, **entry,
            "message": (f"Thanks — we logged a request to fully model "
                        f"{res.display_name}. It currently runs as a Tier-{res.tier_rank} "
                        f"{res.archetype} template; requests move it up the queue.")}


# ── self-check ──────────────────────────────────────────────────────────────────

def _self_check() -> int:
    import sys
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass
    from app.services.company_sim.company_session import run_session
    from app.services.company_sim.simulators import CandidateModel

    counts = roster_counts()
    print(f"Roster: Tier-A={counts['A']}  Tier-B={counts['B']}  Tier-C={counts['C']}  "
          f"total={counts['total']}")

    errors = 0
    checks = [("Google", "A"), ("TCS", "A"), ("Hexaware", "B"), ("Flipkart", "B"),
              ("Apple", "B"), ("HDFC Bank", "C"), ("Totally Unknown Newco", "C")]
    cand = CandidateModel(name="probe", seed=7, default_ability=0.72, ability={"coding": 0.75})
    for name, want_tier in checks:
        res = resolve_company(name)
        rec = run_session(res.blueprint, candidate=cand)
        ok = res.tier_rank == want_tier and (rec.completed or rec.eliminated_at or rec.terminated_at)
        errors += 0 if ok else 1
        print(f"  {name:24} → Tier-{res.tier_rank} {res.archetype:14} "
              f"predicted={rec.predicted_track or '—':10} conf={rec.confidence:.2f} "
              f"{'ok' if ok else 'FAIL(want '+want_tier+')'}")

    # zero-code add proof: a brand-new Tier-B name works end-to-end with no code
    print("\nZero-code add proof — inject a never-seen company via the archetype path:")
    res = resolve_company("Nagarro")   # Tier-B mass_service
    rec = run_session(res.blueprint, candidate=cand)
    print(f"  Nagarro → {res.blueprint.company_id}: {len(res.blueprint.rounds)} rounds, "
          f"validates & runs → predicted={rec.predicted_track}, no per-company code.")

    print("\nRESULT:", "PASS ✅" if errors == 0 else f"FAIL ❌ ({errors})")
    return 0 if errors == 0 else 1


if __name__ == "__main__":
    raise SystemExit(_self_check())
