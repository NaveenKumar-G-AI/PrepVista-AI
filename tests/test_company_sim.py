"""
Tests for the Company-Specific Interview Simulation (app/services/company_sim).

Covers M1 (blueprint repository: schema validation, per-company rules that MUST
be honoured literally) and M2 (the engine: negative marking, timers/navigation,
attempt-state locking, proctoring, gate resolution, and end-to-end sessions that
never break). Pure/deterministic — no LLM, no I/O, no DB.
"""

import pytest

from app.services.company_sim import (
    CandidateModel,
    load_all_blueprints,
    load_blueprint,
    resolve_gate,
    run_session,
    validate_repository,
)
from app.services.company_sim.attempt_state import AttemptState, RevisitError
from app.services.company_sim.models import GateRule, NegativeMarking
from app.services.company_sim.negative_marking import apply_negative_marking
from app.services.company_sim.proctoring import ProctorAction, ProctoringMonitor
from app.services.company_sim.simulators import RoundResult, SimContext, resolve_simulator
from app.services.company_sim.skins import CompanySkin
from app.services.company_sim.reused_simulators import MODULE_FAMILY
from app.services.company_sim.timer_engine import NavigationError, TimerEngine


TIER_A = {"tcs", "infosys", "wipro", "cognizant", "accenture", "capgemini",
          "hcltech", "zoho", "amazon", "microsoft", "google"}


# ═══════════════════════════════════════════════════════════════════════════════
# M1 — REPOSITORY
# ═══════════════════════════════════════════════════════════════════════════════

def test_repository_validates_clean():
    errors, _warnings = validate_repository()
    assert errors == [], f"blueprint repository has errors: {errors}"


def test_all_eleven_tier_a_blueprints_present():
    bps = load_all_blueprints()
    assert TIER_A.issubset(set(bps)), f"missing: {TIER_A - set(bps)}"
    for cid, bp in bps.items():
        assert 0.0 <= bp.format_confidence <= 1.0
        assert bp.last_verified, f"{cid} missing last_verified"


def test_capgemini_bans_python_in_coding():
    bp = load_blueprint("capgemini")
    coding = [s for r in bp.rounds for s in r.sections if s.item_type == "coding"]
    assert coding, "capgemini should have coding sections"
    for s in coding:
        assert "Python" not in s.languages_allowed
        assert "Python" in s.languages_banned


def test_tcs_tab_switch_terminates_and_locks_forward():
    bp = load_blueprint("tcs")
    assert bp.platform.tab_switch_policy == "terminate"
    assert bp.platform.navigation == "locked_forward"


def test_wipro_essay_threshold_is_enabled():
    bp = load_blueprint("wipro")
    essays = [r for r in bp.rounds if r.round_type == "written_communication"]
    assert essays, "wipro should have a written_communication round"
    nm = essays[0].negative_marking
    assert nm.model == "threshold" and nm.enabled and nm.threshold == 5


def test_google_models_hiring_committee_outcome_step():
    bp = load_blueprint("google")
    committee = [r for r in bp.rounds if r.round_type == "hiring_committee"]
    assert committee, "google should model a hiring_committee round"
    assert bp.outcome_model.strategy == "committee"
    assert bp.ai_assistance_allowed is False  # Google forbids AI assistance


# ═══════════════════════════════════════════════════════════════════════════════
# M2 — NEGATIVE MARKING
# ═══════════════════════════════════════════════════════════════════════════════

def test_negative_marking_none_is_noop():
    nm = NegativeMarking(model="none")
    r = apply_negative_marking(nm, correct=8, wrong=2)
    assert r.adjusted_marks == 8.0 and r.penalty_marks == 0.0


def test_negative_marking_fixed_penalises_each_wrong():
    nm = NegativeMarking(enabled=True, model="fixed", penalty=0.33)
    r = apply_negative_marking(nm, correct=10, wrong=3)
    assert r.penalised_count == 3
    assert r.adjusted_marks == pytest.approx(10 - 3 * 0.33)


def test_negative_marking_threshold_frees_first_n():
    # Wipro essay: first 5 mistakes free, the rest penalised.
    nm = NegativeMarking(enabled=True, model="threshold", threshold=5)
    below = apply_negative_marking(nm, correct=0, wrong=5, per_item_marks=1.0)
    assert below.penalised_count == 0
    over = apply_negative_marking(nm, correct=0, wrong=8, per_item_marks=1.0)
    assert over.penalised_count == 3


