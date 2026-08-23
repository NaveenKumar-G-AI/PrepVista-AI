"""
PrepVista — Company-Mode Report Builder (Feature #01, M6)
========================================================
Turns a walked :class:`CompanySessionRecord` into the company-mode report
sections described in ``data/company_feedback_config.json`` — the round-by-round
timeline, the predicted track + gap-to-next, the per-company attribute breakdown,
company-specific coaching, and (TPO-only) the proctoring detail. These sections
sit **on top of** the existing 10 general-report sections (Dossier Part 11); the
schema matches ``feedback_config.json`` so the existing report pipeline can render
them unchanged.

Student vs TPO visibility (Dossier §11 / §17, conservative integrity):
  * the **student** sees every section except the full proctoring detail, which
    surfaces to them only as a soft "session flagged for review" note;
  * the **TPO** sees everything, including per-round proctor actions and the full
    integrity summary.

Company-specific coaching is real, not generic (Dossier Part 11): Wipro voice →
filler-word rate + WPM; Amazon → measurable impact in LP stories; Cognizant →
reach the max game level; Capgemini → Python is banned, drill C/C++/Java; TCS →
clean-solve the advanced coding for Prime — each pulled from the round evidence
so the number is the student's own.

Pure stdlib, deterministic, never raises. ``render_text`` proves it on the
console; ``to_dict`` feeds the frontend / PDF; ``render_html`` produces a
self-contained round-timeline result view.
"""

from __future__ import annotations

import html
import json
import os
from dataclasses import dataclass, field
from typing import Any

_DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
_CONFIG_PATH = os.path.join(_DATA_DIR, "company_feedback_config.json")

# pass/borderline/fail tone per round status (mirrors the config's badges)
_STATUS_TONE = {
    "cleared": ("pass", "Cleared"),
    "downgraded": ("borderline", "Cleared (below target)"),
    "eliminated": ("fail", "Eliminated"),
    "terminated": ("fail", "Terminated"),
}


