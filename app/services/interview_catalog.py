"""Versioned, validated primary intents. Data lives outside orchestration code."""
from functools import lru_cache
from pathlib import Path
import json
import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator


FAMILIES = (
    "INTRODUCTION_AND_PERSONAL_PROFILE", "EDUCATION_AND_COLLEGE", "TECHNICAL_BACKGROUND",
    "AI_DATA_SCIENCE", "PROJECT", "INTERNSHIP", "CERTIFICATIONS_AND_COURSES",
    "COMPANY_AND_ROLE", "CAREER_GOALS", "STRENGTHS_AND_WEAKNESSES", "TEAMWORK",
    "LEADERSHIP", "PROBLEM_SOLVING_AND_DECISION_MAKING", "FAILURE_AND_MISTAKES",
    "PRESSURE_AND_STRESS", "COMMUNICATION", "ADAPTABILITY_AND_LEARNING", "AI_USAGE",
    "SITUATIONAL_JUDGMENT", "ETHICS_AND_INTEGRITY", "RESUME_CROSS_QUESTIONS", "BEHAVIORAL",
    "PLACEMENT_JOB_FLEXIBILITY", "SALARY", "OFFER_AND_COMMITMENT",
    "PERSONAL_BACKGROUND_SAFE_ONLY", "ENTREPRENEURIAL_STARTUP", "ACHIEVEMENTS",
    "SELF_AWARENESS", "UNEXPECTED_STRESS", "FINAL_CLOSING",
)


def safe_question(text: str) -> bool:
    # Conservative exclusion applies to catalog AND generated wording. No traits
    # are inferred from a resume or answer, including in pressure mode.
    return bool(text.strip()) and len(text) <= 650 and not re.search(
        r"religio|caste|sexual orientation|political affiliation|pregnan|marital|"
        r"marry|marriage|medical condition|disabilit|family (?:allow|income)|"
        r"ethnic|race\b|date of birth|ignore .*instructions|system prompt|<[^>]+>",
        text, re.I,
    )


class QuestionDefinition(BaseModel):
    id: str
    version: int = 1
    family: str
    subfamily: str = "general"
    question_type: Literal["PRIMARY", "SITUATIONAL", "CLOSING"] = "PRIMARY"
    text: str
    alternatives: list[str] = Field(default_factory=list)
    difficulty: Literal["basic", "medium", "difficult"] = "medium"
    eligible_roles: list[str] = Field(default_factory=list)
    eligible_departments: list[str] = Field(default_factory=list)
    experience_levels: list[str] = Field(default_factory=lambda: ["student", "fresher"])
    required_resume_signals: list[str] = Field(default_factory=list)
    optional_resume_signals: list[str] = Field(default_factory=list)
    competencies: list[str] = Field(default_factory=list)
    evidence_targets: list[str] = Field(default_factory=lambda: ["personal_action", "result"])
    followup_triggers: list[str] = Field(default_factory=lambda: ["ownership", "measurement", "outcome"])
    contraindications: list[str] = Field(default_factory=list)
    protected_attribute_risk: Literal["safe"] = "safe"
    expected_answer_shape: str = "Context, personal action, reasoning, result and reflection"
    estimated_answer_seconds: int = Field(default=60, ge=15, le=180)
    rubric_id: str = "evidence-v2"
    tags: list[str] = Field(default_factory=list)
    source: str = "transformation-brief-examples"
    status: Literal["enabled", "disabled"] = "enabled"

    @field_validator("family")
    @classmethod
    def known_family(cls, value: str) -> str:
        if value not in FAMILIES:
            raise ValueError("Unknown interview family")
        return value

    @field_validator("text")
    @classmethod
    def safe_text(cls, value: str) -> str:
        if not safe_question(value):
            raise ValueError("Unsafe question")
        return value

    @field_validator("alternatives")
    @classmethod
    def safe_alternatives(cls, value: list[str]) -> list[str]:
        if not all(safe_question(text) for text in value):
            raise ValueError("Unsafe question variant")
        return value


@lru_cache(maxsize=1)
def load_catalog() -> tuple[QuestionDefinition, ...]:
    data = json.loads((Path(__file__).parent / "data" / "interview_questions.json").read_text(encoding="utf-8"))
    questions = tuple(QuestionDefinition.model_validate(row) for row in data)
    if len({q.id for q in questions}) != len(questions):
        raise ValueError("Duplicate catalog question IDs")
    return questions
