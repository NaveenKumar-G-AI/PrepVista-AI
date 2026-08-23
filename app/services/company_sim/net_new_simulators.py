"""
PrepVista — Net-New Round Simulators (Feature #01, M4)
======================================================
The purpose-built simulators for the "exotic" round types that have no reuse in
the existing 15 interview modules (Dossier §4 / master-prompt §7), built in the
stated impact order:

    coding_test / advanced_coding → game_based_aptitude → voice_assessment →
    written_communication → behavioral_survey → work_simulation → system_design →
    bar_raiser → hiring_committee

Each returns the same normalized ``RoundResult`` as every other simulator, and
each honours the company's real rules **literally**:
  * coding: per-company language sets, **Capgemini bans Python**, partial hidden-
    test scoring, Zoho "build-an-application"; two documented execution paths
    (sandbox judge OR hidden-test-only) — this deterministic build runs the
    hidden-test-only path (no external judge required),
  * written_communication: **Wipro's mistake-threshold → negative marking**,
  * game_based_aptitude: **Capgemini draws 4 of a 24-pool**, score = max level,
  * bar_raiser: a **veto** that caps the outcome (resolved by the gate),
  * hiring_committee: an **outcome step** — assembles a packet from the prior
    rounds and returns a 6-point committee verdict + outcome.

Deterministic, LLM-free, no I/O — the always-available static path that keeps a
session alive (Dossier §17). Real content backends (a Judge0-style sandbox, an
STT+prosody voice pipeline, an LLM essay grader) can replace any of these later
by re-registering the round_type; the orchestrator never changes.
"""

from __future__ import annotations

from typing import Any

from app.services.company_sim.simulators import (
    FallbackSimulator,
    RoundResult,
    SimContext,
    _clamp,
    _roll,
    register_simulator,
)
from app.services.company_sim.skins import CompanySkin

_DIFF = {"easy": 1.10, "medium": 1.00, "mixed": 0.95, "hard": 0.85}

# candidate language preference (they reach for the top available one)
_LANG_PREF = ["Python", "C++", "Java", "C", "JavaScript", "Go", "C#"]


# ═══════════════════════════════════════════════════════════════════════════════
# SHARED HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def _diff_factor(ctx: SimContext) -> float:
    return _DIFF.get(ctx.round.difficulty_profile, 0.95)


def _ability(ctx: SimContext, competency: str, skin: CompanySkin, extra: float = 1.0) -> float:
    """Skinned, difficulty-adjusted 0..1 ability for a competency."""
    return _clamp(ctx.candidate.ability_for(competency) * skin.leniency * _diff_factor(ctx) * extra)


def _dev(ctx: SimContext, *key: object, spread: float = 0.08) -> float:
    """Deterministic ± ``spread`` variation, seed-stable per (candidate, round, key)."""
    return (_roll(ctx.candidate.seed, ctx.round.round_id, *key) - 0.5) * 2.0 * spread


def _finish(score_0_10: float) -> tuple[float, str]:
    pct = round(_clamp(score_0_10 / 10.0, 0.01, 0.99) * 100, 1)
    return pct, FallbackSimulator._verdict(score_0_10)


def _mk(
    ctx: SimContext, score: float, sub: dict[str, float], simulator: str,
    evidence: dict[str, Any], strengths: list[str], improvements: list[str], notes: str,
) -> RoundResult:
    score = round(max(0.0, min(10.0, score)), 2)
    pct, verdict = _finish(score)
    ev = {"simulator": simulator, "percentile": pct, "verdict": verdict, **evidence}
    return RoundResult(
        round_id=ctx.round.round_id, round_type=ctx.round.round_type, score_0_10=score,
        sub_scores={k: round(v, 2) for k, v in sub.items()},
        strengths=strengths, improvements=improvements, rubric_notes=notes, evidence=ev,
    )


def _mean(xs: list[float]) -> float:
    return sum(xs) / len(xs) if xs else 0.0