# ═══════════════════════════════════════════════════════════════════════════════
# M2 — TIMER / NAVIGATION + ATTEMPT STATE
# ═══════════════════════════════════════════════════════════════════════════════

def test_locked_forward_blocks_revisiting_earlier_section():
    bp = load_blueprint("tcs")
    foundation = bp.rounds_for_track("ninja")[0]
    te = TimerEngine.for_round(foundation, bp.platform).start()
    order = te.order
    te.enter_section(order[0])
    te.enter_section(order[1])           # advance forward (locks section 0)
    with pytest.raises(NavigationError):
        te.enter_section(order[0])       # cannot go back under locked_forward


def test_free_all_allows_revisit():
    bp = load_blueprint("amazon")       # navigation == free_all
    rnd = bp.rounds[0]
    te = TimerEngine.for_round(rnd, bp.platform).start()
    if len(te.order) >= 2:
        te.enter_section(te.order[0])
        te.enter_section(te.order[1])
        assert te.can_navigate_to(te.order[0]) is True


def test_attempt_state_no_revisit_raises():
    st = AttemptState(navigation="locked_forward")
    st.answer("q1", "A")
    st.advance_past("q1")               # locks it
    with pytest.raises(RevisitError):
        st.answer("q1", "B")


def test_attempt_state_free_all_allows_edit():
    st = AttemptState(navigation="free_all")
    st.answer("q1", "A")
    st.advance_past("q1")
    st.answer("q1", "B")                # allowed
    assert st.answers["q1"] == "B"


# ═══════════════════════════════════════════════════════════════════════════════
# M2 — PROCTORING
# ═══════════════════════════════════════════════════════════════════════════════

def test_proctoring_terminate_policy():
    m = ProctoringMonitor(tab_switch_policy="terminate", proctored=True)
    ev = m.tab_switch("r1")
    assert ev.action == ProctorAction.TERMINATE and m.terminated


def test_proctoring_flag_never_terminates_and_never_penalises():
    m = ProctoringMonitor(tab_switch_policy="flag", proctored=True)
    m.tab_switch("r1")
    m.integrity_signal("r1", "paste")
    assert not m.terminated
    assert m.summary()["review_flags"] == 2


# ═══════════════════════════════════════════════════════════════════════════════
# M2 — GATE RESOLUTION
# ═══════════════════════════════════════════════════════════════════════════════

def _result(score, **evidence):
    return RoundResult(round_id="r", round_type="t", score_0_10=score, evidence=evidence)


def test_rubric_gate_pass_fail():
    gate = GateRule(type="rubric", params={"min_score_0_10": 5.5})
    out_hi = resolve_gate(gate, _result(6.0), target_track="x", order_high_to_low=["x"])
    out_lo = resolve_gate(gate, _result(4.0), target_track="x", order_high_to_low=["x"])
    assert out_hi.cleared_floor and not out_lo.cleared_floor


def test_coding_count_gate_uses_solved():
    gate = GateRule(type="coding_count", params={"min_solved_by_track": {"digital": 1, "prime": 2}})
    r = _result(7.0, solved=1)
    out = resolve_gate(gate, r, target_track="prime", order_high_to_low=["prime", "digital"])
    assert out.cleared_floor          # cleared digital floor (1)
    assert not out.cleared_target     # missed prime target (2)
    assert out.attained_track == "digital"


# ═══════════════════════════════════════════════════════════════════════════════
# M2 — END-TO-END SESSIONS
# ═══════════════════════════════════════════════════════════════════════════════

def test_tcs_strong_candidate_completes_with_a_track():
    tcs = load_blueprint("tcs")
    strong = CandidateModel(name="strong", seed=7, default_ability=0.86)
    rec = run_session(tcs, target_track="prime", candidate=strong)
    assert rec.completed and rec.eliminated_at is None
    assert rec.predicted_track in tcs.track_ids
    assert len(rec.rounds) == len(tcs.rounds_for_track("prime"))


def test_tcs_weak_candidate_eliminated_at_foundation():
    tcs = load_blueprint("tcs")
    weak = CandidateModel(name="weak", seed=3, default_ability=0.35)
    rec = run_session(tcs, target_track="ninja", candidate=weak)
    assert rec.eliminated_at == "tcs_foundation"
    assert rec.failed_gate == "tcs_foundation"
    assert not rec.completed


