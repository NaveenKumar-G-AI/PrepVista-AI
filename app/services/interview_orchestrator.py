"""Pure, server-authoritative breadth/depth policy. No network or database calls."""
from __future__ import annotations

from collections import Counter
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import re
from typing import Literal

from pydantic import BaseModel, Field

from app.services.interview_catalog import FAMILIES, load_catalog, safe_question

MODES = {
    "quick": (540, 7, 1, .25), "standard": (1080, 12, 2, .40),
    "full": (1800, 19, 3, .55), "hr": (1080, 12, 2, .40),
    "technical_hr": (1080, 12, 2, .40), "project_defense": (1200, 6, 3, 1.5),
    "behavioral": (1080, 12, 2, .40), "company_role": (1080, 12, 2, .40),
    "pressure": (1080, 12, 2, .40), "campus": (1800, 19, 3, .55),
    "custom": (1080, 12, 2, .40),
}

MODE_PRIORITY = {
    "standard": ["project", "technical", "ownership", "failure", "ai", "pressure", "teamwork", "role", "career", "problem", "resume", "ethics", "learning", "strength", "education", "achievement", "awareness"],
    "hr": ["project", "strength", "teamwork", "pressure", "role", "career", "learning", "ethics", "flexibility", "ownership"],
    "behavioral": ["ownership", "teamwork", "failure", "leadership", "pressure", "learning", "problem", "ethics", "achievement", "awareness"],
    "project_defense": ["project", "project-decision", "project-testing", "project-failure"],
    "company_role": ["role", "company", "project", "technical", "teamwork", "problem", "career", "ethics"],
    "pressure": ["pressure", "unexpected", "situation", "failure", "problem", "teamwork", "learning", "ethics"],
}

ROLE_QUESTIONS = (
    (r"backend|back.end", "How would you investigate a slow API endpoint, from the request through the database?"),
    (r"frontend|front.end", "How would you investigate a page that feels slow or is difficult to use with a keyboard?"),
    (r"full.stack", "How would you trace a failing user request across the frontend, API and database?"),
    (r"data analyst", "How would you check that a dataset and a reported business metric can be trusted?"),
    (r"data engineer", "How would you detect and recover from missing or duplicate records in a data pipeline?"),
    (r"data scien|machine learning|ai.ml|\bml\b", "How would you check whether a model evaluation is affected by data leakage?"),
    (r"genai|generative", "How would you test an application that relies on generated answers for factual errors?"),
    (r"cloud|devops", "How would you investigate a deployment that works locally but fails in its hosted environment?"),
    (r"cyber|security", "How would you investigate a suspicious access event without exposing sensitive data?"),
    (r"\bqa\b|test engineer", "How would you decide which tests are most valuable before a release?"),
    (r"embedded|\bece\b", "How would you debug a system where software interacts with a sensor or other hardware?"),
)

GAP_SIGNALS = {"ownership": "personal_action", "measurement": "measurement", "outcome": "result", "reasoning": "reasoning", "verification": "verification"}


class Blueprint(BaseModel):
    version: Literal[2] = 2
    mode: str
    duration_seconds: int
    target_role: str = "general technical fresher"
    target_company: str = ""
    job_description: str = ""
    department: str = ""
    candidate_level: str = "fresher"
    difficulty_policy: str = "auto"
    planned_ids: list[str]
    planned_families: list[str]
    required_competencies: list[str]
    target_primary_questions: int
    max_followups_total: int
    max_followups_per_anchor: int
    max_questions: int
    plan_limited: bool


class AnswerEvidence(BaseModel):
    status: Literal["EARLY_SIGNAL", "INSUFFICIENT_EVIDENCE"]
    signals: list[str] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)
    evidence_quotes: list[str] = Field(default_factory=list)
    confidence: Literal["limited", "moderate"] = "limited"
    evaluator_source: str = "deterministic-text-signals-v2"
    content: str = "More evidence is needed."
    delivery: str = "Audio delivery is not assessed by text evidence."


def signature(text: str) -> str:
    return hashlib.sha256(re.sub(r"\W+", " ", text.lower()).strip().encode()).hexdigest()[:20]


