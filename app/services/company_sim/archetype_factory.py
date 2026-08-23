"""
PrepVista — Archetype Blueprint Factory (Feature #01, M7)
========================================================
The engine behind **breadth = revenue** (Dossier Part 8/13): it materializes a
*complete, runnable* :class:`CompanyBlueprint` from nothing but an archetype +
the company's identity. This is what makes "adding a company a **data** task, not
a code task" literally true — a Tier-B/C company gets a first-class simulation
(rounds, sections, timers, gates, negative-marking, an ``outcome_model`` that
predicts a track, a platform skin) with **zero per-company code**.

  * ``company_archetypes.json`` gives each archetype its round *shape*
    (``default_rounds`` = ordered ``round_type`` list), its default platform skin,
    its package band, and whether it has tracks.
  * this factory fleshes each round out into the same structure a hand-verified
    Tier-A blueprint has — the standard section set for that ``round_type``, a
    resolvable ``gate_rule``, sane sectional timers, conservative (off)
    negative-marking — then synthesizes a generic ``outcome_model`` whose track
    ``requires`` use the SAME predicate vocabulary the resolver already speaks.

The result is parsed through ``CompanyBlueprint.from_dict`` and passes the exact
same ``validate()`` as a Tier-A blueprint, so it runs unchanged through the
orchestrator → resolver → report. Tier-B carries ``format_confidence`` ~0.6 and
Tier-C ~0.42 with a "verify / generic format" banner (surfaced by the report's
``verify_banner``).

Pure stdlib, deterministic, never raises out of ``materialize_blueprint``.
"""

from __future__ import annotations

from typing import Any

from app.services.company_sim.models import CompanyBlueprint

# round_types that appear in archetype default_rounds but are not in the fixed
# simulator vocabulary → map to the reuse family (Dossier §6).
_ROUND_TYPE_ALIAS = {
    "case_study_round": "managerial_interview",   # case study reuses the managerial family
    "case_study": "managerial_interview",
    "phone_screen": "technical_interview",
}

_LANGS_DEFAULT = ["C", "C++", "Java", "Python"]