def test_tab_switch_terminates_tcs_session():
    tcs = load_blueprint("tcs")
    strong = CandidateModel(name="strong", seed=7, default_ability=0.86)
    rec = run_session(
        tcs, target_track="digital", candidate=strong,
        proctor_script={"tcs_foundation": [("tab_switch", "left window")]},
    )
    assert rec.terminated_at == "tcs_foundation" and not rec.completed


# ═══════════════════════════════════════════════════════════════════════════════
# M3 — COMPANY SKINS + REUSED INTERVIEW SIMULATORS
# ═══════════════════════════════════════════════════════════════════════════════

# The pure reused interview rounds. behavioral_survey is in MODULE_FAMILY but is
# intentionally OWNED by the M4 net-new simulator (§7), which overrides M3.
REUSED_ONLY = {"technical_interview", "managerial_interview", "hr_interview", "group_discussion"}


def test_reused_interview_simulators_are_registered():
    for rt in REUSED_ONLY:
        sim = resolve_simulator(rt)
        assert type(sim).__name__ == "ReusedInterviewSimulator"


def test_skin_strictness_scales_with_archetype():
    tcs = CompanySkin.for_company(load_blueprint("tcs"))          # mass_service
    amazon = CompanySkin.for_company(load_blueprint("amazon"))    # premium_product
    assert amazon.grading_strictness > tcs.grading_strictness
    assert amazon.leniency < tcs.leniency  # premium bar → same answer scores lower


def test_skin_emphasis_derived_from_culture_values():
    amazon = CompanySkin.for_company(load_blueprint("amazon"))
    google = CompanySkin.for_company(load_blueprint("google"))
    assert amazon.emphasis.get("leadership_principles", 0) > 0   # LP company
    assert google.emphasis.get("culture_fit", 0) > 0            # Googleyness


def test_same_round_scores_stricter_under_a_higher_bar_company():
    """Hold the round + candidate constant; only the company skin changes."""
    tcs = load_blueprint("tcs")
    amazon = load_blueprint("amazon")
    rnd = next(r for r in tcs.rounds if r.round_type == "technical_interview")
    cand = CandidateModel(name="ctl", seed=9, default_ability=0.75)
    sim = resolve_simulator("technical_interview")

    def score_under(bp):
        ctx = SimContext(blueprint=bp, round=rnd, track=list(bp.track_ids)[0],
                         candidate=cand, ai_assistance_allowed=bp.ai_assistance_allowed)
        return sim.simulate(ctx)

    r_tcs = score_under(tcs)
    r_amz = score_under(amazon)
    assert r_amz.score_0_10 < r_tcs.score_0_10
    assert r_tcs.evidence["simulator"] == "reused:technical_interview"
    assert r_tcs.evidence["module_family"] == MODULE_FAMILY["technical_interview"]


def test_tcs_session_interview_rounds_use_reused_simulators():
    tcs = load_blueprint("tcs")
    rec = run_session(tcs, target_track="prime",
                      candidate=CandidateModel(name="s", seed=7, default_ability=0.86))
    interview_rounds = [r for r in rec.rounds
                        if r.round_type in ("technical_interview", "managerial_interview", "hr_interview")]
    assert interview_rounds
    for r in interview_rounds:
        assert r.result.evidence.get("simulator", "").startswith("reused:")


@pytest.mark.parametrize("company_id", sorted(TIER_A))
def test_every_company_runs_without_breaking(company_id):
    """Hard constraint: a session never breaks on failure, for any company/track."""
    bp = load_blueprint(company_id)
    assert bp is not None
    mid = CandidateModel(name="mid", seed=11, default_ability=0.7)
    for track in sorted(bp.track_ids):
        rec = run_session(bp, target_track=track, candidate=mid)
        assert rec.company_id == company_id
        assert rec.rounds, f"{company_id}/{track} produced no rounds"
        # terminal state is well-defined
        assert rec.completed or rec.eliminated_at or rec.terminated_at


# ═══════════════════════════════════════════════════════════════════════════════
# M4 — NET-NEW SIMULATORS
# ═══════════════════════════════════════════════════════════════════════════════