def _load_config() -> dict[str, Any]:
    try:
        with open(_CONFIG_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {"sections": [], "mode": "company"}


# ═══════════════════════════════════════════════════════════════════════════════
# REPORT MODEL
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class ReportSection:
    order: int
    key: str
    label: str
    audience: str                       # "all" | "tpo"
    body: dict[str, Any] = field(default_factory=dict)

    def visible_to(self, audience: str) -> bool:
        return self.audience == "all" or audience == "tpo"

    def to_dict(self) -> dict[str, Any]:
        return {"order": self.order, "key": self.key, "label": self.label,
                "audience": self.audience, "body": self.body}


@dataclass
class CompanyReport:
    company_id: str
    display_name: str
    audience: str
    sections: list[ReportSection] = field(default_factory=list)
    meta: dict[str, Any] = field(default_factory=dict)

    def section(self, key: str) -> ReportSection | None:
        return next((s for s in self.sections if s.key == key), None)

    def visible_sections(self) -> list[ReportSection]:
        return [s for s in sorted(self.sections, key=lambda s: s.order)
                if s.visible_to(self.audience)]

    def to_dict(self) -> dict[str, Any]:
        return {
            "mode": "company",
            "company_id": self.company_id,
            "display_name": self.display_name,
            "audience": self.audience,
            "meta": self.meta,
            "sections": [s.to_dict() for s in self.visible_sections()],
        }

    # ── renderers ──────────────────────────────────────────────────────────────
    def render_text(self) -> str:
        return _render_text(self)

    def render_html(self) -> str:
        return _render_html(self)


# ═══════════════════════════════════════════════════════════════════════════════
# BUILD
# ═══════════════════════════════════════════════════════════════════════════════

def build_company_report(record: Any, blueprint: Any, *, audience: str = "student") -> CompanyReport:
    """Assemble the company-mode report from a walked session record.

    ``record`` is a ``CompanySessionRecord`` (duck-typed); ``blueprint`` its
    ``CompanyBlueprint``. ``audience`` is ``"student"`` or ``"tpo"``. Never raises.
    """
    audience = "tpo" if audience == "tpo" else "student"
    cfg = _load_config()
    labels = {s["key"]: s for s in cfg.get("sections", [])}

    def _sec(key: str, body: dict[str, Any]) -> ReportSection:
        meta = labels.get(key, {})
        return ReportSection(
            order=int(meta.get("order", 99)), key=key,
            label=str(meta.get("label", key.replace("_", " ").title())),
            audience=str(meta.get("audience", "all")), body=body,
        )

    sections = [
        _sec("company_headline", _headline_body(record, blueprint)),
        _sec("round_timeline", _timeline_body(record, audience)),
        _sec("track_prediction", _track_body(record)),
        _sec("attribute_breakdown", _attribute_body(record)),
        _sec("company_coaching", {"tips": company_coaching(record, blueprint)}),
        _sec("proctoring_detail", _proctoring_body(record)),
    ]

    return CompanyReport(
        company_id=record.company_id, display_name=record.display_name,
        audience=audience, sections=sections,
        meta={
            "target_track": record.target_track,
            "candidate": record.candidate,
            "format_confidence": record.format_confidence,
            "last_verified": record.last_verified,
            # below hand-verified fidelity (Tier-B ~0.6, low-fidelity Tier-A like
            # HCLTech ~0.45) → surface the "verify before your drive" banner
            "verify_banner": record.format_confidence < 0.7,
            "student_note": _student_integrity_note(record),
        },
    )


# ── section bodies ──────────────────────────────────────────────────────────────

def _terminal_state(record: Any) -> tuple[str, str]:
    if record.terminated_at:
        return "terminated", f"Session terminated at '{record.terminated_at}' (proctoring)."
    if record.eliminated_at:
        return "eliminated", f"Eliminated at '{record.eliminated_at}'."
    if record.completed:
        return "completed", "Sat the complete, gated process."
    return "incomplete", "Session did not finish."


def _headline_body(record: Any, blueprint: Any) -> dict[str, Any]:
    state, summary = _terminal_state(record)
    return {
        "company": record.display_name,
        "target_track": record.target_track,
        "predicted_track": record.predicted_track,
        "predicted_label": record.predicted_label,
        "verdict": record.verdict,
        "confidence": round(record.confidence, 2),
        "state": state,
        "summary": summary,
        "cleared_gate_count": len(record.cleared_gates),
        "failed_gate": record.failed_gate,
        "format_confidence": record.format_confidence,
        "last_verified": record.last_verified,
    }


def _timeline_body(record: Any, audience: str) -> dict[str, Any]:
    rounds: list[dict[str, Any]] = []
    for ro in record.rounds:
        tone, badge = _STATUS_TONE.get(ro.status, ("borderline", ro.status))
        ev = ro.result.evidence or {}
        # deciding metric per round
        metric = ""
        if ev.get("coding_items"):
            metric = f"solved {ev.get('solved', 0)}/{ev.get('coding_items')}"
        elif "verdict" in ev and ro.gate.gate_type in ("rubric", "veto", "committee"):
            metric = f"verdict: {str(ev.get('verdict', '-')).replace('_', ' ')}"
        elif "percentile" in ev:
            metric = f"~{ev.get('percentile')}th pct"
        nm = ro.negative_marking or {}
        entry = {
            "order": ro.order, "round_id": ro.round_id, "label": ro.label,
            "round_type": ro.round_type, "score_0_10": round(ro.result.score_0_10, 2),
            "status": ro.status, "tone": tone, "badge": badge, "metric": metric,
            "is_elimination": ro.is_elimination,
            "negative_marking": (f"neg-marking: {nm.get('model')}"
                                 if nm.get("enabled") and nm.get("sections") else ""),
        }
        # per-round proctor actions are TPO-only detail
        if audience == "tpo" and ro.proctor_actions:
            entry["proctor_actions"] = ro.proctor_actions
        rounds.append(entry)
    arrow = " -> ".join(f"{r['label'].split('—')[0].strip()[:22]}: {r['badge']}" for r in rounds)
    return {"rounds": rounds, "one_line": arrow}


def _track_body(record: Any) -> dict[str, Any]:
    outcome = record.outcome or {}
    cutoffs = []
    for te in outcome.get("track_evaluations", []):
        cutoffs.append({
            "track": te["track"], "label": te["label"], "met": te["met"],
            "cutoffs": [
                {"requirement": r["key"], "cleared": r["passed"],
                 "actual": r["actual"], "needed": r["needed"]}
                for r in te.get("requirements", [])
            ],
        })
    return {
        "predicted_track": record.predicted_track,
        "predicted_label": record.predicted_label,
        "confidence": round(record.confidence, 2),
        "next_track": record.next_track,
        "next_label": record.next_label,
        "gap_to_next_track": record.gap_to_next_track,
        "gap_hint": record.gap_hint,
        "cutoffs_by_track": cutoffs,
    }


def _attribute_body(record: Any) -> dict[str, Any]:
    attrs = record.attribute_breakdown or {}
    weakest = min(attrs, key=attrs.get) if attrs else None
    strongest = max(attrs, key=attrs.get) if attrs else None
    return {
        "attributes": {k: round(v, 1) for k, v in attrs.items()},
        "weakest": weakest, "strongest": strongest,
    }


def _proctoring_body(record: Any) -> dict[str, Any]:
    prc = dict(record.proctoring or {})
    prc["terminated_at"] = record.terminated_at
    return prc


def _student_integrity_note(record: Any) -> str | None:
    """Soft, non-accusatory note the STUDENT sees (never the raw flags)."""
    prc = record.proctoring or {}
    if record.terminated_at:
        return ("This attempt ended early under the company's proctoring policy "
                "(e.g. leaving the test window). On the real drive, stay in the test tab.")
    if prc.get("review_flags"):
        return "This session was flagged for review. No penalty was applied to your score."
    return None


# ═══════════════════════════════════════════════════════════════════════════════
# COMPANY-SPECIFIC COACHING  (real numbers from the round evidence)
# ═══════════════════════════════════════════════════════════════════════════════

def _round_by_type(record: Any, *types: str) -> Any:
    return next((ro for ro in record.rounds if ro.round_type in types), None)


def company_coaching(record: Any, blueprint: Any) -> list[str]:
    """Concrete, company-tuned coaching. Each tip carries the student's own number
    so it is actionable, not generic (Dossier Part 11)."""
    tips: list[str] = []
    cid = (record.company_id or "").lower()

    # Wipro voice — filler rate + WPM straight from the assessment
    voice = _round_by_type(record, "voice_assessment")
    if voice is not None:
        ev = voice.result.evidence or {}
        wpm, fpm = ev.get("wpm"), ev.get("filler_per_min")
        if wpm is not None and fpm is not None:
            pace = "steady" if 110 <= wpm <= 160 else ("too fast" if wpm > 160 else "too slow")
            tips.append(
                f"Voice: you spoke at {wpm} WPM ({pace}) with {fpm} filler words/min. "
                f"Aim for 120-150 WPM and under 3 fillers/min — record yourself and re-take.")

    # Amazon / Microsoft & any LP/behavioral company — measurable impact in stories.
    # Only invoke the Bar Raiser framing when the process actually has that round.
    has_bar = _round_by_type(record, "bar_raiser") is not None
    lp = _round_by_type(record, "bar_raiser", "behavioral_survey")
    if lp is not None:
        if has_bar:
            tips.append(
                "Leadership stories: add a measurable result and your specific role to 2 of your "
                "STAR/LP answers — the Bar Raiser escalates until the evidence runs out.")
        else:
            tips.append(
                "Behavioral survey: keep your most/least answers consistent and back each trait with "
                "a specific example — measurable impact reads stronger than adjectives.")

    # Cognizant — reach the max level in the leveling games
    game = _round_by_type(record, "game_based_aptitude")
    if game is not None:
        ev = game.result.evidence or {}
        games = ev.get("games", [])
        if games:
            worst = min(games, key=lambda g: g.get("max_level", 0))
            tips.append(
                f"Games: you reached level {worst.get('max_level')}/{worst.get('levels')} on "
                f"'{worst.get('game')}'. Score = max level reached — push one level higher "
                f"each attempt; accuracy and speed both count.")

    # Python-banned coding round (Capgemini) — drill C/C++/Java
    coding = _round_by_type(record, "coding_test", "advanced_coding")
    if coding is not None:
        ev = coding.result.evidence or {}
        if ev.get("python_banned"):
            tips.append(f"{record.display_name} bans Python in the coding round — practice the same "
                        f"problems in C, C++ or Java before the drive so syntax isn't the bottleneck.")

    # TCS — clean-solve advanced coding to reach Prime
    if cid == "tcs" and record.next_track == "prime":
        tips.append("TCS Prime needs a *clean* advanced-coding solve (all hidden tests) plus a "
                    "higher Advanced section percentile — drill DSA to full-marks, not partial.")

    # generic: the gap-to-next actions + the weakest attribute
    for action in (record.gap_to_next_track or [])[:2]:
        if action not in tips:
            tips.append(action)
    attrs = record.attribute_breakdown or {}
    if attrs:
        weakest = min(attrs, key=attrs.get)
        if attrs[weakest] < 60:
            tips.append(f"Weakest attribute: {weakest.replace('_', ' ')} "
                        f"({attrs[weakest]:.0f}/100) — target it first for the biggest gain.")

    # de-dup while preserving order
    seen: set[str] = set()
    out: list[str] = []
    for t in tips:
        if t not in seen:
            seen.add(t)
            out.append(t)
    return out


# ═══════════════════════════════════════════════════════════════════════════════
# TEXT RENDERER  (console proof)
# ═══════════════════════════════════════════════════════════════════════════════

_TONE_MARK = {"pass": "[PASS]", "borderline": "[~]", "fail": "[FAIL]"}


def _render_text(report: CompanyReport) -> str:
    L: list[str] = []
    m = report.meta
    L.append("=" * 70)
    L.append(f"COMPANY REPORT — {report.display_name}  ({report.audience.upper()} view)")
    L.append("=" * 70)

    head = report.section("company_headline").body
    L.append(f"Target: {m['target_track']}   Candidate: {m['candidate']}")
    if head["state"] == "completed":
        L.append(f"PREDICTED TRACK: {head['predicted_label'] or head['predicted_track']}  "
                 f"(confidence {head['confidence']:.2f})")
    else:
        L.append(f"RESULT: {head['summary']}")
    if head.get("verdict"):
        L.append(f"Verdict: {str(head['verdict']).replace('_', ' ')}")
    stamp = f"format_confidence={m['format_confidence']:.2f}  verified={m['last_verified']}"
    L.append(stamp + ("   ⚠ VERIFY BEFORE YOUR DRIVE" if m["verify_banner"] else ""))

    tl = report.section("round_timeline").body
    L.append("\nROUND TIMELINE")
    for r in tl["rounds"]:
        mark = _TONE_MARK.get(r["tone"], "[?]")
        extra = f"  {r['metric']}" if r["metric"] else ""
        nm = f"  ({r['negative_marking']})" if r["negative_marking"] else ""
        L.append(f"  R{r['order']} {r['label'][:40]:<40} {r['score_0_10']:>5}/10 "
                 f"{mark:<7}{extra}{nm}")
        if r.get("proctor_actions"):
            L.append(f"        proctor: {', '.join(r['proctor_actions'])}")

    tp = report.section("track_prediction").body
    if tp["next_track"]:
        L.append(f"\nGAP TO {tp['next_label'].upper()}")
        for g in tp["gap_to_next_track"]:
            L.append(f"  • {g}")
    elif tp.get("gap_hint"):
        L.append(f"\n{tp['gap_hint']}")

    ab = report.section("attribute_breakdown").body
    if ab["attributes"]:
        L.append("\nATTRIBUTE BREAKDOWN (0-100)")
        for k, v in ab["attributes"].items():
            bar = "█" * int(round(v / 5))
            flag = "  ← focus" if k == ab["weakest"] else ""
            L.append(f"  {k.replace('_', ' '):<28} {v:>5.0f}  {bar}{flag}")

    cc = report.section("company_coaching").body
    if cc["tips"]:
        L.append("\nCOMPANY-SPECIFIC COACHING")
        for t in cc["tips"]:
            L.append(f"  • {t}")

    # proctoring: TPO sees detail; student sees only a soft note
    if report.audience == "tpo":
        pb = report.section("proctoring_detail").body
        L.append("\nINTEGRITY & PROCTORING (TPO)")
        L.append(f"  policy={pb.get('policy')}  events={pb.get('total_events')}  "
                 f"review_flags={pb.get('review_flags')}  terminated_at={pb.get('terminated_at')}")
    else:
        note = report.meta.get("student_note")
        if note:
            L.append(f"\nNote: {note}")

    L.append("=" * 70)
    return "\n".join(L)


# ═══════════════════════════════════════════════════════════════════════════════
# HTML RENDERER  (self-contained round-timeline result view)
# ═══════════════════════════════════════════════════════════════════════════════

_TONE_COLOR = {"pass": "#1a7f37", "borderline": "#9a6700", "fail": "#b3261e"}


def _render_html(report: CompanyReport) -> str:
    def esc(x: Any) -> str:
        return html.escape(str(x))

    head = report.section("company_headline").body
    tl = report.section("round_timeline").body
    tp = report.section("track_prediction").body
    ab = report.section("attribute_breakdown").body
    cc = report.section("company_coaching").body

    rows = []
    for r in tl["rounds"]:
        color = _TONE_COLOR.get(r["tone"], "#57606a")
        rows.append(
            f"<tr><td>R{r['order']}</td><td>{esc(r['label'])}</td>"
            f"<td style='text-align:right'>{r['score_0_10']}/10</td>"
            f"<td><span style='color:{color};font-weight:600'>{esc(r['badge'])}</span></td>"
            f"<td>{esc(r['metric'])}</td></tr>")

    bars = []
    for k, v in ab["attributes"].items():
        focus = "border:2px solid #b3261e;" if k == ab["weakest"] else ""
        bars.append(
            f"<div style='margin:4px 0'><span style='display:inline-block;width:210px'>"
            f"{esc(k.replace('_',' '))}</span>"
            f"<span style='display:inline-block;width:220px;background:#eee;{focus}border-radius:4px'>"
            f"<span style='display:inline-block;height:14px;width:{max(2,int(v*2.1))}px;"
            f"background:#3b82f6;border-radius:4px'></span></span> {v:.0f}</div>")

    gap_items = "".join(f"<li>{esc(g)}</li>" for g in tp["gap_to_next_track"]) or \
        f"<li>{esc(tp.get('gap_hint',''))}</li>"
    tips = "".join(f"<li>{esc(t)}</li>" for t in cc["tips"])
    verify = ("<div style='background:#fff3cd;padding:8px;border-radius:6px;margin:8px 0'>"
              "⚠ Generic/low-confidence format — verify before your drive.</div>"
              if report.meta["verify_banner"] else "")
    predicted = (f"{esc(head['predicted_label'] or head['predicted_track'])} "
                 f"· confidence {head['confidence']:.2f}"
                 if head["state"] == "completed" else esc(head["summary"]))

    return f"""<section style="font-family:system-ui,sans-serif;max-width:760px;margin:auto;color:#1f2328">
  <h2 style="margin-bottom:2px">{esc(report.display_name)} — Company Simulation Report</h2>
  <div style="color:#57606a;font-size:13px">Target: {esc(report.meta['target_track'])} ·
     format confidence {report.meta['format_confidence']:.2f} · verified {esc(report.meta['last_verified'])}
     · <b>{esc(report.audience)}</b> view</div>
  {verify}
  <h3>Predicted Track</h3>
  <div style="font-size:18px;font-weight:700">{predicted}</div>
  <h3>Round Timeline</h3>
  <table style="border-collapse:collapse;width:100%;font-size:14px">
     <thead><tr style="text-align:left;border-bottom:1px solid #d0d7de">
       <th>#</th><th>Round</th><th style="text-align:right">Score</th><th>Result</th><th>Metric</th></tr></thead>
     <tbody>{''.join(rows)}</tbody></table>
  <h3>Gap to {esc(tp['next_label']) or 'top track'}</h3>
  <ul>{gap_items}</ul>
  <h3>Attribute Breakdown</h3>
  {''.join(bars)}
  <h3>Company-Specific Coaching</h3>
  <ul>{tips}</ul>
</section>"""


# ═══════════════════════════════════════════════════════════════════════════════
# DEMO / SELF-CHECK
# ═══════════════════════════════════════════════════════════════════════════════

def _demo() -> int:
    import sys
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass
    from app.services.company_sim.company_session import run_session
    from app.services.company_sim.loader import load_blueprint
    from app.services.company_sim.simulators import CandidateModel

    tcs = load_blueprint("tcs")
    strong = CandidateModel(name="Aisha", seed=7, default_ability=0.9,
                            ability={"aptitude_reasoning": 0.9, "coding": 0.85,
                                     "problem_solving": 0.88})
    rec = run_session(tcs, target_track="prime", candidate=strong)
    report = build_company_report(rec, tcs, audience="student")
    print(report.render_text())

    # quick invariants
    ok = True
    ok = ok and report.section("company_headline") is not None
    ok = ok and report.section("round_timeline").body["rounds"]
    ok = ok and report.section("proctoring_detail").audience == "tpo"
    student = build_company_report(rec, tcs, audience="student")
    tpo = build_company_report(rec, tcs, audience="tpo")
    ok = ok and not any(s.key == "proctoring_detail" for s in student.visible_sections())
    ok = ok and any(s.key == "proctoring_detail" for s in tpo.visible_sections())
    print("\nRESULT:", "PASS ✅" if ok else "FAIL ❌")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(_demo())