# ── per-round section templates ─────────────────────────────────────────────────
# Each entry: (is_elimination, total_minutes, difficulty_profile, gate_kind,
#              [ (section_id, competency, item_type, count, minutes, [topics]) ]).
# The competencies match the tags the reused/net-new simulators already key on,
# so a materialized round scores exactly like a hand-authored one.
def _round_template(round_type: str) -> dict[str, Any]:
    T = {
        "aptitude_test": (True, 60, "mixed", "aptitude", [
            ("verbal", "communication", "mcq", 20, 15, ["reading comprehension", "grammar"]),
            ("reasoning", "aptitude_reasoning", "mcq", 20, 20, ["series", "puzzles", "syllogisms"]),
            ("numerical", "aptitude_reasoning", "mcq", 20, 25,
             ["percentages", "ratios", "time-speed-distance"]),
        ]),
        "technical_mcq": (True, 25, "medium", "sectional", [
            ("cs_fundamentals", "problem_solving", "mcq", 15, 15,
             ["DBMS", "OS", "networks", "OOP"]),
            ("pseudocode", "coding", "pseudocode_mcq", 10, 10, ["trace output", "complexity"]),
        ]),
        "coding_test": (True, 45, "hard", "coding", [
            ("problem_1", "coding", "coding", 1, 22, ["arrays", "strings", "hashing"]),
            ("problem_2", "coding", "coding", 1, 23, ["greedy", "dynamic programming"]),
        ]),
        "advanced_coding": (True, 90, "hard", "coding", [
            ("build_app", "coding", "build_app", 1, 90,
             ["end-to-end feature", "structure", "design reasoning"]),
        ]),
        "game_based_aptitude": (True, 40, "medium", "sectional", [
            ("games", "problem_solving", "game", 6, 40, ["deductive", "grid", "switch", "motion"]),
        ]),
        "voice_assessment": (True, 25, "medium", "rubric", [
            ("read_aloud", "spoken_english", "voice_read_aloud", 1, 6, ["pronunciation", "pace"]),
            ("speak_topic", "spoken_english", "voice_topic", 1, 8, ["fluency", "content"]),
        ]),
        "written_communication": (True, 25, "medium", "rubric", [
            ("essay", "written_english", "essay", 1, 25, ["structure", "grammar", "coherence"]),
        ]),
        "behavioral_survey": (False, 20, "medium", "none", [
            ("survey", "leadership_principles", "survey_most_least", 30, 20,
             ["most/least like me", "trait consistency"]),
        ]),
        "work_simulation": (False, 45, "medium", "none", [
            ("scenarios", "work_judgment", "scenario", 6, 45,
             ["email triage", "prioritization", "minor debugging"]),
        ]),
        "technical_interview": (True, 45, "hard", "rubric", [
            ("tech_qa", "technical_domain", "interview_qa", 6, 30, ["core CS", "role skills"]),
            ("resume_probe", "resume_based", "interview_qa", 3, 15, ["projects", "internships"]),
        ]),
        "managerial_interview": (True, 40, "hard", "rubric", [
            ("scenarios", "situational_star", "interview_qa", 4, 25, ["conflict", "ownership"]),
            ("case", "case_study", "interview_qa", 2, 15, ["structured reasoning"]),
        ]),
        "hr_interview": (True, 25, "medium", "rubric", [
            ("hr_qa", "hr_behavioral", "interview_qa", 5, 25,
             ["motivation", "relocation", "salary"]),
        ]),
        "system_design": (True, 50, "hard", "rubric", [
            ("hld", "system_design", "interview_qa", 3, 30, ["requirements", "components", "scaling"]),
            ("lld", "system_design", "interview_qa", 2, 20, ["APIs", "data model", "trade-offs"]),
        ]),
        "bar_raiser": (True, 45, "hard", "veto", [
            ("bar_raiser_lp", "leadership_principles", "interview_qa", 4, 45,
             ["dive deep", "measurable impact"]),
        ]),
        "group_discussion": (True, 20, "medium", "rubric", [
            ("gd", "group_discussion", "interview_qa", 1, 20, ["clarity", "collaboration"]),
        ]),
        "hiring_committee": (True, 0, "medium", "committee", [
            ("packet", "behavioral", "interview_qa", 1, 0, ["packet review"]),
        ]),
    }
    default = (True, 30, "medium", "rubric", [
        ("round", "technical_domain", "interview_qa", 4, 30, ["general"]),
    ])
    elim, minutes, diff, gate, secs = T.get(round_type, default)
    return {"is_elimination": elim, "total_minutes": minutes, "difficulty_profile": diff,
            "gate_kind": gate, "sections": secs}


def _make_gate(kind: str, floor_track: str | None) -> dict[str, Any]:
    ft = floor_track or "base"
    if kind == "aptitude":
        return {"type": "sectional_and_overall",
                "params": {"min_percentile_by_track": {ft: {"overall": 50}}}}
    if kind == "sectional":
        return {"type": "sectional", "params": {"min_percentile_by_track": {ft: {"overall": 50}}}}
    if kind == "coding":
        return {"type": "coding_count", "params": {"min_solved": 1}}
    if kind == "veto":
        return {"type": "veto", "params": {"min_score_0_10": 5.5}}
    if kind == "committee":
        return {"type": "committee", "params": {"hire_threshold": "leaning_hire"}}
    if kind == "rubric":
        return {"type": "rubric", "params": {"min_score_0_10": 5.0}}
    return {"type": "none", "params": {}}