def _play_round(company_id, round_type, candidate):
    bp = load_blueprint(company_id)
    rnd = next(r for r in bp.rounds if r.round_type == round_type)
    ctx = SimContext(blueprint=bp, round=rnd, track=sorted(bp.track_ids)[0],
                     candidate=candidate, ai_assistance_allowed=bp.ai_assistance_allowed)
    return resolve_simulator(round_type).simulate(ctx)


def test_net_new_simulators_registered():
    from app.services.company_sim.net_new_simulators import _REGISTRATIONS
    for rt in _REGISTRATIONS:
        assert resolve_simulator(rt).__class__.__name__ != "FallbackSimulator"


def test_coding_never_uses_banned_language_capgemini_python():
    cand = CandidateModel(name="dev", seed=4, default_ability=0.8, ability={"coding": 0.85})
    res = _play_round("capgemini", "coding_test", cand)
    assert res.evidence["python_banned"] is True
    for p in res.evidence["per_problem"]:
        assert p["language"] in ("C", "C++", "Java")
        assert p["language"] != "Python"


def test_coding_partial_scoring_and_solved_count():
    cand = CandidateModel(name="dev", seed=2, default_ability=0.9, ability={"coding": 0.9})
    res = _play_round("amazon", "coding_test", cand)
    assert res.evidence["execution_path"] == "hidden_test_sim"
    assert 0 <= res.evidence["solved"] <= res.evidence["coding_items"]
    for p in res.evidence["per_problem"]:
        assert 0.0 <= p["hidden_pass_fraction"] <= 1.0


def test_capgemini_game_draws_four_of_pool():
    cand = CandidateModel(name="g", seed=6, default_ability=0.7)
    res = _play_round("capgemini", "game_based_aptitude", cand)
    assert res.evidence["drawn"] == 4
    assert res.evidence["pool_size"] == 24
    for g in res.evidence["games"]:
        assert 0 <= g["max_level"] <= g["levels"]


def test_wipro_essay_threshold_penalises_weak_writer():
    weak = CandidateModel(name="weak-writer", seed=1, default_ability=0.3,
                          ability={"written_english": 0.25})
    res = _play_round("wipro", "written_communication", weak)
    ev = res.evidence
    assert ev["threshold"] == 5
    assert ev["mistakes"] > 5 and ev["penalised_mistakes"] > 0
    assert res.score_0_10 < ev["base_quality"]   # the penalty actually bit


def test_voice_reports_wpm_and_filler():
    cand = CandidateModel(name="v", seed=8, default_ability=0.6)
    res = _play_round("wipro", "voice_assessment", cand)
    assert 90 <= res.evidence["wpm"] <= 180
    assert res.evidence["mode"] == "transcript_fallback"


def test_bar_raiser_veto_flags_weak_candidate():
    weak = CandidateModel(name="weak-lp", seed=5, default_ability=0.35,
                          ability={"leadership_principles": 0.3})
    res = _play_round("amazon", "bar_raiser", weak)
    assert res.evidence["veto_triggered"] is True
    assert res.evidence["persona"] == "different_team_senior"


def test_google_hiring_committee_produces_verdict_and_outcome():
    strong = CandidateModel(name="g-strong", seed=7, default_ability=0.85)
    google = load_blueprint("google")
    rec = run_session(google, target_track="l3", candidate=strong)
    committee = [r for r in rec.rounds if r.round_type == "hiring_committee"]
    assert committee, "google session should reach the committee (or be eliminated earlier)"
    ev = committee[0].result.evidence
    assert ev["verdict"] in ("strong_no_hire", "no_hire", "leaning_no_hire",
                             "leaning_hire", "hire", "strong_hire")
    assert ev["outcome"] in ("hired", "team_match_needed", "more_interviews", "rejected")
    assert set(ev["attributes"]) == {"general_cognitive_ability", "role_related_knowledge",
                                     "leadership", "googleyness"}
    assert ev["rounds_reviewed"] >= 1   # packet assembled from prior rounds