def _draw(ctx: SimContext, pool: list[str], k: int) -> list[str]:
    """Deterministically draw ``k`` items from ``pool`` (Capgemini 4-of-24)."""
    if k >= len(pool):
        return list(pool)
    ranked = sorted(pool, key=lambda g: _roll(ctx.candidate.seed, ctx.round.round_id, "draw", g))
    return sorted(ranked[:k])


# ═══════════════════════════════════════════════════════════════════════════════
# 1) CODING  (coding_test, advanced_coding)
# ═══════════════════════════════════════════════════════════════════════════════

class CodingSimulator:
    """Partial hidden-test scoring + per-company language enforcement + Zoho build-app."""

    def simulate(self, ctx: SimContext) -> RoundResult:
        skin = CompanySkin.for_company(ctx.blueprint)
        sub: dict[str, float] = {}
        per_problem: list[dict[str, Any]] = []
        solved = items = 0
        python_banned = False

        for sec in ctx.round.sections:
            allowed = [l for l in sec.languages_allowed if l not in sec.languages_banned]
            if not allowed:
                allowed = ["C", "C++", "Java"]
            if "Python" in sec.languages_banned:
                python_banned = True
            chosen = next((l for l in _LANG_PREF if l in allowed), allowed[0])
            forced_switch = "Python" in sec.languages_banned  # candidate's default disallowed
            comp = sec.competency or "coding"

            # Raw mastery = skill × company leniency, WITHOUT the difficulty
            # depression. Difficulty depresses the pass fraction (below), but a
            # genuinely elite coder clean-solves even a hard problem — so the
            # top track (TCS Prime, Capgemini Senior Analyst) stays reachable
            # for the best while remaining out of reach for the merely strong.
            mastery = _clamp(ctx.candidate.ability_for(comp) * skin.leniency)

            for i in range(max(sec.count, 1)):
                items += 1
                a = _clamp(_ability(ctx, comp, skin) + _dev(ctx, sec.section_id, i)
                           - (0.05 if forced_switch else 0.0))
                if sec.item_type == "build_app":
                    correctness = _clamp(a + _dev(ctx, "corr", i, spread=0.06))
                    structure = _clamp(a + _dev(ctx, "struct", i))
                    design = _clamp(a + _dev(ctx, "design", i))
                    frac = 0.5 * correctness + 0.25 * structure + 0.25 * design
                    full = frac >= 0.70
                    per_problem.append({
                        "type": "build_app", "language": chosen, "correctness": round(correctness, 2),
                        "structure": round(structure, 2), "design_reasoning": round(design, 2),
                        "score_fraction": round(frac, 2), "solved": full,
                    })
                else:
                    hidden = _clamp(a)  # fraction of hidden tests passed (partial scoring)
                    full = hidden >= 0.60
                    # clean = fully solved AND elite mastery (all tests, top quality)
                    clean = full and mastery >= 0.88
                    per_problem.append({
                        "type": "coding", "language": chosen,
                        "hidden_pass_fraction": round(hidden, 2), "solved": full,
                        "clean": clean,
                    })
                    frac = hidden
                solved += int(full)
                sub[f"{sec.section_id}#{i + 1}"] = round(frac * 10, 2)

        score = _mean(list(sub.values()))
        strengths, improvements = [], []
        if solved == items and items:
            strengths.append(f"Solved all {items} problem(s) cleanly in {chosen}.")
        elif solved:
            strengths.append(f"Solved {solved}/{items} problem(s).")
        else:
            improvements.append("No problem fully solved — drill the core DS/algo patterns.")
        if python_banned:
            improvements.append("Python is NOT allowed here — practice in C / C++ / Java before the drive.")

        return _mk(
            ctx, score, sub, "net_new:coding",
            {"solved": solved, "coding_items": items, "per_problem": per_problem,
             "execution_path": "hidden_test_sim", "languages_enforced": True,
             "banned_language_used": False, "python_banned": python_banned,
             "ai_assistance_allowed": ctx.ai_assistance_allowed},
            strengths, improvements,
            f"[{skin.display_name} coding] hidden-test partial scoring; "
            f"languages {'C/C++/Java (Python banned)' if python_banned else 'per blueprint'}.",
        )


