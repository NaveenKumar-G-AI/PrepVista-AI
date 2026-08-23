"""
PrepVista — Company Blueprint Loader & Repository Validator (Feature #01, M1)
============================================================================
Loads the blueprint repository (``data/company_blueprints/*.json``), the
platform-skin registry (``data/platform_skins.json``) and the archetype
templates (``data/company_archetypes.json``), and validates the whole set
cross-referentially:

  * every blueprint parses + passes its own structural validation,
  * every ``platform.emulation_profile`` resolves to a real skin,
  * every ``archetype`` resolves to a real archetype template,
  * ordered/unique round order, resolvable gates, valid timers/negative-marking,
  * every blueprint carries ``format_confidence`` + ``last_verified``.

Mirrors ``branch_banks.py``: pure stdlib, defensive, ``lru_cache``-backed, and a
``python -m app.services.company_sim.loader`` self-check that prints a report and
exits non-zero on any error (so CI can gate on it).
"""

from __future__ import annotations

import json
import os
from functools import lru_cache

from app.services.company_sim.models import CompanyBlueprint

_DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
_BLUEPRINT_DIR = os.path.join(_DATA_DIR, "company_blueprints")
_SKINS_PATH = os.path.join(_DATA_DIR, "platform_skins.json")
_ARCHETYPES_PATH = os.path.join(_DATA_DIR, "company_archetypes.json")


# ═══════════════════════════════════════════════════════════════════════════════
# RAW FILE LOADING
# ═══════════════════════════════════════════════════════════════════════════════

def _read_json(path: str) -> object | None:
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return None


@lru_cache(maxsize=1)
def load_platform_skins() -> dict[str, dict]:
    """The platform-skin registry keyed by emulation_profile. {} if missing."""
    data = _read_json(_SKINS_PATH)
    if isinstance(data, dict):
        skins = data.get("skins", data)
        return skins if isinstance(skins, dict) else {}
    return {}


@lru_cache(maxsize=1)
def load_archetypes() -> dict[str, dict]:
    """The archetype template registry keyed by archetype name. {} if missing."""
    data = _read_json(_ARCHETYPES_PATH)
    if isinstance(data, dict):
        arch = data.get("archetypes", data)
        return arch if isinstance(arch, dict) else {}
    return {}


def available_blueprints() -> list[str]:
    """company_ids for which a blueprint JSON exists on disk (sorted)."""
    if not os.path.isdir(_BLUEPRINT_DIR):
        return []
    out: list[str] = []
    for fn in os.listdir(_BLUEPRINT_DIR):
        if fn.endswith(".json") and not fn.startswith("_"):
            out.append(fn[:-5])
    return sorted(out)


# ═══════════════════════════════════════════════════════════════════════════════
# BLUEPRINT LOADING
# ═══════════════════════════════════════════════════════════════════════════════

@lru_cache(maxsize=None)
def load_blueprint(company_id: str) -> CompanyBlueprint | None:
    """Load and parse one blueprint by company_id. None if missing/unreadable."""
    key = (company_id or "").strip().lower()
    if not key:
        return None
    path = os.path.join(_BLUEPRINT_DIR, f"{key}.json")
    data = _read_json(path)
    if not isinstance(data, dict):
        return None
    return CompanyBlueprint.from_dict(data)


def load_all_blueprints() -> dict[str, CompanyBlueprint]:
    """All parseable blueprints keyed by company_id."""
    out: dict[str, CompanyBlueprint] = {}
    for cid in available_blueprints():
        bp = load_blueprint(cid)
        if bp is not None:
            out[cid] = bp
    return out


# ═══════════════════════════════════════════════════════════════════════════════
# REPOSITORY VALIDATION
# ═══════════════════════════════════════════════════════════════════════════════

def validate_repository() -> tuple[list[str], list[str]]:
    """
    Validate the entire blueprint repository cross-referentially.
    Returns (errors, warnings). Empty errors == the repository is serviceable.
    """
    errors: list[str] = []
    warnings: list[str] = []

    skins = load_platform_skins()
    archetypes = load_archetypes()
    known_skins = set(skins.keys())
    known_archetypes = set(archetypes.keys())

    if not skins:
        errors.append("platform_skins.json missing or empty")
    if not archetypes:
        errors.append("company_archetypes.json missing or empty")

    cids = available_blueprints()
    if not cids:
        warnings.append("no blueprints found in data/company_blueprints/")

    seen_aliases: dict[str, str] = {}
    for cid in cids:
        path = os.path.join(_BLUEPRINT_DIR, f"{cid}.json")
        raw = _read_json(path)
        if not isinstance(raw, dict):
            errors.append(f"{cid}: not valid JSON / not an object")
            continue
        if raw.get("company_id") != cid:
            warnings.append(
                f"{cid}: filename does not match company_id "
                f"'{raw.get('company_id')}'"
            )
        bp = CompanyBlueprint.from_dict(raw)
        e, w = bp.validate(known_skins=known_skins, known_archetypes=known_archetypes)
        errors += e
        warnings += w
        # alias collisions across the roster (would break lookup)
        for alias in [bp.display_name, *bp.aliases]:
            key = alias.strip().lower()
            if key and key in seen_aliases and seen_aliases[key] != cid:
                warnings.append(
                    f"{cid}: alias '{alias}' also used by '{seen_aliases[key]}'"
                )
            elif key:
                seen_aliases[key] = cid

    return errors, warnings


def repository_report() -> str:
    """Human-readable summary of the blueprint repository + validation result."""
    skins = load_platform_skins()
    archetypes = load_archetypes()
    bps = load_all_blueprints()
    errors, warnings = validate_repository()

    lines: list[str] = []
    lines.append("PrepVista Company-Sim — Repository Report")
    lines.append("=" * 60)
    lines.append(f"platform skins       : {len(skins)}  ({', '.join(sorted(skins)) or '-'})")
    lines.append(f"archetype templates  : {len(archetypes)}  ({', '.join(sorted(archetypes)) or '-'})")
    lines.append(f"company blueprints   : {len(bps)}")
    lines.append("")
    for cid, bp in sorted(bps.items()):
        tracks = ", ".join(sorted(bp.track_ids)) or "-"
        lines.append(
            f"  • {cid:<12} {bp.display_name:<28} "
            f"[{bp.archetype}/{bp.tier_rank}] "
            f"rounds={len(bp.rounds)} tracks=({tracks}) "
            f"conf={bp.format_confidence:.2f} verified={bp.last_verified}"
        )
    lines.append("")
    lines.append(f"ERRORS   : {len(errors)}")
    for m in errors:
        lines.append(f"   ✗ {m}")
    lines.append(f"WARNINGS : {len(warnings)}")
    for m in warnings:
        lines.append(f"   ! {m}")
    lines.append("")
    lines.append("RESULT   : " + ("PASS ✅" if not errors else "FAIL ❌"))
    return "\n".join(lines)


def _main() -> int:
    # The report uses unicode (•, ═, ✅); force UTF-8 so the CI self-check does
    # not crash on a cp1252/ASCII stdout (Windows console, minimal CI images).
    try:
        import sys

        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass
    print(repository_report())
    errors, _ = validate_repository()
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(_main())