def test_net_new_simulators_never_break_on_empty_candidate():
    """A default (empty-ability) candidate still completes every net-new round type."""
    from app.services.company_sim.net_new_simulators import _REGISTRATIONS
    cand = CandidateModel()  # all defaults
    for cid in ("amazon", "google", "wipro", "capgemini", "zoho", "cognizant"):
        bp = load_blueprint(cid)
        for rnd in bp.rounds:
            if rnd.round_type in _REGISTRATIONS:
                ctx = SimContext(blueprint=bp, round=rnd, track=sorted(bp.track_ids)[0],
                                 candidate=cand, ai_assistance_allowed=bp.ai_assistance_allowed)
                res = resolve_simulator(rnd.round_type).simulate(ctx)
                assert 0.0 <= res.score_0_10 <= 10.0


# ═══════════════════════════════════════════════════════════════════════════════
# M5 — OUTCOME RESOLVER (track prediction faithful to each company's branching)
# ═══════════════════════════════════════════════════════════════════════════════

from app.services.company_sim.outcome_resolver import (  # noqa: E402
    resolve_outcome,
    track_order_high_to_low,
)


def _run(company_id, track, ability, **abilities):
    bp = load_blueprint(company_id)
    cand = CandidateModel(name="c", seed=7, default_ability=ability, ability=abilities)
    return bp, run_session(bp, target_track=track, candidate=cand)


def test_track_order_is_high_to_low_for_every_company():
    for cid in sorted(TIER_A):
        bp = load_blueprint(cid)
        order = track_order_high_to_low(bp)
        assert set(order) == set(bp.track_ids), f"{cid}: order != track ids"
        # ctc should be (weakly) descending high→low where packages carry ctc
        ctc = {p.track: (p.ctc_lpa[-1] if p.ctc_lpa else 0.0) for p in bp.packages}
        vals = [ctc.get(t, 0.0) for t in order]
        assert vals == sorted(vals, reverse=True), f"{cid}: {order} not ctc-descending {vals}"


def test_tcs_strong_but_not_clean_lands_digital_not_prime():
    """Prime needs a clean advanced coding solve + higher advanced percentile; a
    strong-but-not-elite candidate must be told they're tracking Digital."""
    _bp, rec = _run("tcs", "prime", 0.9, coding=0.85, aptitude_reasoning=0.9,
                    problem_solving=0.9)
    assert rec.completed
    assert rec.predicted_track == "digital"
    assert rec.next_track == "prime"
    assert rec.gap_to_next_track, "should list concrete actions to reach Prime"
    assert any("Prime" in g for g in rec.gap_to_next_track)


def test_tcs_top_candidate_reaches_prime_with_no_gap():
    _bp, rec = _run("tcs", "prime", 1.0, coding=1.0, aptitude_reasoning=1.0,
                    problem_solving=1.0)
    assert rec.predicted_track == "prime"
    assert rec.next_track is None
    assert rec.gap_to_next_track == []


def test_eliminated_session_has_no_predicted_track_but_keeps_failed_gate():
    _bp, rec = _run("tcs", "ninja", 0.35, aptitude_reasoning=0.3)
    assert rec.eliminated_at == "tcs_foundation"
    assert rec.predicted_track is None
    res = resolve_outcome(_bp := load_blueprint("tcs"), rec.rounds,
                          eliminated_at=rec.eliminated_at, failed_gate=rec.failed_gate,
                          completed=False)
    assert res.eliminated and res.failed_gate == "tcs_foundation"


def test_cognizant_certification_gates_genc_pro():
    """GenC Pro needs a certification; without it a 4-solver cannot be Pro."""
    bp = load_blueprint("cognizant")
    cand = CandidateModel(name="c", seed=7, default_ability=0.85, ability={"coding": 0.85})
    rec_no_cert = run_session(bp, target_track="genc_pro", candidate=cand)
    rec_cert = run_session(bp, target_track="genc_pro", candidate=cand,
                           context={"certification": True})
    pro_no = next(t for t in rec_no_cert.outcome["track_evaluations"] if t["track"] == "genc_pro")
    pro_yes = next(t for t in rec_cert.outcome["track_evaluations"] if t["track"] == "genc_pro")
    cert_req_no = next(r for r in pro_no["requirements"] if r["key"] == "certification")
    cert_req_yes = next(r for r in pro_yes["requirements"] if r["key"] == "certification")
    assert cert_req_no["passed"] is False
    assert cert_req_yes["passed"] is True