# ═══════════════════════════════════════════════════════════════════════════════
# 2) GAME-BASED APTITUDE  (Cognizant fixed set, Capgemini draw 4 of 24)
# ═══════════════════════════════════════════════════════════════════════════════

_DEFAULT_GAMES = ["deductive", "grid", "switch", "motion", "digit", "inductive"]


class GameBasedAptitudeSimulator:
    """Leveling cognitive mini-games. Score = max level × weight (+ accuracy, speed)."""

    def simulate(self, ctx: SimContext) -> RoundResult:
        skin = CompanySkin.for_company(ctx.blueprint)
        sub: dict[str, float] = {}
        games: list[dict[str, Any]] = []

        # Prefer the round-level pool/draw (Capgemini "4 of 24"); fall back to
        # per-section topics (Cognizant's fixed set).
        rcfg = ctx.round.config or {}
        pool = list(rcfg.get("pool") or [])
        pool_size = int(rcfg.get("pool_size", len(pool)))
        draw_count = int(rcfg.get("draw_count") or rcfg.get("draw") or 0)
        max_levels = int(rcfg.get("max_levels", 8))

        if pool and draw_count:
            chosen = _draw(ctx, pool, draw_count)
        else:
            chosen = []
            for sec in ctx.round.sections:
                scfg = sec.config or {}
                spool = list(scfg.get("pool") or sec.topics or _DEFAULT_GAMES)
                chosen += _draw(ctx, spool, int(scfg.get("draw", len(spool))))
            chosen = chosen or list(_DEFAULT_GAMES)
            pool_size = pool_size or len(set(chosen))

        for g in chosen:
            a = _clamp(_ability(ctx, "cognitive_games", skin) + _dev(ctx, g))
            level = int(round(a * max_levels))
            accuracy = _clamp(a + _dev(ctx, g, "acc", spread=0.05))
            speed = _clamp(a + _dev(ctx, g, "spd"))
            gscore = (0.6 * (level / max_levels) + 0.25 * accuracy + 0.15 * speed) * 10
            games.append({"game": g, "max_level": level, "levels": max_levels,
                          "accuracy": round(accuracy, 2), "speed": round(speed, 2),
                          "score_0_10": round(gscore, 2)})
            sub[g] = round(gscore, 2)

        score = _mean(list(sub.values()))
        top = max(games, key=lambda x: x["max_level"]) if games else None
        low = min(games, key=lambda x: x["max_level"]) if games else None
        strengths = [f"Reached L{top['max_level']}/{top['levels']} on '{top['game']}'."] if top else []
        improvements = ([f"Push for the MAX level — you stalled at L{low['max_level']}/"
                         f"{low['levels']} on '{low['game']}' (level reached drives the score)."]
                        if low else [])
        return _mk(
            ctx, score, sub, "net_new:game_based_aptitude",
            {"games": games, "pool_size": pool_size, "drawn": len(games)},
            strengths, improvements,
            f"[{skin.display_name} games] max-level scoring; "
            f"drew {len(games)} of {pool_size}.",
        )


# ═══════════════════════════════════════════════════════════════════════════════
# 3) VOICE ASSESSMENT  (Wipro; Capgemini/Cognizant spoken)
# ═══════════════════════════════════════════════════════════════════════════════

class VoiceAssessmentSimulator:
    """read-aloud / describe-image / speak-topic / repeat-after / dictation → prosody+content."""

    def simulate(self, ctx: SimContext) -> RoundResult:
        skin = CompanySkin.for_company(ctx.blueprint)
        a = _ability(ctx, "spoken_english", skin)
        pron = _clamp(a + _dev(ctx, "pron", spread=0.06))
        flu = _clamp(a + _dev(ctx, "flu"))
        gram = _clamp(a + _dev(ctx, "gram", spread=0.06))
        content = _clamp(a + _dev(ctx, "content"))
        wpm = int(90 + a * 90)                       # 90..180 words/min
        filler = round(max(0.0, (1.0 - flu) * 12.0), 1)   # fillers/min, worse fluency → more
        pace = _clamp(1.0 - abs(wpm - 130) / 130.0)   # ideal ≈ 130 wpm
        score = (0.25 * pron + 0.25 * flu + 0.15 * gram + 0.20 * content + 0.15 * pace) * 10
        sub = {"pronunciation": pron * 10, "fluency": flu * 10, "grammar": gram * 10,
               "content_coverage": content * 10, "pace": pace * 10}
        improvements = [f"Cut filler words (~{filler}/min) and aim for ~130 WPM (you: {wpm})."]
        return _mk(
            ctx, score, sub, "net_new:voice_assessment",
            {"wpm": wpm, "filler_per_min": filler, "pronunciation": round(pron, 2),
             "fluency": round(flu, 2), "grammar": round(gram, 2),
             "content_coverage": round(content, 2), "mode": "transcript_fallback"},
            [f"Clear pronunciation ({round(pron * 10, 1)}/10)."] if pron > 0.7 else [],
            improvements,
            f"[{skin.display_name} voice] STT+prosody path unavailable → transcript fallback.",
        )


