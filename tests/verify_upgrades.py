"""Standalone verification script for interviewer upgrades.
Tests the pure functions without requiring asyncpg or other database dependencies.
Run with: python tests/verify_upgrades.py
"""
import sys
import os
sys.stdout.reconfigure(encoding='utf-8')

# Ensure project root is in sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Monkey-patch modules that require unavailable database drivers
import types
for mod_name in [
    "asyncpg", "structlog", "app.database", "app.database.connection",
    "app.services.llm", "app.services.interview_summary",
    "app.services.resume_parser", "app.services.transcript",
    "app.services.evaluator", "app.services.analytics",
    "app.services.history_retention", "app.services.plan_access",
]:
    if mod_name not in sys.modules:
        sys.modules[mod_name] = types.ModuleType(mod_name)

# Provide stubs for required attributes
sys.modules["structlog"].get_logger = lambda *a, **k: type("L", (), {"info": lambda *a, **k: None, "warning": lambda *a, **k: None, "error": lambda *a, **k: None, "debug": lambda *a, **k: None})()

# Stub DatabaseConnection
class FakeConn:
    async def __aenter__(self): return self
    async def __aexit__(self, *a): pass
sys.modules["app.database.connection"].DatabaseConnection = FakeConn

# Stub transcript functions
sys.modules["app.services.transcript"].normalize_transcript = lambda t, aggressive=False: t or ""
sys.modules["app.services.transcript"].clean_for_display = lambda t: t or ""

# Stub resume parser
sys.modules["app.services.resume_parser"].sanitize_resume_text = lambda t: t or ""
sys.modules["app.services.resume_parser"].parse_resume_text = lambda *a, **k: {}
sys.modules["app.services.resume_parser"].infer_resume_field_profile = lambda *a, **k: {}

# Stub interview summary
for attr in [
    "TURN_OUTCOME_ANSWERED", "TURN_OUTCOME_CLARIFICATION", "TURN_OUTCOME_EXITED", "TURN_OUTCOME_SYSTEM_CUTOFF", "TURN_OUTCOME_TIMEOUT",
    "TURN_STATE_ACTIVE_QUESTION_OPEN", "TURN_STATE_ANSWER_RECORDED", "TURN_STATE_QUESTION_CLOSED", "TURN_STATE_WAITING_CLARIFICATION"
]:
    setattr(sys.modules["app.services.interview_summary"], attr, attr)
sys.modules["app.services.interview_summary"].coerce_runtime_state = lambda *a, **k: {}
sys.modules["app.services.interview_summary"].compute_interview_summary = lambda *a, **k: {}
sys.modules["app.services.interview_summary"].normalize_rubric_category = lambda *a, **k: ""

# Stub LLM functions
sys.modules["app.services.llm"].call_llm_json = lambda *a, **k: {}
sys.modules["app.services.llm"].call_llm_text = lambda *a, **k: ""
sys.modules["app.services.llm"].call_llm = lambda *a, **k: ""

# Now import the functions we want to test
from app.services.prompts import QUESTION_PREAMBLE_TEMPLATES
from app.services.interviewer import (
    _build_question_preamble,
    _question_template_for_category,
    _build_pro_followup_question,
)

PASSED = 0
FAILED = 0

def check(name: str, condition: bool, detail: str = ""):
    global PASSED, FAILED
    if condition:
        PASSED += 1
        print(f"  PASS: {name}")
    else:
        FAILED += 1
        print(f"  FAIL: {name} - {detail}")


print("\n=== Test 1: Preamble templates exist for all plans and families ===")
for plan_name in ["free", "pro", "career"]:
    templates = QUESTION_PREAMBLE_TEMPLATES.get(plan_name, {})
    check(f"  {plan_name} plan has templates", len(templates) > 0, f"got {len(templates)} families")
    for family_name, options in templates.items():
        check(
            f"  {plan_name}/{family_name} has ≥1 option",
            len(options) >= 1 and all(isinstance(o, str) and len(o) > 5 for o in options),
            f"got {options}",
        )


