"""
PrepVista — Track / Outcome Resolver (Feature #01, M5)
=====================================================
The "before the actual day" payoff (Dossier Part 6). After the orchestrator has
walked a company's rounds, this module converts the round-by-round performance
into that company's **real branching** and states the concrete **gap to the next
track**:

    predicted_track · confidence · gap_to_next_track[] · gap_hint ·
    cleared_gates[] · failed_gate · attribute_breakdown{} · track_evaluations[]

It is a *generic interpreter* of the blueprint's ``outcome_model``. Every company
expresses its branching as a list of ``tracks`` where each track carries a
``requires`` map of predicates (``coding_solved: 3``, ``foundation_overall_pct:
75``, ``bar_raiser_pass: true``, ``committee_verdict_min: "hire"`` …). The
resolver:

  1. extracts a flat set of **signals** from the session (per-round percentile,
     verdict, gate-clearance, played?, plus session-wide coding_solved /
     coding_clean, and per-attribute scores),
  2. evaluates each track's ``requires`` against those signals with one small,
     documented predicate vocabulary — the SAME vocabulary every blueprint uses,
     so **adding a company adds zero resolver code** (Feature #01's whole point),
  3. picks the highest track (in ``order_high_to_low``) whose predicates all pass,
  4. reads the *next* better track's failing predicates back out as concrete,
     student-facing actions ("Solve 1 more coding problem to reach Elite").

Pure stdlib, deterministic, never raises. Isolated: it imports only ``models``
and the shared ``VERDICT_SCALE`` — it does NOT import the orchestrator, so
``company_session`` can import it without a cycle. It reads the session via duck
typing (``rounds`` with ``.result`` / ``.gate`` / ``.status``) so the two modules
stay decoupled.

PREDICATE VOCABULARY (the full set the 11 Tier-A blueprints use)
---------------------------------------------------------------
    <prefix>_overall_pct / <prefix>_pct : N   round percentile ≥ N
    <prefix>_cleared                    : bool the round's gate floor cleared
    <prefix>_taken                      : bool the round was actually played
    <prefix>_hire                       : bool round performance ≥ 'hire' verdict
    <prefix>_pass  (bar_raiser/aa)      : bool the veto/AA gate was cleared
    coding_solved                       : N    total coding problems solved ≥ N
    coding_clean                        : bool every coding problem clean-solved
    committee_verdict_min               : V    committee verdict ≥ V (6-pt scale)
    deep_lp                             : bool LP performance ≥ 'hire' (deep)
    sectional_pass                      : bool the OA sectional round cleared
    certification                       : bool candidate holds a named cert (ctx)
    all_rounds_cleared                  : bool completed + every elim gate cleared

``<prefix>`` is matched to a round by alias tokens (``foundation`` → the TCS
foundation round; ``voice`` → the Wipro voice round; ``coding`` → every coding
round; ``lp`` → the leadership/behavioral rounds; ``system_design`` → the design
round; ``bar_raiser`` / ``aa`` → the veto round), so the same key means the same
thing for every company.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from app.services.company_sim.models import CompanyBlueprint
from app.services.company_sim.simulators import VERDICT_SCALE


# ═══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def _clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def _norm(s: object) -> str:
    """Lower-case, collapse non-alphanumerics to ``_`` (token normalisation)."""
    return re.sub(r"[^a-z0-9]+", "_", str(s).lower()).strip("_")


def _tokens(*parts: object) -> set[str]:
    """Split identifiers into their word tokens (``tcs_advanced_coding`` → {tcs,advanced,coding})."""
    out: set[str] = set()
    for p in parts:
        n = _norm(p)
        if not n:
            continue
        for tok in n.split("_"):
            if tok:
                out.add(tok)
        out.add(n)
    return out


def _verdict_index(v: object) -> int:
    v = _norm(v)
    return VERDICT_SCALE.index(v) if v in VERDICT_SCALE else 0


def _verdict_from_score(score_0_10: float) -> str:
    """Map any 0-10 round score to the 6-point committee scale (shared cut points)."""
    cuts = [(3.0, "strong_no_hire"), (4.5, "no_hire"), (5.5, "leaning_no_hire"),
            (6.5, "leaning_hire"), (8.0, "hire")]
    for hi, label in cuts:
        if score_0_10 < hi:
            return label
    return "strong_hire"


def _readable(prefix: str) -> str:
    return prefix.replace("_", " ").strip() or "the round"


# Alias tokens: a ``requires`` prefix → the round tokens that identify its round(s).
# This is the ONE place company-vocabulary is normalised; it is intentionally
# generous (a round matches if it shares ANY alias token) so a new blueprint that
# names its rounds naturally resolves without new code.
_PREFIX_ALIASES: dict[str, tuple[str, ...]] = {
    "foundation": ("foundation",),
    "advanced": ("advanced",),
    "cognitive": ("aptitude", "cognitive", "foundation", "reasoning"),
    "aptitude": ("aptitude", "cognitive", "foundation"),
    "sectional": ("aptitude", "foundation", "sectional", "mcq"),
    "coding": ("coding",),
    "voice": ("voice",),
    "essay": ("essay", "written"),
    "written": ("essay", "written"),
    "lp": ("lp", "leadership", "behavioral", "principles"),
    "system_design": ("system", "design", "hld", "lld"),
    "systemdesign": ("system", "design", "hld", "lld"),
    "lld": ("lld", "design"),
    "hld": ("hld", "design"),
    "committee": ("committee",),
    "bar_raiser": ("bar", "raiser"),
    "barraiser": ("bar", "raiser"),
    "aa": ("bar", "raiser", "aa"),
    "technical": ("technical",),
}

# Attribute name → tokens used to attribute per-section scores to a company pillar.
_ATTR_ALIASES: dict[str, tuple[str, ...]] = {
    "verbal": ("verbal", "communication", "english"),
    "reasoning": ("reasoning", "logical", "logic"),
    "numerical": ("numerical", "quant", "quants", "math"),
    "quant": ("quant", "quants", "numerical", "math"),
    "math_logical": ("math", "logical", "reasoning"),
    "advanced_logic": ("advanced", "programming", "logic"),
    "coding": ("coding", "programming", "dsa"),
    "pseudocode": ("pseudocode", "programming", "logic"),
    "aptitude": ("aptitude", "reasoning", "quant", "numerical"),
    "cognitive": ("aptitude", "reasoning"),
    "technical": ("technical", "domain"),
    "communication": ("communication", "verbal", "english", "voice", "spoken"),
    "voice": ("voice", "spoken"),
    "essay": ("essay", "written"),
    "written": ("essay", "written"),
    "leadership": ("leadership", "hr", "behavioral"),
    "leadership_principles": ("leadership", "principles", "lp"),
    "system_design": ("system", "design", "hld", "lld"),
    "work_judgment": ("work", "judgment", "scenario", "simulation"),
    "games": ("game", "games"),
    "basic_programming": ("coding", "programming", "basic"),
    "advanced": ("advanced", "coding"),
    "technical_hr": ("technical", "hr"),
    "project": ("project", "resume", "technical"),
    "behavioral": ("behavioral", "hr", "situational"),
    "problem_easy": ("easy", "coding"),
    "problem_medium": ("medium", "coding"),
    "problem_hard": ("hard", "coding"),
}


# ═══════════════════════════════════════════════════════════════════════════════
# SESSION SIGNALS  (extracted once, then queried by every predicate)
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class _RoundSig:
    round_id: str
    round_type: str
    label: str
    tokens: set[str]
    percentile: float | None
    verdict: str
    verdict_idx: int
    cleared: bool
    is_elimination: bool
    solved: int
    clean: bool
    score_0_10: float
    sub_scores: dict[str, float]
    section_competencies: dict[str, set[str]]   # section_id → tokens
    attributes: dict[str, float]                 # round-supplied attribute scores (0-10)


@dataclass
class SessionSignals:
    rounds: list[_RoundSig]
    coding_solved: int
    coding_clean: bool
    completed: bool
    eliminated: bool
    context: dict[str, Any] = field(default_factory=dict)   # e.g. {"certification": True}

    def match(self, prefix: str) -> list[_RoundSig]:
        """Rounds whose tokens intersect the alias tokens of ``prefix``."""
        aliases = _PREFIX_ALIASES.get(prefix, (prefix,))
        want = set(aliases)
        hits = [r for r in self.rounds if r.tokens & want]
        return hits


def _round_clean(result: Any) -> bool:
    ev = getattr(result, "evidence", {}) or {}
    pp = ev.get("per_problem")
    if isinstance(pp, list) and pp:
        return all(bool(p.get("clean")) for p in pp)
    if "clean" in ev:
        return bool(ev.get("clean"))
    # fallback simulator marks clean_solve at the section level
    secs = ev.get("sections", {})
    coding = [s for s in secs.values() if s.get("item_type") in ("coding", "build_app")]
    return bool(coding) and all(s.get("clean_solve") for s in coding)


def _extract_signals(
    blueprint: CompanyBlueprint,
    rounds: list[Any],
    *,
    completed: bool,
    eliminated: bool,
    context: dict[str, Any] | None,
) -> SessionSignals:
    """Flatten the played rounds into the signal set the predicates query."""
    sigs: list[_RoundSig] = []
    coding_solved = 0
    coding_clean_flags: list[bool] = []

    # blueprint rounds indexed to recover section competencies (results carry ids only)
    bp_rounds = {r.round_id: r for r in blueprint.rounds}

    for ro in rounds:
        result = ro.result
        ev = getattr(result, "evidence", {}) or {}
        rid = ro.round_id
        rtype = ro.round_type
        label = getattr(ro, "label", "") or ""

        bp_round = bp_rounds.get(rid)
        sec_comp: dict[str, set[str]] = {}
        round_tokens = _tokens(rid, rtype, label)
        if bp_round is not None:
            for sec in bp_round.sections:
                st = _tokens(sec.section_id, sec.competency, sec.item_type)
                sec_comp[sec.section_id] = st
                round_tokens |= st

        verdict = str(ev.get("verdict") or _verdict_from_score(result.score_0_10))
        solved = int(ev.get("solved", 0) or 0)
        clean = _round_clean(result)
        is_coding = ("coding" in round_tokens) or (rtype in ("coding_test", "advanced_coding"))
        if is_coding and (ev.get("coding_items") or ev.get("per_problem")):
            coding_solved += solved
            coding_clean_flags.append(clean)

        gate = getattr(ro, "gate", None)
        cleared = bool(getattr(gate, "cleared_floor", True)) if gate is not None else True

        pct = ev.get("percentile")
        attrs = ev.get("attributes") if isinstance(ev.get("attributes"), dict) else {}

        sigs.append(_RoundSig(
            round_id=rid, round_type=rtype, label=label, tokens=round_tokens,
            percentile=float(pct) if isinstance(pct, (int, float)) else None,
            verdict=verdict, verdict_idx=_verdict_index(verdict),
            cleared=cleared, is_elimination=bool(getattr(ro, "is_elimination", False)),
            solved=solved, clean=clean, score_0_10=float(result.score_0_10),
            sub_scores=dict(result.sub_scores or {}), section_competencies=sec_comp,
            attributes={k: float(v) for k, v in attrs.items() if isinstance(v, (int, float))},
        ))

    return SessionSignals(
        rounds=sigs,
        coding_solved=coding_solved,
        coding_clean=bool(coding_clean_flags) and all(coding_clean_flags),
        completed=completed,
        eliminated=eliminated,
        context=dict(context or {}),
    )


# ═══════════════════════════════════════════════════════════════════════════════
# PREDICATE EVALUATION
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class Requirement:
    key: str
    expected: Any
    passed: bool
    actual: Any
    needed: Any
    kind: str            # pct | cleared | taken | verdict | solved | clean | flag
    prefix: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {"key": self.key, "passed": self.passed,
                "actual": self.actual, "needed": self.needed, "kind": self.kind}


def _best_verdict(rounds: list[_RoundSig]) -> tuple[str, int]:
    """Aggregate verdict across matched rounds = verdict of their mean score."""
    if not rounds:
        return "no_hire", _verdict_index("no_hire")
    mean = sum(r.score_0_10 for r in rounds) / len(rounds)
    v = _verdict_from_score(mean)
    return v, _verdict_index(v)


def _round_percentile(rounds: list[_RoundSig]) -> float | None:
    pcts = [r.percentile for r in rounds if r.percentile is not None]
    if pcts:
        return sum(pcts) / len(pcts)
    # derive from score if a matched round carries no percentile
    scored = [r.score_0_10 for r in rounds]
    if scored:
        return round(_clamp(sum(scored) / len(scored) / 10.0, 0.01, 0.99) * 100, 1)
    return None


def _evaluate(key: str, expected: Any, sig: SessionSignals) -> Requirement:
    """Evaluate one ``requires`` predicate against the session signals."""
    k = _norm(key)

    # ── exact keys ──────────────────────────────────────────────────────────────
    if k == "all_rounds_cleared":
        elim = [r for r in sig.rounds if r.is_elimination]
        passed = sig.completed and all(r.cleared for r in elim)
        return Requirement(key, expected, passed and bool(expected),
                           f"{sum(r.cleared for r in elim)}/{len(elim)} cleared",
                           "all cleared", "cleared")

    if k == "certification":
        have = bool(sig.context.get("certification", False))
        return Requirement(key, expected, have == bool(expected), have, bool(expected), "flag")

    if k == "coding_solved":
        need = int(expected)
        return Requirement(key, expected, sig.coding_solved >= need,
                           sig.coding_solved, need, "solved", "coding")

    if k == "coding_clean":
        return Requirement(key, expected, sig.coding_clean == bool(expected),
                           sig.coding_clean, bool(expected), "clean", "coding")

    if k == "committee_verdict_min":
        rounds = sig.match("committee")
        v, vi = _best_verdict(rounds) if not rounds else (rounds[0].verdict, rounds[0].verdict_idx)
        need_i = _verdict_index(expected)
        return Requirement(key, expected, vi >= need_i, v, _norm(expected), "verdict", "committee")

    if k == "deep_lp":  # SDE2 needs *deep* LP evidence, not merely a pass
        rounds = sig.match("lp")
        v, vi = _best_verdict(rounds)
        need_i = _verdict_index("hire")
        return Requirement(key, expected, vi >= need_i, v, "hire", "verdict", "lp")

    if k == "sectional_pass":
        rounds = sig.match("sectional")
        passed = bool(rounds) and all(r.cleared for r in rounds)
        return Requirement(key, expected, passed == bool(expected),
                           passed, bool(expected), "cleared", "sectional")

    # ── suffix rules ────────────────────────────────────────────────────────────
    if k.endswith("_overall_pct") or k.endswith("_pct"):
        prefix = k[:-len("_overall_pct")] if k.endswith("_overall_pct") else k[:-len("_pct")]
        rounds = sig.match(prefix)
        actual = _round_percentile(rounds)
        need = float(expected)
        passed = actual is not None and actual >= need
        return Requirement(key, expected, passed, round(actual, 1) if actual is not None else None,
                           need, "pct", prefix)

    if k.endswith("_taken"):
        prefix = k[:-len("_taken")]
        played = bool(sig.match(prefix))
        return Requirement(key, expected, played == bool(expected), played, bool(expected),
                           "taken", prefix)

    if k.endswith("_cleared"):
        prefix = k[:-len("_cleared")]
        rounds = sig.match(prefix)
        passed = bool(rounds) and all(r.cleared for r in rounds)
        return Requirement(key, expected, passed == bool(expected), passed, bool(expected),
                           "cleared", prefix)

    if k.endswith("_hire"):
        prefix = k[:-len("_hire")]
        rounds = sig.match(prefix)
        v, vi = _best_verdict(rounds)
        need = "hire" if expected in (True, "true", "hire") else _norm(expected)
        return Requirement(key, expected, vi >= _verdict_index(need), v, need, "verdict", prefix)

    if k.endswith("_pass"):  # bar_raiser_pass / aa_pass → the veto gate cleared
        prefix = k[:-len("_pass")]
        rounds = sig.match(prefix)
        passed = bool(rounds) and all(r.cleared for r in rounds)
        return Requirement(key, expected, passed == bool(expected), passed, bool(expected),
                           "cleared", prefix)

    if k.endswith("_solved"):
        return Requirement(key, expected, sig.coding_solved >= int(expected),
                           sig.coding_solved, int(expected), "solved", "coding")

    # unknown predicate → treated as satisfied but flagged (never blocks a session)
    return Requirement(key, expected, True, None, expected, "unknown")


# ═══════════════════════════════════════════════════════════════════════════════
# RESOLUTION
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class TrackEvaluation:
    track: str
    label: str
    rank: int                    # 0 == highest track
    met: bool
    requirements: list[Requirement] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {"track": self.track, "label": self.label, "met": self.met,
                "requirements": [r.to_dict() for r in self.requirements]}


@dataclass
class OutcomeResolution:
    strategy: str
    predicted_track: str | None
    predicted_label: str
    next_track: str | None
    next_label: str
    confidence: float
    gap_to_next_track: list[str] = field(default_factory=list)
    gap_hint: str = ""
    cleared_gates: list[str] = field(default_factory=list)
    failed_gate: str | None = None
    attribute_breakdown: dict[str, float] = field(default_factory=dict)
    verdict: str | None = None
    eliminated: bool = False
    track_evaluations: list[TrackEvaluation] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "strategy": self.strategy,
            "predicted_track": self.predicted_track,
            "predicted_label": self.predicted_label,
            "next_track": self.next_track,
            "next_label": self.next_label,
            "confidence": round(self.confidence, 2),
            "gap_to_next_track": self.gap_to_next_track,
            "gap_hint": self.gap_hint,
            "cleared_gates": self.cleared_gates,
            "failed_gate": self.failed_gate,
            "attribute_breakdown": {k: round(v, 1) for k, v in self.attribute_breakdown.items()},
            "verdict": self.verdict,
            "eliminated": self.eliminated,
            "track_evaluations": [t.to_dict() for t in self.track_evaluations],
        }


def track_order_high_to_low(blueprint: CompanyBlueprint) -> list[str]:
    """Reliable high→low track order. Declared ``params.order_high_to_low`` wins;
    otherwise the ``tracks[]`` list is authored low→high, so we reverse it."""
    om = blueprint.outcome_model
    declared = (om.params or {}).get("order_high_to_low")
    track_ids = [str(t.get("track")) for t in om.tracks if t.get("track")]
    if isinstance(declared, list) and declared:
        rest = [t for t in track_ids if t not in declared]
        return [t for t in declared if t in track_ids] + rest
    if track_ids:
        return list(reversed(track_ids))
    # last resort: package order (ctc ascending → reverse)
    return list(reversed([p.track for p in blueprint.packages if p.track]))


def _track_label(blueprint: CompanyBlueprint, track: str | None) -> str:
    if not track:
        return ""
    for t in blueprint.outcome_model.tracks:
        if t.get("track") == track:
            return str(t.get("label") or track)
    for p in blueprint.packages:
        if p.track == track:
            return p.label or track
    return track


def _attribute_breakdown(blueprint: CompanyBlueprint, sig: SessionSignals) -> dict[str, float]:
    """Per-company attribute score on 0-100. Rounds that supply their own
    ``attributes`` (the hiring committee's 4 Google attributes) win; otherwise a
    pillar is the mean of the section scores whose competency tokens match it."""
    out: dict[str, float] = {}
    session_mean = (sum(r.score_0_10 for r in sig.rounds) / len(sig.rounds) * 10.0
                    if sig.rounds else 0.0)

    # round-supplied attributes (0-10) take precedence
    supplied: dict[str, float] = {}
    for r in sig.rounds:
        for name, val in r.attributes.items():
            supplied[_norm(name)] = val * 10.0

    for attr in blueprint.outcome_model.attributes:
        key = _norm(attr)
        if key in supplied:
            out[attr] = round(_clamp(supplied[key], 0, 100), 1)
            continue
        alias = set(_ATTR_ALIASES.get(key, (key,)))
        scores: list[float] = []
        for r in sig.rounds:
            for sid, toks in r.section_competencies.items():
                if toks & alias and sid in r.sub_scores:
                    scores.append(r.sub_scores[sid] * 10.0)
            if not r.section_competencies and (r.tokens & alias):
                scores.append(r.score_0_10 * 10.0)
        out[attr] = round(_clamp(sum(scores) / len(scores) if scores else session_mean, 0, 100), 1)
    return out


def _gap_action(req: Requirement, blueprint: CompanyBlueprint, next_label: str) -> str:
    """Turn a failing next-track predicate into a concrete student action."""
    p = _readable(req.prefix)
    if req.kind == "solved":
        gap = max(int(req.needed) - int(req.actual or 0), 1)
        return (f"Solve {gap} more coding problem(s) to reach {next_label} "
                f"(currently {req.actual}/{req.needed}).")
    if req.kind == "clean":
        return f"Clean-solve every coding problem (~95%+ of hidden tests) to reach {next_label}."
    if req.kind == "pct":
        cur = f"~{req.actual}" if req.actual is not None else "your current"
        return f"Lift {p} percentile to >={req.needed} (currently {cur}) to reach {next_label}."
    if req.kind == "taken":
        return f"Attempt the {p} section to unlock {next_label}."
    if req.kind == "verdict":
        return f"Raise {p} performance to a '{str(req.needed).replace('_', ' ')}' bar to reach {next_label}."
    if req.kind == "cleared":
        return f"Clear the {p} round to reach {next_label}."
    if req.kind == "flag" and req.prefix == "":
        return f"Add the required certification to reach {next_label}."
    if req.key.lower() == "certification":
        return f"Add a recognised certification (e.g. cloud / platform) to reach {next_label}."
    return f"Meet '{req.key}' to reach {next_label}."


def _confidence(blueprint: CompanyBlueprint, predicted_eval: TrackEvaluation | None,
                next_eval: TrackEvaluation | None) -> float:
    """format_confidence scaled by how decisive the branch was.

    A hand-verified blueprint predicting a track whose predicates passed
    comfortably (and whose next-track predicates failed clearly) keeps its full
    confidence; a borderline call is discounted toward 0.75× (never below)."""
    base = _clamp(blueprint.format_confidence or 0.5, 0.0, 1.0)
    margins: list[float] = []

    def _margin(req: Requirement, want_pass: bool) -> float | None:
        # 1.0 == decisive, 0.0 == right on the line
        if req.kind == "pct" and isinstance(req.actual, (int, float)):
            d = abs(float(req.actual) - float(req.needed)) / 100.0
            return _clamp(d * 4.0)  # 25pt gap == fully decisive
        if req.kind in ("solved",) and isinstance(req.actual, (int, float)):
            return _clamp(abs(int(req.actual) - int(req.needed)) / 2.0)
        if req.kind == "verdict":
            return _clamp(abs(_verdict_index(req.actual) - _verdict_index(req.needed)) / 2.0)
        if req.kind in ("cleared", "taken", "clean", "flag"):
            return 1.0 if req.passed == want_pass else 0.0
        return None

    if predicted_eval:
        for req in predicted_eval.requirements:
            m = _margin(req, True)
            if m is not None:
                margins.append(m)
    if next_eval:
        for req in next_eval.requirements:
            if not req.passed:
                m = _margin(req, False)
                if m is not None:
                    margins.append(m)

    decisiveness = sum(margins) / len(margins) if margins else 0.6
    return round(base * (0.75 + 0.25 * decisiveness), 2)


def resolve_outcome(
    blueprint: CompanyBlueprint,
    rounds: list[Any],
    *,
    target_track: str | None = None,
    completed: bool = True,
    eliminated_at: str | None = None,
    terminated_at: str | None = None,
    cleared_gates: list[str] | None = None,
    failed_gate: str | None = None,
    context: dict[str, Any] | None = None,
) -> OutcomeResolution:
    """Resolve a walked session into predicted track + gap-to-next (Dossier Part 6).

    ``rounds`` is the orchestrator's list of round outcomes (duck-typed:
    ``.round_id``, ``.round_type``, ``.label``, ``.is_elimination``, ``.result``,
    ``.gate``). Never raises.
    """
    om = blueprint.outcome_model
    order = track_order_high_to_low(blueprint)                    # high → low
    eliminated = bool(eliminated_at or terminated_at)
    sig = _extract_signals(blueprint, rounds, completed=completed,
                           eliminated=eliminated, context=context)

    # committee/rubric top-line verdict (for the report headline)
    committee = sig.match("committee")
    top_verdict = committee[0].verdict if committee else None

    # evaluate every track
    rank = {t: i for i, t in enumerate(order)}
    evals: list[TrackEvaluation] = []
    for t in om.tracks:
        tk = str(t.get("track"))
        requires = t.get("requires") or {}
        reqs = [_evaluate(k, v, sig) for k, v in requires.items()]
        evals.append(TrackEvaluation(
            track=tk, label=str(t.get("label") or tk),
            rank=rank.get(tk, len(order)), met=all(r.passed for r in reqs),
            requirements=reqs,
        ))
    evals.sort(key=lambda e: e.rank)   # highest track first
    by_track = {e.track: e for e in evals}

    attr_breakdown = _attribute_breakdown(blueprint, sig)

    # eliminated / terminated → no track attained
    if eliminated:
        return OutcomeResolution(
            strategy=om.strategy or "unknown",
            predicted_track=None, predicted_label="",
            next_track=None, next_label="",
            confidence=_confidence(blueprint, None, None),
            gap_to_next_track=[], gap_hint="",
            cleared_gates=list(cleared_gates or []),
            failed_gate=failed_gate or eliminated_at or terminated_at,
            attribute_breakdown=attr_breakdown, verdict=top_verdict,
            eliminated=True, track_evaluations=evals,
        )

    # predicted = highest track whose predicates all pass; else the base track
    predicted_eval = next((e for e in evals if e.met), None)
    if predicted_eval is None and evals:
        predicted_eval = evals[-1]   # lowest / base track as the floor offer
    predicted = predicted_eval.track if predicted_eval else None
    predicted_rank = predicted_eval.rank if predicted_eval else len(order)

    # next better track = one rank higher (smaller index in high→low order)
    next_eval = next((e for e in evals if e.rank == predicted_rank - 1), None)
    next_track = next_eval.track if next_eval else None

    gap_actions: list[str] = []
    gap_hint = ""
    if next_eval:
        next_label = next_eval.label
        for req in next_eval.requirements:
            if not req.passed:
                gap_actions.append(_gap_action(req, blueprint, next_label))
        hint_key = f"{predicted}_to_{next_track}"
        gap_hint = str((om.gap_hints or {}).get(hint_key, ""))
        if not gap_actions and gap_hint:
            gap_actions.append(gap_hint)
    else:
        gap_hint = f"You are tracking the top package — {predicted_eval.label if predicted_eval else ''}."

    return OutcomeResolution(
        strategy=om.strategy or "unknown",
        predicted_track=predicted,
        predicted_label=predicted_eval.label if predicted_eval else "",
        next_track=next_track,
        next_label=next_eval.label if next_eval else "",
        confidence=_confidence(blueprint, predicted_eval, next_eval),
        gap_to_next_track=gap_actions,
        gap_hint=gap_hint,
        cleared_gates=list(cleared_gates or []),
        failed_gate=failed_gate,
        attribute_breakdown=attr_breakdown,
        verdict=top_verdict,
        eliminated=False,
        track_evaluations=evals,
    )