# ═══════════════════════════════════════════════════════════════════════════════
# 4) WRITTEN COMMUNICATION  (Wipro essay 5-mistake threshold, Capgemini WET)
# ═══════════════════════════════════════════════════════════════════════════════

class WrittenCommunicationSimulator:
    """Essay/email quality + the mistake-threshold → negative-marking rule (Wipro)."""

    def simulate(self, ctx: SimContext) -> RoundResult:
        skin = CompanySkin.for_company(ctx.blueprint)
        a = _ability(ctx, "written_english", skin)
        grammar = _clamp(a + _dev(ctx, "gram", spread=0.06))
        coherence = _clamp(a + _dev(ctx, "coh"))
        vocab = _clamp(a + _dev(ctx, "voc", spread=0.07))
        structure = _clamp(a + _dev(ctx, "str", spread=0.07))
        base_quality = (0.30 * grammar + 0.25 * coherence + 0.20 * vocab + 0.25 * structure) * 10

        min_words = next((s.config.get("min_words") for s in ctx.round.sections
                          if isinstance(s.config, dict) and s.config.get("min_words")), 200)
        mistakes = int(round((1.0 - grammar) * (min_words / 20.0)))  # ~ up to min_words/20 slips

        nm = ctx.round.negative_marking
        over, penalty = 0, 0.0
        if nm.enabled and nm.model == "threshold":
            over = max(mistakes - nm.threshold, 0)
            penalty = over * (nm.penalty if nm.penalty > 0 else 0.5)
        final = max(0.0, base_quality - penalty)

        sub = {"grammar": grammar * 10, "coherence": coherence * 10,
               "vocabulary": vocab * 10, "structure": structure * 10}
        improvements = []
        if nm.enabled and nm.model == "threshold":
            improvements.append(
                f"Keep mistakes under the {nm.threshold}-mistake threshold "
                f"(you made ~{mistakes}; {over} were penalised)."
            )
        return _mk(
            ctx, final, sub, "net_new:written_communication",
            {"base_quality": round(base_quality, 2), "mistakes": mistakes,
             "threshold": (nm.threshold if nm.enabled and nm.model == "threshold" else None),
             "penalised_mistakes": over, "penalty_points": round(penalty, 2),
             "min_words": min_words},
            [f"Coherent, well-structured writing ({round(base_quality, 1)}/10 base)."]
            if base_quality >= 7 else [],
            improvements,
            f"[{skin.display_name} essay] AI grammar/coherence/vocab/structure grading"
            + (f" + {nm.threshold}-mistake threshold penalty." if over else "."),
        )


# ═══════════════════════════════════════════════════════════════════════════════
# 5) BEHAVIORAL SURVEY  (Amazon 16 LPs most/least, Accenture traits)
# ═══════════════════════════════════════════════════════════════════════════════