def test_confidence_tracks_format_confidence():
    """A hand-verified blueprint (TCS 0.90) yields higher confidence than the
    low-fidelity HCLTech (0.45) for a comparable run."""
    _b1, tcs = _run("tcs", "digital", 0.8, coding=0.8, aptitude_reasoning=0.8)
    _b2, hcl = _run("hcltech", "digital", 0.8, coding=0.8)
    assert tcs.confidence > hcl.confidence
    assert 0.0 <= hcl.confidence <= 1.0 and 0.0 <= tcs.confidence <= 1.0


def test_attribute_breakdown_covers_declared_attributes():
    for cid in sorted(TIER_A):
        bp = load_blueprint(cid)
        track = track_order_high_to_low(bp)[0]
        rec = run_session(bp, target_track=track,
                          candidate=CandidateModel(name="c", seed=11, default_ability=0.7))
        for attr in bp.outcome_model.attributes:
            assert attr in rec.attribute_breakdown, f"{cid} missing attribute {attr}"
            assert 0.0 <= rec.attribute_breakdown[attr] <= 100.0


def test_google_committee_verdict_surfaces_in_resolution():
    strong = CandidateModel(name="g", seed=7, default_ability=0.85)
    rec = run_session(load_blueprint("google"), target_track="l3", candidate=strong)
    if rec.completed:
        assert rec.verdict in ("strong_no_hire", "no_hire", "leaning_no_hire",
                               "leaning_hire", "hire", "strong_hire")


# ═══════════════════════════════════════════════════════════════════════════════
# M5 — PARAMETRIC ITEM GENERATORS (computed keys + cosine dedup)
# ═══════════════════════════════════════════════════════════════════════════════

from app.services.company_sim.item_generators import (  # noqa: E402
    CosineDedupIndex,
    ItemGenerator,
    generate_aptitude,
    generate_pseudocode,
)


def test_every_template_produces_wellformed_item_with_key_in_options():
    gen = ItemGenerator()
    for family in (ItemGenerator.APTITUDE, ItemGenerator.PSEUDOCODE):
        for topic in gen.topics(family):
            for diff in ("easy", "medium", "hard"):
                it = gen.generate(family, topic, difficulty=diff, seed=3, nonce=1)
                assert len(it.options) >= 4
                assert len(set(it.options)) == len(it.options)   # no dup options
                assert it.answer in it.options
                assert 0 <= it.correct_index < len(it.options)


def test_generator_is_deterministic():
    gen = ItemGenerator()
    a = gen.generate(ItemGenerator.APTITUDE, "percentage", seed=5, nonce=9)
    b = gen.generate(ItemGenerator.APTITUDE, "percentage", seed=5, nonce=9)
    assert a.to_dict() == b.to_dict()


def test_percentage_key_is_mathematically_correct():
    gen = ItemGenerator()
    for nonce in range(15):
        it = gen.generate(ItemGenerator.APTITUDE, "percentage", seed=1, nonce=nonce)
        base, pct = it.params["base"], it.params["pct"]
        expected = base * pct / 100.0
        expected_str = str(int(expected)) if abs(expected - round(expected)) < 1e-9 else None
        assert it.answer == (expected_str or it.answer)
        assert float(it.answer) == expected


def test_pseudocode_keys_are_executed_not_guessed():
    """Re-derive a couple of pseudocode answers independently."""
    gen = ItemGenerator()
    for nonce in range(10):
        it = gen.generate(ItemGenerator.PSEUDOCODE, "loop_product", seed=2, nonce=nonce)
        import math as _m
        assert int(it.answer) == _m.factorial(it.params["n"])
        it2 = gen.generate(ItemGenerator.PSEUDOCODE, "nested_counter", seed=2, nonce=nonce)
        assert int(it2.answer) == it2.params["a"] * it2.params["b"]


def test_dedup_rejects_exact_and_near_duplicates():
    idx = CosineDedupIndex()
    gen = ItemGenerator()
    p = gen.generate(ItemGenerator.PSEUDOCODE, "loop_sum", seed=9, nonce=1).prompt
    assert idx.accept(p) is True
    assert idx.accept(p) is False                      # exact repeat rejected
    near = gen.generate(ItemGenerator.PSEUDOCODE, "loop_sum", seed=9, nonce=2).prompt
    assert idx.accept(near) is False                   # high-overlap near-dupe rejected


