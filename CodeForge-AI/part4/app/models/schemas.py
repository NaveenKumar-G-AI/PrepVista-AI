from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Confidence = Literal["LOW", "MEDIUM", "HIGH"]
Strength = Literal["LOW", "MEDIUM", "HIGH"]

MISTAKE_TAXONOMY = {
    "OFF_BY_ONE", "WRONG_LOOP_CONDITION", "WRONG_DATA_STRUCTURE", "WRONG_ALGORITHM",
    "LOGIC_ERROR", "BOUNDARY_ERROR", "EDGE_CASE_FAILURE", "INPUT_HANDLING",
    "STATE_MANAGEMENT", "TYPE_ERROR", "NULL_HANDLING", "RUNTIME_ERROR",
    "COMPILATION_ERROR", "COMPLEXITY_FAILURE", "PERFORMANCE_FAILURE",
    "API_ERROR", "ASYNC_ERROR", "UNKNOWN",
}

FAILURE_CATEGORIES = {
    "COMPILATION", "RUNTIME", "LOGIC", "BOUNDARY", "EDGE_CASE", "INPUT_HANDLING",
    "STATE", "ALGORITHM", "COMPLEXITY", "TIMEOUT", "MEMORY", "UNKNOWN",
}


class SubmitAttemptRequest(BaseModel):
    challenge_id: str
    challenge_version: int = 1
    language: Literal["python"] = "python"
    source_code: str = Field(min_length=1, max_length=50_000)
    explanation_text: str | None = None
    hint_count: int = 0
    hint_level: int = 0
    client_request_id: str = Field(min_length=1, max_length=128)
    feedback_level: Literal["QUICK", "STANDARD", "DETAILED", "DEEP"] = "STANDARD"


class CaseOutcome(BaseModel):
    test_id: str
    is_hidden: bool
    passed: bool
    status: str
    runtime_ms: float | None = None
    memory_kb: float | None = None
    expected_result: str | None = None   # withheld for hidden tests in API responses
    actual_result: str | None = None
    failure_category: str | None = None


class DeterministicEvaluation(BaseModel):
    status: Literal["PASSED", "FAILED", "SYSTEM_ERROR"]
    tests_total: int
    tests_passed: int
    tests_failed: int
    runtime_ms_max: float | None = None
    memory_kb_max: float | None = None
    outcomes: list[CaseOutcome]


class CodeAnalysis(BaseModel):
    function_count: int
    max_nesting_depth: int
    cyclomatic_estimate: int
    duplicate_blocks: int
    unused_names: list[str]
    loc: int
    patterns: list[str]


class ComplexityEstimate(BaseModel):
    time_complexity: str | None
    time_basis: Literal["OBSERVED", "INFERRED", "ESTIMATED"]
    space_complexity: str | None
    space_basis: Literal["OBSERVED", "INFERRED", "ESTIMATED"]
    reasoning: str


class MistakeInstance(BaseModel):
    category: str
    evidence: str
    confidence: Confidence
    severity: Literal["LOW", "MEDIUM", "HIGH"]


class AIStructuredDiagnosis(BaseModel):
    """Schema every diagnosis-producing AI call must conform to (Phase 11)."""
    observations: list[str] = Field(default_factory=list)
    inferences: list[str] = Field(default_factory=list)
    mistakes: list[MistakeInstance] = Field(default_factory=list)
    strengths: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    confidence: Confidence = "MEDIUM"


class AIFeedback(BaseModel):
    what_went_well: str
    what_failed: str
    why_it_failed: str
    what_to_improve: str
    optional_hint: str | None = None
    next_step: str


class ExplanationEvaluation(BaseModel):
    conceptual_understanding: Confidence  # reuses LOW/MEDIUM/HIGH scale
    consistency_with_code: str
    algorithm_reasoning_notes: str


class ComplexityAIRefinement(BaseModel):
    time_complexity: str | None = None
    space_complexity: str | None = None
    reasoning: str
    confident: bool = False


class DevTokenRequest(BaseModel):
    """Dev-only convenience endpoint request — see app/auth.py and the
    /dev/token route in main.py for why this must never exist in a real
    deployment."""
    subject_id: str = Field(min_length=1, max_length=128)
    role: Literal["student", "staff"] = "student"