class BehavioralSurveySimulator:
    """most/least items scored for consistency + LP/trait alignment."""

    def simulate(self, ctx: SimContext) -> RoundResult:
        skin = CompanySkin.for_company(ctx.blueprint)
        consistency = _clamp(_ability(ctx, "behavioral", skin) + _dev(ctx, "cons", spread=0.06))
        lp = _clamp(_ability(ctx, "leadership_principles", skin) + _dev(ctx, "lp"))
        w = skin.weight_for("leadership_principles")
        score = ((consistency + lp * w) / (1.0 + w)) * 10
        items = sum(s.count for s in ctx.round.sections) or 30
        sub = {"consistency": consistency * 10, "lp_alignment": lp * 10}
        improvements = ([f"Answer consistently across the {items} items — contradictory "
                         "most/least picks read as low self-awareness."]
                        if consistency < 0.7 else [])
        return _mk(
            ctx, score, sub, "net_new:behavioral_survey",
            {"consistency": round(consistency, 2), "lp_alignment": round(lp, 2), "items": items},
            [f"Strong alignment to {skin.display_name}'s principles."] if lp > 0.75 else [],
            improvements,
            f"[{skin.display_name} survey] most/least consistency + principle alignment.",
        )


# ═══════════════════════════════════════════════════════════════════════════════
# 6) WORK SIMULATION  (Amazon virtual office)
# ═══════════════════════════════════════════════════════════════════════════════

class WorkSimulationSimulator:
    """virtual-office scenarios graded on judgment + LP alignment."""

    def simulate(self, ctx: SimContext) -> RoundResult:
        skin = CompanySkin.for_company(ctx.blueprint)
        judgment = _clamp(_ability(ctx, "work_judgment", skin) + _dev(ctx, "judg"))
        lp = _clamp(_ability(ctx, "leadership_principles", skin) + _dev(ctx, "lp"))
        score = (0.6 * judgment + 0.4 * lp) * 10
        scenarios = sum(s.count for s in ctx.round.sections) or 8
        sub = {"judgment": judgment * 10, "lp_alignment": lp * 10}
        return _mk(
            ctx, score, sub, "net_new:work_simulation",
            {"judgment": round(judgment, 2), "lp_alignment": round(lp, 2), "scenarios": scenarios},
            [f"Sound prioritization judgment ({round(judgment * 10, 1)}/10)."] if judgment > 0.7 else [],
            (["Anchor email/prioritization choices to the leadership principles."]
             if lp < 0.7 else []),
            f"[{skin.display_name} work-sim] email/prioritization/debug judgment + LP alignment.",
        )


# ═══════════════════════════════════════════════════════════════════════════════
# 7) SYSTEM DESIGN  (product/premium, senior/L5+)
# ═══════════════════════════════════════════════════════════════════════════════

_SD_DIMS = ["requirements", "components", "data_flow", "scaling", "trade_offs"]


class SystemDesignSimulator:
    """HLD/LLD structured rubric (requirements → components → data flow → scaling → trade-offs)."""

    def simulate(self, ctx: SimContext) -> RoundResult:
        skin = CompanySkin.for_company(ctx.blueprint)
        a = _ability(ctx, "system_design", skin)
        sub = {d: _clamp(a + _dev(ctx, d)) * 10 for d in _SD_DIMS}
        score = _mean(list(sub.values()))
        worst = min(sub, key=sub.get)
        return _mk(
            ctx, score, sub, "net_new:system_design",
            {"dimensions": {d: round(sub[d] / 10, 2) for d in _SD_DIMS}},
            [f"Solid {max(sub, key=sub.get).replace('_', ' ')} reasoning."],
            [f"Deepen '{worst.replace('_', ' ')}' — the weakest design dimension."]
            if sub[worst] < 6 else [],
            f"[{skin.display_name} system design] HLD/LLD rubric across {len(_SD_DIMS)} dimensions.",
        )


# ═══════════════════════════════════════════════════════════════════════════════
# 8) BAR RAISER  (Amazon; Microsoft "AA") — veto caps the outcome
# ═══════════════════════════════════════════════════════════════════════════════