def test_batch_generation_is_varied_and_deduped():
    apt = generate_aptitude(12, seed=4)
    assert len(apt) >= 8
    assert len({i.topic for i in apt}) >= 8            # spread across topics
    pse = generate_pseudocode(7, seed=4)
    assert len(pse) >= 5
    for it in apt + pse:
        assert it.answer in it.options


# ═══════════════════════════════════════════════════════════════════════════════
# M6 — COMPANY REPORT (timeline + predicted track + coaching + visibility)
# ═══════════════════════════════════════════════════════════════════════════════

from app.services.company_sim.company_report import (  # noqa: E402
    build_company_report,
    company_coaching,
)


def _report(company_id, track, ability, audience="student", **abilities):
    bp = load_blueprint(company_id)
    rec = run_session(bp, target_track=track,
                      candidate=CandidateModel(name="c", seed=7, default_ability=ability,
                                               ability=abilities))
    return bp, rec, build_company_report(rec, bp, audience=audience)


def test_report_has_all_company_sections_for_a_completed_session():
    _bp, rec, rep = _report("tcs", "prime", 0.9, coding=0.85, aptitude_reasoning=0.9)
    keys = {s.key for s in rep.sections}
    assert {"company_headline", "round_timeline", "track_prediction",
            "attribute_breakdown", "company_coaching", "proctoring_detail"} <= keys
    tl = rep.section("round_timeline").body
    assert len(tl["rounds"]) == len(rec.rounds)
    assert rep.section("track_prediction").body["predicted_track"] == rec.predicted_track


def test_proctoring_detail_is_tpo_only():
    _bp, _rec, student = _report("tcs", "digital", 0.8, audience="student", coding=0.8)
    _bp2, _rec2, tpo = _report("tcs", "digital", 0.8, audience="tpo", coding=0.8)
    student_keys = {s.key for s in student.visible_sections()}
    tpo_keys = {s.key for s in tpo.visible_sections()}
    assert "proctoring_detail" not in student_keys
    assert "proctoring_detail" in tpo_keys


def test_per_round_proctor_actions_hidden_from_student():
    """A terminated TCS session: the student timeline must not carry proctor actions."""
    bp = load_blueprint("tcs")
    rec = run_session(bp, target_track="digital",
                      candidate=CandidateModel(name="s", seed=7, default_ability=0.86),
                      proctor_script={"tcs_foundation": [("tab_switch", "left window")]})
    student = build_company_report(rec, bp, audience="student")
    tpo = build_company_report(rec, bp, audience="tpo")
    s_rounds = student.section("round_timeline").body["rounds"]
    t_rounds = tpo.section("round_timeline").body["rounds"]
    assert all("proctor_actions" not in r for r in s_rounds)
    assert any(r.get("proctor_actions") for r in t_rounds)
    # student still gets a soft, non-accusatory note
    assert student.meta.get("student_note")


def test_capgemini_coaching_reminds_python_is_banned():
    # senior_analyst is the track that actually sits the (Python-banned) coding round
    bp = load_blueprint("capgemini")
    rec = run_session(bp, target_track="senior_analyst",
                      candidate=CandidateModel(name="c", seed=7, default_ability=0.8,
                                               ability={"coding": 0.85}))
    assert any(ro.round_type == "coding_test" for ro in rec.rounds), "coding round should be sat"
    tips = company_coaching(rec, bp)
    assert any("Python" in t for t in tips), tips


def test_wipro_coaching_reports_wpm_and_filler():
    bp = load_blueprint("wipro")
    rec = run_session(bp, target_track="elite",
                      candidate=CandidateModel(name="c", seed=7, default_ability=0.75))
    tips = company_coaching(rec, bp)
    assert any("WPM" in t and "filler" in t for t in tips), tips


def test_report_renders_text_and_html_and_dict():
    _bp, _rec, rep = _report("amazon", "sde1", 0.8, coding=0.85)
    txt = rep.render_text()
    htmls = rep.render_html()
    d = rep.to_dict()
    assert "COMPANY REPORT" in txt
    assert "<section" in htmls and "Round Timeline" in htmls
    assert d["mode"] == "company" and d["sections"]