def profile_signals(profile: dict) -> set[str]:
    return {key for key, value in profile.items() if isinstance(value, (str, list, dict)) and value}


def build_blueprint(profile: dict, *, mode: str = "standard", duration: int = 1080,
                    max_questions: int = 24, difficulty: str = "auto", categories: list[str] | None = None) -> Blueprint:
    if mode not in MODES:
        raise ValueError("Unknown interview mode")
    if categories and any(f not in FAMILIES for f in categories):
        raise ValueError("Unknown interview category")
    _, requested_primary, depth, ratio = MODES[mode]
    duration = max(60, min(duration, 2100 if mode in {"full", "campus"} else 1800))
    if mode == "quick":
        duration = min(duration, 600)
    max_questions = max(2, max_questions)
    target = min(requested_primary, max(2, int(max_questions / (1 + ratio))), max(2, duration // 65))
    signals = profile_signals(profile)
    role = str(profile.get("target_role") or "general technical fresher")[:120]
    priority = MODE_PRIORITY.get(mode, MODE_PRIORITY["standard"])
    catalog = list(load_catalog())
    eligible = []
    for q in catalog:
        if q.status != "enabled" or any(s not in signals for s in q.required_resume_signals):
            continue
        if "offer_stage" in q.tags and not (mode in {"hr", "company_role", "custom"} and profile.get("offer_stage")):
            continue
        if "ml" in q.tags and not re.search(r"\b(?:ai|ml|data|aiml|aids)\b", role + " " + str(profile.get("department", "")), re.I):
            continue
        if "project_defense" in q.tags and mode != "project_defense":
            continue
        if mode == "project_defense" and q.id not in ["intro", "closing", *priority]:
            continue
        if mode == "custom" and categories and q.family not in categories and q.id not in {"intro", "closing"}:
            continue
        eligible.append(q)
    middle = [q for q in eligible if q.id not in {"intro", "closing"}]
    # Coverage first; role-specific ML and supplied company context receive priority.
    middle.sort(key=lambda q: (-1 if q.id == "ml" else priority.index(q.id) if q.id in priority else 100, q.id))
    chosen, families = [], set()
    for q in middle:
        if mode != "project_defense" and q.family in families:
            continue
        chosen.append(q)
        families.add(q.family)
        if len(chosen) >= target - 2:
            break
    questions = [next(q for q in catalog if q.id == "intro"), *chosen[:max(0, target - 2)], next(q for q in catalog if q.id == "closing")]
    target = len(questions)
    followups = min(max_questions - target, int(target * ratio))
    return Blueprint(
        mode=mode, duration_seconds=duration, target_role=role,
        target_company=str(profile.get("target_company") or "")[:120],
        job_description=str(profile.get("job_description") or "")[:8000],
        department=str(profile.get("department") or "")[:120], difficulty_policy=difficulty,
        planned_ids=[q.id for q in questions], planned_families=[q.family for q in questions],
        required_competencies=sorted({c for q in questions for c in q.competencies}),
        target_primary_questions=target, max_followups_total=followups,
        max_followups_per_anchor=depth, max_questions=target + followups,
        plan_limited=target < requested_primary,
    )


class EvidenceLedger:
    @staticmethod
    def analyze(answer: str, family: str) -> AnswerEvidence:
        text = answer.strip()
        if len(text.split()) < 4 or re.search(r"^(?:i (?:don'?t know|am not sure)|no idea|skip)[.! ]*$", text, re.I):
            return AnswerEvidence(status="INSUFFICIENT_EVIDENCE")
        patterns = {
            "personal_action": r"\bI (?:personally |specifically )?(?:built|implemented|tested|wrote|chose|decided|changed|fixed|designed|checked|verified|asked|organized|organised|explained|helped|learned|used|took|compared)\b",
            "reasoning": r"\b(?:because|therefore|instead|trade.?off|so that|in order to)\b",
            "result": r"\b(?:result|reduced|improved|resolved|passed|failed|learned|feedback|completed|increased)\b",
            "measurement": r"\b(?:measured|benchmark|compared|before|after|test results|latency|percent)\b|\d+\s*(?:%|ms|seconds|users|tests)",
            "verification": r"\b(?:tests?|tested|verify|verified|reviewed|checked|validate|validated)\b",
            "reflection": r"\b(?:learned|next time|limitation|would improve)\b",
        }
        signals = [name for name, pattern in patterns.items() if re.search(pattern, text, re.I)]
        gaps = []
        if re.search(r"\b(?:we|our team)\b", text, re.I) and "personal_action" not in signals:
            gaps.append("ownership")
        if re.search(r"\b(?:improved|increased|reduced|faster|significantly)\b", text, re.I) and "measurement" not in signals:
            gaps.append("measurement")
        if family == "AI_USAGE" and re.search(r"\b(?:AI|ChatGPT|Copilot|generated code)\b", text, re.I) and "verification" not in signals and not re.search(r"(?:do not|don't|never) use", text, re.I):
            gaps.append("verification")
        if family in {"BEHAVIORAL", "TEAMWORK", "FAILURE_AND_MISTAKES", "PRESSURE_AND_STRESS", "LEADERSHIP"}:
            if "personal_action" not in signals and "ownership" not in gaps:
                gaps.append("ownership")
            if "result" not in signals:
                gaps.append("outcome")
        if family in {"PROJECT", "TECHNICAL_BACKGROUND", "AI_DATA_SCIENCE"} and "reasoning" not in signals and len(text.split()) < 35:
            gaps.append("reasoning")
        return AnswerEvidence(
            status="EARLY_SIGNAL" if signals else "INSUFFICIENT_EVIDENCE",
            signals=signals, gaps=gaps, evidence_quotes=[text[:500]],
            confidence="moderate" if len(signals) >= 3 else "limited",
            content="This answer contains specific textual signals; correctness and global capability are not established." if signals else "More evidence is needed.",
        )

    @staticmethod
    def append(state: dict, question: dict, answer: str, analysis: AnswerEvidence) -> None:
        if any(e["question_id"] == question["id"] for e in state["evidence"]):
            return
        state["evidence"].append({
            "evidence_id": f"e-{question['id']}", "question_id": question["id"],
            "anchor_question_id": question["anchor_id"], "family": question["family"],
            "competencies": question["competencies"], "excerpt": answer[:3000],
            "timestamp": datetime.now(timezone.utc).isoformat(), **analysis.model_dump(),
        })


class CoverageTracker:
    @staticmethod
    def snapshot(state: dict) -> dict:
        result = {f: {"asked": 0, "answered": 0, "state": "UNMEASURED", "evidence_ids": []} for f in state["blueprint"]["planned_families"]}
        for q in state["questions"]:
            result[q["family"]]["asked"] += 1
        for e in state["evidence"]:
            row = result[e["family"]]
            row["answered"] += 1
            row["evidence_ids"].append(e["evidence_id"])
            if e["status"] == "EARLY_SIGNAL":
                row["state"] = "EARLY_SIGNAL"
            elif row["state"] == "UNMEASURED":
                row["state"] = "INSUFFICIENT_EVIDENCE"
        return result


class TimeBudgetManager:
    @staticmethod
    def can_probe(state: dict, remaining_seconds: int) -> bool:
        remaining_primaries = state["blueprint"]["target_primary_questions"] - len(state["anchors"])
        return remaining_seconds >= remaining_primaries * 45 + 45


class DifficultyController:
    @staticmethod
    def select(policy: str, analysis: AnswerEvidence | None) -> str:
        if policy != "auto":
            return policy
        return "difficult" if analysis and len(analysis.signals) >= 4 else "medium" if analysis and analysis.signals else "basic"


class FollowUpController:
    @staticmethod
    def decide(state: dict, analysis: AnswerEvidence, remaining_seconds: int) -> tuple[str | None, str]:
        anchor = state["anchors"][-1]
        bp = state["blueprint"]
        if not analysis.evidence_quotes:
            return None, "NO_MORE_VALUE"
        if anchor["followups_used"] >= bp["max_followups_per_anchor"] or state["followups_used"] >= bp["max_followups_total"]:
            return None, "FOLLOWUP_LIMIT_REACHED"
        if not TimeBudgetManager.can_probe(state, remaining_seconds):
            return None, "TIME_BUDGET"
        gaps = anchor["open_gaps"]
        if not gaps:
            return None, "ENOUGH_EVIDENCE" if analysis.signals else "NO_MORE_VALUE"
        gap = next((g for g in gaps if g not in anchor["probed_gaps"]), None)
        return (gap, "MISSING_EVIDENCE") if gap else (None, "NO_MORE_VALUE")

    @staticmethod
    def question(gap: str, answer: str) -> str:
        # Every probe has its actual answer excerpt attached in the instance.
        return {
            "ownership": "You described the team's work. What did you personally decide or implement?" if re.search(r"\b(?:we|our team)\b", answer, re.I) else "What did you personally do in the situation you described?",
            "measurement": "You mentioned an improvement. How did you measure the before and after result?",
            "verification": "How do you verify AI-generated output before keeping it?",
            "outcome": "What happened as a result of the actions you described?",
            "reasoning": "What exactly did you cache, and how did you handle stale data?" if re.search(r"\bRedis\b", answer, re.I) else "Why did you choose the approach you described over an alternative?",
        }[gap]


class PrimaryQuestionPlanner:
    @staticmethod
    def select(state: dict, remaining_seconds: int):
        asked = {a["primary_question_id"] for a in state["anchors"]}
        candidates = [q for q in load_catalog() if q.id in state["blueprint"]["planned_ids"] and q.id not in asked]
        if not candidates:
            return None
        if not asked:
            return next(q for q in candidates if q.id == "intro")
        if remaining_seconds <= 60:
            return next((q for q in candidates if q.id == "closing"), None)
        # Strict breadth slots, then stable blueprint order. Never consumes a
        # primary slot for a follow-up, unlike the legacy turn-index planner.
        candidates.sort(key=lambda q: state["blueprint"]["planned_ids"].index(q.id))
        return candidates[0]


class InterviewOrchestrator:
    @staticmethod
    def create(blueprint: Blueprint, profile: dict, recent_questions: list[str] | None = None) -> dict:
        skills = profile.get("skills", [])
        claims = [{"claim_id": f"skill-{i}", "claim_text": s[:120], "claim_type": "skill", "source_section": "skills", "verification_status": "UNTESTED", "evidence_ids": []}
                  for i, s in enumerate(skills if isinstance(skills, list) else []) if isinstance(s, str) and s.strip()]
        return {"version": 2, "phase": "BLUEPRINT_READY", "blueprint": blueprint.model_dump(),
                "anchors": [], "questions": [], "evidence": [], "followups_used": 0,
                "recent_signatures": [signature(q) for q in (recent_questions or []) if isinstance(q, str)],
                "profile_signals": sorted(profile_signals(profile)),
                "resume_claims": claims, "clarifications": 0, "silence_retries": 0,
                "mission_id": profile.get('mission_id'),
                "artifact_context": profile.get('coding_artifact') if isinstance(profile.get('coding_artifact'), dict) else None}

    @staticmethod
    def advance(stored: dict, answer: str = "", *, remaining_seconds: int,
                event: str = "answer", finish: bool = False) -> tuple[dict, dict | None]:
        state = deepcopy(stored)
        current = state["questions"][-1] if state["questions"] else None
        if state["phase"] in {"FINISHING", "COMPLETED"}:
            return state, None
        if current and event in {"clarify", "silence", "transcript_failure", "current"} and not finish and remaining_seconds > 0:
            if event != "current":
                key = "clarifications" if event == "clarify" else "silence_retries"
                state[key] += 1
            state["phase"] = "CLOSING" if current["type"] == "CLOSING" else "AWAITING_ANSWER"
            return state, current
        analysis = None
        if current and event == "answer" and answer.strip():
            analysis = EvidenceLedger.analyze(answer, current["family"])
            EvidenceLedger.append(state, current, answer, analysis)
            anchor = state["anchors"][-1]
            anchor["evidence_obtained"] = sorted(set(anchor["evidence_obtained"] + analysis.signals))
            anchor["open_gaps"] = [gap for gap in dict.fromkeys(anchor["open_gaps"] + analysis.gaps)
                                   if GAP_SIGNALS[gap] not in anchor["evidence_obtained"]]
            for claim in state["resume_claims"]:
                if re.search(r"(?<!\w)" + re.escape(claim["claim_text"]) + r"(?!\w)", answer, re.I):
                    claim["verification_status"] = "PARTIALLY_SUPPORTED" if "personal_action" in analysis.signals else "UNCLEAR"
                    claim["evidence_ids"].append(state["evidence"][-1]["evidence_id"])
        if finish or remaining_seconds <= 0 or (current and current["type"] == "CLOSING"):
            if state["anchors"]:
                state["anchors"][-1]["closed_reason"] = "TIME_BUDGET" if remaining_seconds <= 0 else "EARLY_FINISH" if finish else "ENOUGH_EVIDENCE"
            state["phase"] = "FINISHING"
            return state, None
        if current:
            state["phase"] = "FOLLOWUP_DECISION"
            allowed = current["family"] not in {"INTRODUCTION_AND_PERSONAL_PROFILE", "CAREER_GOALS", "FINAL_CLOSING", "COMMUNICATION", "PLACEMENT_JOB_FLEXIBILITY", "SALARY", "OFFER_AND_COMMITMENT"}
            gap, reason = FollowUpController.decide(state, analysis, remaining_seconds) if allowed and analysis and event == "answer" else (None, "CANDIDATE_SKIPPED" if event == "skip" else "NO_MORE_VALUE")
            if gap:
                wording = FollowUpController.question(gap, answer)
                if any(signature(q["text"]) == signature(wording) for q in state["questions"]):
                    gap, reason = None, "NO_MORE_VALUE"
            if gap:
                anchor = state["anchors"][-1]
                anchor["followups_used"] += 1
                anchor["probed_gaps"].append(gap)
                state["followups_used"] += 1
                question = {**current, "id": f"q-{len(state['questions']) + 1}", "type": "FOLLOWUP",
                            "text": wording, "grounded_in": {"answer_excerpt": answer[:500]},
                            "reason_for_asking": gap, "expected_evidence": [gap],
                            "difficulty": DifficultyController.select(state["blueprint"]["difficulty_policy"], analysis)}
                state["questions"].append(question)
                state["phase"] = "AWAITING_ANSWER"
                return state, question
            state["anchors"][-1]["closed_reason"] = reason
            state["anchors"][-1]["depth_satisfied"] = reason == "ENOUGH_EVIDENCE"
        state["phase"] = "ADVANCING_FAMILY"
        definition = PrimaryQuestionPlanner.select(state, remaining_seconds)
        if definition is None:
            state["phase"] = "FINISHING"
            return state, None
        options = [definition.text, *definition.alternatives]
        if definition.id == "technical":
            contextual = next((question for pattern, question in ROLE_QUESTIONS if re.search(pattern, state["blueprint"]["target_role"], re.I)), None)
            if contextual:
                options.insert(0, contextual)
        text = next((s for s in options if signature(s) not in state["recent_signatures"]), options[0])
        if definition.id == "project" and "projects" not in state.get("profile_signals", []):
            text = "Tell me about a practical assignment or problem you worked on and the part you personally handled."
        artifact = state.get('artifact_context')
        if artifact and definition.id in {'project', 'project-decision', 'project-testing', 'project-failure'}:
            match = re.search(r'\b(?:function|def|class)\s+([A-Za-z_][A-Za-z_0-9]{0,60})', artifact.get('code', ''))
            subject = f"your {match.group(1)} implementation" if match else 'your saved coding artifact'
            text = {
                'project': f"Walk me through {subject}. What did you personally implement, and what is still incomplete?",
                'project-decision': f"In {subject}, why did you choose this approach over an alternative?",
                'project-testing': f"How did you test {subject}, and which edge case could still fail?",
                'project-failure': f"Describe a failure or limitation in {subject}. How would you reproduce and repair it?",
            }[definition.id]
        if definition.id == "resume" and state["resume_claims"]:
            skill = state["resume_claims"][0]["claim_text"]
            contextual = f"You listed {skill}. Where have you used it and what did you personally implement?"
            if safe_question(contextual):
                text = contextual
        if definition.id == "role" and state["blueprint"]["target_company"]:
            company_question = f"What attracts you to the {state['blueprint']['target_role']} opportunity at {state['blueprint']['target_company']}, based on information you have researched?"
            if safe_question(company_question):
                text = company_question
        if definition.id == "role" and state["blueprint"]["job_description"]:
            text = "Which responsibility in the job description you provided best matches your experience, and what evidence supports that match?"
        question_id = f"q-{len(state['questions']) + 1}"
        state["anchors"].append({"anchor_question_id": question_id, "primary_question_id": definition.id,
            "family": definition.family, "followups_used": 0, "max_followups": state["blueprint"]["max_followups_per_anchor"],
            "evidence_targets": definition.evidence_targets, "evidence_obtained": [], "open_gaps": [],
            "probed_gaps": [], "depth_satisfied": False, "closed_reason": None})
        question = {"id": question_id, "definition_id": definition.id, "version": definition.version,
            "anchor_id": question_id, "family": definition.family, "type": definition.question_type,
            "text": text, "competencies": definition.competencies, "expected_evidence": definition.evidence_targets,
            "difficulty": DifficultyController.select(state["blueprint"]["difficulty_policy"], analysis),
            "grounded_in": ({"coding_artifact_id": artifact.get('id'), "authority": artifact.get('authority', 'CLIENT_REPORTED')}
                if artifact and definition.id in {'project', 'project-decision', 'project-testing', 'project-failure'} else {}),
            "reason_for_asking": "planned_coverage"}
        state["questions"].append(question)
        state["phase"] = "CLOSING" if question["type"] == "CLOSING" else "AWAITING_ANSWER"
        return state, question


def evidence_report(state: dict) -> dict:
    coverage = CoverageTracker.snapshot(state)
    gaps = [(e, gap) for e in state["evidence"] for gap in e["gaps"]]
    # Report unresolved gaps on the whole anchor, not a weakness repaired by a probe.
    open_gaps = {a["anchor_question_id"]: a["open_gaps"] for a in state["anchors"]}
    risks, seen = [], set()
    for evidence, gap in reversed(gaps):
        key = (evidence["anchor_question_id"], gap)
        if gap not in open_gaps[key[0]] or key in seen:
            continue
        seen.add(key)
        risks.append({"gap": gap, "question_id": evidence["question_id"], "evidence_id": evidence["evidence_id"], "excerpt": evidence["excerpt"][:240]})
    questions = {q["id"]: q for q in state["questions"]}
    missions = [{"id": f"mission-{i + 1}", "question_id": r["question_id"], "family": questions[r["question_id"]]["family"],
                 "question": questions[r["question_id"]]["text"], "gap": r["gap"], "evidence_id": r["evidence_id"],
                 "instruction": f"Add your actual {r['gap']} evidence. Do not invent experience or measurements."} for i, r in enumerate(risks[:3])]
    return {"version": 2, "blueprint": state["blueprint"], "coverage": coverage,
        "evidence_state": "DEVELOPING" if any(e["signals"] for e in state["evidence"]) else "INSUFFICIENT",
        "confidence": "limited", "evidence": state["evidence"], "questions": state["questions"],
        "resume_claims": state["resume_claims"], "top_risks": risks[:3], "missions": missions,
        "unmeasured": [f for f, c in coverage.items() if not c["answered"]],
        "not_planned": [f for f in FAMILIES if f not in coverage],
        "content_note": "Textual signals are coaching evidence, not verification of technical correctness or hiring readiness.",
        "delivery_note": "Accent, personality and audio delivery are not inferred from transcripts.",
        "primary_count": len(state["anchors"]), "followup_count": state["followups_used"],
        "partial": not bool(state["questions"] and state["questions"][-1]["type"] == "CLOSING" and any(e["question_id"] == state["questions"][-1]["id"] for e in state["evidence"]))}