def _sections(round_type: str, tmpl: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for sid, comp, item_type, count, minutes, topics in tmpl["sections"]:
        sec: dict[str, Any] = {
            "section_id": sid, "label": sid.replace("_", " ").title(),
            "competency": comp, "item_type": item_type,
            "count": count, "minutes": minutes, "topics": topics,
        }
        if item_type in ("coding", "build_app"):
            sec["languages_allowed"] = list(_LANGS_DEFAULT)
        out.append(sec)
    return out


# ── outcome_model synthesis (uses the resolver's predicate vocabulary) ───────────

def _build_outcome_model(
    display_name: str, has_tracks: bool, has_apt: bool, has_coding: bool, n_coding: int,
    attributes: list[str],
) -> tuple[dict[str, Any], list[str]]:
    if not has_tracks:
        tracks = [{"track": "offer", "label": f"{display_name} — Offer",
                   "requires": {"all_rounds_cleared": True}}]
        return ({"strategy": "single_merit", "attributes": attributes, "tracks": tracks,
                 "params": {"order_high_to_low": ["offer"]},
                 "gap_hints": {}}, ["offer"])

    base = {"track": "base", "label": f"{display_name} — Standard", "requires": {}}
    tracks = [base]
    order = ["base"]
    gap_hints: dict[str, str] = {}
    if has_coding:
        need = max(1, n_coding)
        adv = {"track": "advanced", "label": f"{display_name} — Digital/Advanced",
               "requires": {"coding_solved": need}}
        tracks = [base, adv]
        order = ["advanced", "base"]
        gap_hints["base_to_advanced"] = (
            f"Solve all {need} coding problem(s) cleanly to reach the higher package band.")
    elif has_apt:
        adv = {"track": "advanced", "label": f"{display_name} — Advanced",
               "requires": {"aptitude_pct": 70}}
        tracks = [base, adv]
        order = ["advanced", "base"]
        gap_hints["base_to_advanced"] = (
            "Push your aptitude percentile to >=70 to reach the higher package band.")
    strategy = "multi_signal_tracks" if len(tracks) > 1 else "single_merit"
    return ({"strategy": strategy, "attributes": attributes, "tracks": tracks,
             "params": {"order_high_to_low": order}, "gap_hints": gap_hints}, order)


def _attributes_from_rounds(round_types: list[str]) -> list[str]:
    attrs: list[str] = []
    def add(a: str) -> None:
        if a not in attrs:
            attrs.append(a)
    for rt in round_types:
        if rt == "aptitude_test":
            add("aptitude"); add("reasoning"); add("communication")
        elif rt in ("coding_test", "advanced_coding"):
            add("coding")
        elif rt == "technical_mcq":
            add("technical"); add("pseudocode")
        elif rt in ("technical_interview", "system_design"):
            add("technical")
        elif rt == "voice_assessment":
            add("voice")
        elif rt == "written_communication":
            add("essay")
        elif rt in ("behavioral_survey", "bar_raiser"):
            add("leadership")
        elif rt in ("hr_interview", "managerial_interview"):
            add("behavioral")
    return attrs or ["aptitude", "technical", "communication"]


# ── public materializer ─────────────────────────────────────────────────────────

def materialize_blueprint(
    company_id: str,
    display_name: str,
    archetype_meta: dict[str, Any],
    *,
    archetype_name: str,
    tier_rank: str = "B",
    format_confidence: float | None = None,
    aliases: list[str] | None = None,
    company_type: str = "",
    last_verified: str = "template",
) -> CompanyBlueprint:
    """Build a complete, validatable ``CompanyBlueprint`` from an archetype.

    ``archetype_meta`` is one entry of ``company_archetypes.json['archetypes']``.
    Never raises; returns a first-class blueprint that runs unchanged through the
    orchestrator, resolver and report.
    """
    aliases = aliases or []
    raw_rounds = archetype_meta.get("default_rounds", []) or []
    round_types = [_ROUND_TYPE_ALIAS.get(r.get("round_type"), r.get("round_type"))
                   for r in raw_rounds if r.get("round_type")]
    # unique-archetype has no default_rounds → give it a sensible bespoke shape
    if not round_types:
        round_types = ["written_communication", "coding_test", "advanced_coding",
                       "technical_interview", "hr_interview"]

    has_apt = "aptitude_test" in round_types
    coding_rounds = [rt for rt in round_types if rt in ("coding_test", "advanced_coding")]
    has_coding = bool(coding_rounds)
    has_tracks = bool(archetype_meta.get("has_tracks"))

    # count coding problems (for the advanced-track coding_solved bar)
    n_coding = 0
    for rt in coding_rounds:
        for sec in _round_template(rt)["sections"]:
            n_coding += sec[3]  # count

    attributes = _attributes_from_rounds(round_types)
    outcome_model, order = _build_outcome_model(
        display_name, has_tracks, has_apt, has_coding, n_coding, attributes)
    floor_track = order[-1] if order else "base"

    # rounds
    rounds: list[dict[str, Any]] = []
    for i, (raw, rt) in enumerate(zip(raw_rounds or [{}] * len(round_types), round_types), start=1):
        tmpl = _round_template(rt)
        label = (raw.get("label") if isinstance(raw, dict) else None) or rt.replace("_", " ").title()
        gate = _make_gate(tmpl["gate_kind"], floor_track)
        rnd: dict[str, Any] = {
            "order": i, "round_id": f"{company_id}_{rt}_{i}", "round_type": rt,
            "label": label, "is_elimination": tmpl["is_elimination"],
            "total_minutes": tmpl["total_minutes"], "difficulty_profile": tmpl["difficulty_profile"],
            "sections": _sections(rt, tmpl), "gate_rule": gate,
            "negative_marking": {"enabled": False, "model": "none"},
        }
        # senior/level-gated rounds only apply to the higher track when tracks exist
        if rt in ("system_design", "bar_raiser", "hiring_committee") and len(order) > 1:
            rnd["applies_to_tracks"] = [order[0]]
        rounds.append(rnd)

    # packages from the band
    band = archetype_meta.get("package_band_lpa", [3.5, 7.5]) or [3.5, 7.5]
    lo, hi = float(band[0]), float(band[-1])
    packages: list[dict[str, Any]] = []
    for t in reversed(order):  # low → high
        # spread the band across tracks
        if len(order) > 1:
            frac_lo = lo if t == floor_track else (lo + hi) / 2
            frac_hi = (lo + hi) / 2 if t == floor_track else hi
        else:
            frac_lo, frac_hi = lo, hi
        label = next((tr["label"] for tr in outcome_model["tracks"] if tr["track"] == t), t)
        packages.append({"track": t, "label": label,
                         "ctc_lpa": [round(frac_lo, 1), round(frac_hi, 1)], "gate": "template"})

    skin = archetype_meta.get("default_skin", "custom")
    conf = format_confidence if format_confidence is not None else (0.6 if tier_rank == "B" else 0.42)

    bp_dict: dict[str, Any] = {
        "company_id": company_id,
        "display_name": display_name,
        "aliases": aliases,
        "archetype": archetype_name,
        "tier_rank": tier_rank,
        "hiring_scale": "medium",
        "platform": {
            "name": f"{skin.replace('_', ' ').title()}",
            "emulation_profile": skin,
            "proctored": True,
            "tab_switch_policy": "warn",         # conservative default for un-verified companies
            "navigation": "free_within_section",
            "on_screen_calculator": has_apt,
        },
        "packages": packages,
        "rounds": rounds,
        "outcome_model": outcome_model,
        "format_confidence": round(conf, 2),
        "last_verified": last_verified,
        "recent_changes": [],
        "culture_values": [],
        "what_they_value": archetype_meta.get("notes", ""),
        "ai_assistance_allowed": True,
        "notes": (f"Template-materialized from the '{archetype_name}' archetype "
                  f"({'Tier-B mapped' if tier_rank == 'B' else 'Tier-C generic'}). "
                  f"Verify the exact rounds with your placement cell before the drive."),
    }
    return CompanyBlueprint.from_dict(bp_dict)