print("\n=== Test 2: _build_question_preamble returns context for new topics ===")
for plan_name in ["free", "pro", "career"]:
    for category in ["introduction", "ownership", "tradeoff_decision", "role_fit", "closeout"]:
        if plan_name == "free" and category == "tradeoff_decision":
            continue
        result = _build_question_preamble(plan=plan_name, category=category, variant_seed=0)
        check(
            f"  {plan_name}/{category} preamble is non-empty",
            isinstance(result, str) and len(result) > 5,
            f"got '{result}'",
        )


print("\n=== Test 3: Preamble is empty for follow-ups and retries ===")
for is_followup, is_retry, label in [(True, False, "followup"), (False, True, "retry")]:
    result = _build_question_preamble(
        plan="pro",
        category="ownership",
        is_followup=is_followup,
        is_retry=is_retry,
    )
    check(f"  preamble empty for {label}", result == "", f"got '{result}'")


print("\n=== Test 4: HR-style templates cover hire/weakness/future ===")
# Role fit — hire
q = _question_template_for_category("role_fit", "hire you", 0, "career")
check("role_fit/hire contains 'hire' or 'panel'", any(t in q.lower() for t in ["hir", "pick", "panel"]), f"got '{q}'")

# Learning growth — weakness
q = _question_template_for_category("learning_growth", "weakness", 0, "pro")
check("learning_growth/weakness contains weakness/growth", any(t in q.lower() for t in ["weakness", "growth", "improving"]), f"got '{q}'")

# Closeout — future
q = _question_template_for_category("closeout", "five years", 0, "career")
check("closeout/future contains 'years/grow'", any(t in q.lower() for t in ["years", "grow", "direction"]), f"got '{q}'")

# Teamwork — conflict
q = _question_template_for_category("teamwork_pressure", "conflict", 0, "pro")
check("teamwork_pressure/conflict contains conflict/disagree/feedback", any(t in q.lower() for t in ["conflict", "disagree", "feedback", "align"]), f"got '{q}'")


print("\n=== Test 5: Pro follow-up drills into metric claims ===")
# When user says "reduced latency by 40%", follow-up should anchor to it
q = _build_pro_followup_question(
    "Tell me about your background",
    "I reduced latency by 40% using caching and async processing",
)
check(
    "Pro follow-up mentions 'reduced' or 'changed' or 'measure'",
    any(t in q.lower() for t in ["reduced", "changed", "measure", "impact", "walk"]),
    f"got '{q}'",
)

# When user mentions ownership explicitly
q = _build_pro_followup_question(
    "What did you work on?",
    "I owned the entire backend pipeline including deployment and monitoring",
)
check(
    "Pro follow-up drills into ownership",
    any(t in q.lower() for t in ["build", "change", "own", "personally"]),
    f"got '{q}'",
)


print("\n=== Test 6: New follow-up families (validation_metrics, tradeoff_decision) ===")
# validation_metrics follow-up
q = _build_pro_followup_question(
    "How did you validate that the result really improved?",
    "I compared accuracy metrics before and after the change",
)
check(
    "validation_metrics follow-up is non-empty",
    len(q) > 0,
    f"got '{q}'",
)

# tradeoff_decision follow-up
q = _build_pro_followup_question(
    "What trade-off did you make, and why?",
    "I chose speed over accuracy because real-time response mattered more for user experience",
)
check(
    "tradeoff_decision follow-up is non-empty",
    len(q) > 0,
    f"got '{q}'",
)

print(f"\n{'=' * 50}")
print(f"Results: {PASSED} passed, {FAILED} failed")
if FAILED:
    print("WARNING: Some tests failed!")
    sys.exit(1)
else:
    print("ALL TESTS PASSED!")
    sys.exit(0)
