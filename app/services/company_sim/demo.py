"""
PrepVista — Company-Sim text-only end-to-end proof (Feature #01, M2)
====================================================================
Proves the orchestrator runs a complete, gated, ordered TCS process against the
reused-interview *fallback* simulators — no frontend, no LLM, fully
deterministic. Three candidates demonstrate the three outcomes the engine must
produce:

  * a STRONG candidate aiming Prime  → sits every round, gets a predicted track,
  * a WEAK candidate aiming Ninja    → eliminated at the Foundation gate,
  * a tab-switch during Foundation   → terminated (TCS tab_switch_policy=terminate).

Run:  ``python -m app.services.company_sim.demo``  (exit 0 on the expected shape).
"""

from __future__ import annotations

import sys

from app.services.company_sim.company_session import CompanySessionRecord, run_session
from app.services.company_sim.loader import load_blueprint
from app.services.company_sim.simulators import CandidateModel

_STATUS_MARK = {
    "cleared": "✅ cleared",
    "downgraded": "🔻 cleared (below target)",
    "eliminated": "❌ ELIMINATED",
    "terminated": "🚫 TERMINATED",
}


def render(rec: CompanySessionRecord) -> str:
    lines: list[str] = []
    lines.append("─" * 68)
    lines.append(f"{rec.display_name}  —  candidate '{rec.candidate}'  —  target: {rec.target_track}")
    lines.append(f"format_confidence={rec.format_confidence:.2f}  verified={rec.last_verified}")
    lines.append("─" * 68)
    for r in rec.rounds:
        mark = _STATUS_MARK.get(r.status, r.status)
        gate = r.gate
        extra = ""
        if gate.gate_type == "coding_count":
            extra = f"  solved={r.result.evidence.get('solved')}"
        elif "percentile" in r.result.evidence:
            extra = f"  ~p{r.result.evidence.get('percentile')}"
        elif gate.gate_type in ("committee", "rubric", "veto"):
            extra = f"  verdict={r.result.evidence.get('verdict','-')}"
        nm = r.negative_marking
        nm_txt = ""
        if nm.get("enabled") and nm.get("sections"):
            nm_txt = f"  [neg-marking:{nm.get('model')}]"
        lines.append(
            f"  R{r.order} {r.label[:38]:<38} {r.result.score_0_10:>4}/10  "
            f"{mark:<26}{extra}{nm_txt}"
        )
        if r.proctor_actions:
            lines.append(f"       proctor: {', '.join(r.proctor_actions)}")
    lines.append("")
    if rec.terminated_at:
        lines.append(f"  RESULT: 🚫 session TERMINATED at '{rec.terminated_at}' (proctoring).")
    elif rec.eliminated_at:
        lines.append(f"  RESULT: ❌ ELIMINATED at '{rec.eliminated_at}'. failed_gate={rec.failed_gate}")
    else:
        lines.append(
            f"  RESULT: ✅ completed. predicted_track = {rec.predicted_label or rec.predicted_track}  "
            f"(confidence {rec.confidence:.2f}, cleared {len(rec.cleared_gates)} gates)"
        )
        if rec.next_track:
            lines.append(f"  gap → {rec.next_label}:")
            for action in rec.gap_to_next_track:
                lines.append(f"     • {action}")
        elif rec.gap_hint:
            lines.append(f"  {rec.gap_hint}")
    prc = rec.proctoring
    lines.append(
        f"  proctoring: policy={prc.get('policy')} events={prc.get('total_events')} "
        f"review_flags={prc.get('review_flags')}"
    )
    return "\n".join(lines)


def _main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass

    tcs = load_blueprint("tcs")
    if tcs is None:
        print("FAIL: could not load tcs blueprint")
        return 1

    strong = CandidateModel(
        name="Aisha (strong)", seed=7, default_ability=0.86,
        ability={"aptitude_reasoning": 0.9, "problem_solving": 0.88, "coding": 0.85,
                 "technical_domain": 0.84, "situational_star": 0.8, "hr_behavioral": 0.82},
    )
    weak = CandidateModel(
        name="Rahul (weak)", seed=3, default_ability=0.42,
        ability={"aptitude_reasoning": 0.35, "problem_solving": 0.3, "coding": 0.25},
    )

    rec_strong = run_session(tcs, target_track="prime", candidate=strong)
    rec_weak = run_session(tcs, target_track="ninja", candidate=weak)
    rec_term = run_session(
        tcs, target_track="digital", candidate=strong,
        proctor_script={"tcs_foundation": [("tab_switch", "switched to another window")]},
    )

    print("PrepVista Company-Sim — TCS text-only end-to-end proof")
    print("=" * 68)
    print(render(rec_strong))
    print(render(rec_weak))
    print(render(rec_term))
    print("=" * 68)

    # ── assertions: the engine must produce exactly these shapes ───────────────
    checks = [
        (rec_strong.completed and not rec_strong.eliminated_at,
         "strong candidate should complete the full process"),
        (rec_strong.predicted_track in tcs.track_ids,
         "strong candidate should get a real predicted track"),
        (rec_weak.eliminated_at == "tcs_foundation",
         "weak candidate should be eliminated at the Foundation gate"),
        (rec_term.terminated_at == "tcs_foundation" and not rec_term.completed,
         "tab-switch must terminate at Foundation (TCS policy=terminate)"),
        (len(rec_strong.rounds) == len(tcs.rounds_for_track("prime")),
         "strong candidate should sit every Prime round"),
    ]
    ok = True
    print("\nASSERTIONS")
    for passed, msg in checks:
        print(f"  {'✅' if passed else '❌'} {msg}")
        ok = ok and passed
    print("\nRESULT:", "PASS ✅" if ok else "FAIL ❌")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(_main())