def test_report_never_breaks_for_any_company_and_audience():
    for cid in sorted(TIER_A):
        bp = load_blueprint(cid)
        for track in sorted(bp.track_ids):
            rec = run_session(bp, target_track=track,
                              candidate=CandidateModel(name="c", seed=11, default_ability=0.7))
            for audience in ("student", "tpo"):
                rep = build_company_report(rec, bp, audience=audience)
                assert rep.render_text()
                assert rep.to_dict()["sections"]


# ═══════════════════════════════════════════════════════════════════════════════
# M7 — ROSTER EXPANSION (Tier-B/C mapping; zero-code company addition)
# ═══════════════════════════════════════════════════════════════════════════════

from app.services.company_sim.archetype_factory import materialize_blueprint  # noqa: E402
from app.services.company_sim.loader import load_archetypes, load_platform_skins  # noqa: E402
from app.services.company_sim.roster import (  # noqa: E402
    list_roster,
    request_modeling,
    resolve_company,
    roster_counts,
    search,
)


def test_every_archetype_materializes_a_valid_runnable_blueprint():
    skins = set(load_platform_skins().keys())
    arch = load_archetypes()
    for name, meta in arch.items():
        bp = materialize_blueprint(f"probe_{name}", f"Probe {name}", meta,
                                   archetype_name=name, tier_rank="B")
        errs, _warns = bp.validate(known_skins=skins, known_archetypes=set(arch.keys()))
        assert errs == [], f"{name} materialized with errors: {errs}"
        rec = run_session(bp, candidate=CandidateModel(name="m", seed=7, default_ability=0.72,
                                                       ability={"coding": 0.75}))
        assert rec.completed or rec.eliminated_at or rec.terminated_at


def test_roster_has_full_breadth_and_no_dead_ends():
    counts = roster_counts()
    assert counts["A"] == len(TIER_A)
    assert counts["B"] >= 100
    assert counts["C"] >= 300
    assert counts["total"] >= 600


def test_tier_a_wins_and_matches_by_alias():
    for alias, cid in [("TCS", "tcs"), ("Google", "google"), ("Amazon", "amazon")]:
        res = resolve_company(alias)
        assert res.tier_rank == "A"
        assert res.company_id == cid
        assert res.blueprint.format_confidence >= 0.4


def test_tier_b_named_company_materializes_and_runs():
    res = resolve_company("Hexaware")
    assert res.tier_rank == "B" and res.source == "tier_b_template"
    assert res.archetype == "mass_service"
    rec = run_session(res.blueprint,
                      candidate=CandidateModel(name="c", seed=7, default_ability=0.75,
                                               ability={"coding": 0.78}))
    assert rec.completed or rec.eliminated_at
    # the whole pipeline (report) works on a materialized blueprint, unchanged
    rep = build_company_report(rec, res.blueprint, audience="student")
    assert rep.to_dict()["sections"]
    assert rep.meta["verify_banner"] is True   # Tier-B carries the verify banner


def test_unknown_company_never_dead_ends():
    res = resolve_company("Totally Fictional Newco 9000")
    assert res.blueprint is not None
    assert res.tier_rank == "C"
    assert res.matched is False                # fell through to the generic default
    rec = run_session(res.blueprint, candidate=CandidateModel(name="c", seed=3, default_ability=0.6))
    assert rec.completed or rec.eliminated_at or rec.terminated_at


def test_zero_code_company_addition_end_to_end():
    """The M7 proof: a company the engine has never seen becomes a full, gated,
    predicted, reported simulation with NO per-company code — only data."""
    res = resolve_company("Nagarro")                     # Tier-B, mass_service template
    bp = res.blueprint
    skins = set(load_platform_skins().keys())
    errs, _ = bp.validate(known_skins=skins, known_archetypes=set(load_archetypes().keys()))
    assert errs == []
    rec = run_session(bp, candidate=CandidateModel(name="dev", seed=7, default_ability=0.8,
                                                   ability={"coding": 0.82}))
    assert rec.rounds
    report = build_company_report(rec, bp, audience="student")
    d = report.to_dict()
    assert d["sections"] and d["company_id"] == bp.company_id


def test_search_and_request_modeling():
    hits = search("swiggy")
    assert any(h.display_name == "Swiggy" for h in hits)
    resp = request_modeling("Swiggy", campus="Test Campus", persist=False)
    assert resp["recorded"] is True
    assert resp["current_tier"] in ("B", "C")
    assert "Swiggy" in resp["resolved_as"]