class BarRaiserSimulator:
    """Different-team senior, escalating LP-depth probes, a no-fly veto (via the gate)."""

    def simulate(self, ctx: SimContext) -> RoundResult:
        skin = CompanySkin.for_company(ctx.blueprint)
        depth = _clamp(_ability(ctx, "leadership_principles", skin) + _dev(ctx, "depth", spread=0.06))
        score = depth * 10
        # the gate (type "veto") decides caps/elimination; expose whether we're near it
        threshold = float((ctx.round.gate_rule.params or {}).get("min_score_0_10", 5.5)) \
            if ctx.round.gate_rule else 5.5
        veto = score < threshold
        sub = {"lp_depth": score}
        return _mk(
            ctx, score, sub, "net_new:bar_raiser",
            {"lp_depth": round(depth, 2), "persona": "different_team_senior",
             "escalating_followups": True, "veto_triggered": veto, "veto_threshold": threshold},
            [] if veto else [f"Held up to escalating Dive-Deep probes ({round(score, 1)}/10)."],
            (["Add measurable impact + your specific role to LP stories; the Bar Raiser "
              "escalates until the evidence runs out."] if veto or depth < 0.75 else []),
            f"[{skin.display_name} bar raiser] hardest round; veto caps the outcome.",
        )


# ═══════════════════════════════════════════════════════════════════════════════
# 9) HIRING COMMITTEE  (Google) — an OUTCOME step, not a live round
# ═══════════════════════════════════════════════════════════════════════════════

_OUTCOME_BY_VERDICT = {
    "strong_hire": "hired", "hire": "hired", "leaning_hire": "team_match_needed",
    "leaning_no_hire": "more_interviews", "no_hire": "rejected", "strong_no_hire": "rejected",
}


class HiringCommitteeSimulator:
    """Assemble a packet from the prior rounds → 6-point verdict → outcome + 4 attributes."""

    def simulate(self, ctx: SimContext) -> RoundResult:
        skin = CompanySkin.for_company(ctx.blueprint)
        priors = [r for r in ctx.prior_results if r.round_type != "hiring_committee"]
        packet = {r.round_id: r.score_0_10 for r in priors}
        committee_score = _mean(list(packet.values())) if packet else _ability(ctx, "behavioral", skin) * 10

        def by_types(*types: str) -> float:
            xs = [r.score_0_10 for r in priors if r.round_type in types]
            return _mean(xs) if xs else committee_score

        attributes = {
            "general_cognitive_ability": round(by_types("technical_interview", "coding_test", "technical_mcq"), 2),
            "role_related_knowledge": round(by_types("technical_interview", "system_design", "technical_mcq"), 2),
            "leadership": round(by_types("hr_interview", "bar_raiser", "behavioral_survey"), 2),
            "googleyness": round(by_types("hr_interview"), 2),
        }
        _, verdict = _finish(committee_score)
        outcome = _OUTCOME_BY_VERDICT.get(verdict, "rejected")
        return _mk(
            ctx, committee_score, {k: v for k, v in attributes.items()},
            "net_new:hiring_committee",
            {"verdict": verdict, "outcome": outcome, "packet": packet, "attributes": attributes,
             "rounds_reviewed": len(packet)},
            [f"Packet reads '{verdict}' → {outcome}."],
            ([f"Weakest attribute: {min(attributes, key=attributes.get).replace('_', ' ')} "
              "— strengthen it to move the packet above the bar."] if packet else []),
            f"[{skin.display_name} committee] uninvolved reviewers · packet of "
            f"{len(packet)} rounds → {verdict}.",
        )


# ═══════════════════════════════════════════════════════════════════════════════
# REGISTRATION
# ═══════════════════════════════════════════════════════════════════════════════

_REGISTRATIONS = {
    "coding_test": CodingSimulator,
    "advanced_coding": CodingSimulator,
    "game_based_aptitude": GameBasedAptitudeSimulator,
    "voice_assessment": VoiceAssessmentSimulator,
    "written_communication": WrittenCommunicationSimulator,
    "behavioral_survey": BehavioralSurveySimulator,
    "work_simulation": WorkSimulationSimulator,
    "system_design": SystemDesignSimulator,
    "bar_raiser": BarRaiserSimulator,
    "hiring_committee": HiringCommitteeSimulator,
}


def register_net_new_simulators() -> list[str]:
    """Register every net-new simulator (overrides any prior registration)."""
    for rt, cls in _REGISTRATIONS.items():
        register_simulator(rt, cls())
    return sorted(_REGISTRATIONS)


# Wire M4 on import.
register_net_new_simulators()
