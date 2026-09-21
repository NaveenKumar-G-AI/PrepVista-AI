import sys, os, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from complexity_engine.resolver import analyze
from complexity_engine.ai.contract import parse_and_validate, InvalidAIResponse
from complexity_engine.ai.explain import explain

VALID = {
    "summary": "This solution is quadratic.",
    "time_explanation": "Two nested loops each scale with n.",
    "space_explanation": "Only a counter is kept, so O(1) auxiliary space.",
    "dominant_cost": "nested comparison",
    "constraint_assessment": "Fine for small n, risky near the stated maximum.",
    "optimization_opportunities": ["consider a hash-based approach to drop one loop"],
    "confidence": "HIGH",
}


def _report():
    src = "def f(n):\n    c=0\n    for i in range(n):\n        for j in range(n):\n            c+=1\n    return c\n"
    return analyze(src, language="python"), src


def test_valid_response_parses():
    r = parse_and_validate(json.dumps(VALID))
    assert r.confidence == "HIGH"
    assert r.dominant_cost == "nested comparison"


def test_valid_response_in_markdown_fence_still_parses():
    fenced = "```json\n" + json.dumps(VALID) + "\n```"
    r = parse_and_validate(fenced)
    assert r.summary == VALID["summary"]


def test_missing_key_rejected():
    bad = dict(VALID)
    del bad["dominant_cost"]
    try:
        parse_and_validate(json.dumps(bad))
        assert False, "expected InvalidAIResponse"
    except InvalidAIResponse:
        pass


def test_bad_confidence_value_rejected():
    bad = dict(VALID)
    bad["confidence"] = "VERY SURE"
    try:
        parse_and_validate(json.dumps(bad))
        assert False, "expected InvalidAIResponse"
    except InvalidAIResponse:
        pass


def test_non_json_rejected():
    try:
        parse_and_validate("the complexity is O(n^2) because...")
        assert False, "expected InvalidAIResponse"
    except InvalidAIResponse:
        pass


def test_explain_returns_none_when_provider_raises():
    report, src = _report()

    def flaky_provider(prompt: str) -> str:
        raise ConnectionError("simulated network failure")

    result = explain(report, src, call_fn=flaky_provider)
    assert result is None  # deterministic result must survive this untouched
    assert report.time_complexity.render() == "O(n^2)"  # unaffected by the AI failure


def test_explain_returns_none_on_malformed_output():
    report, src = _report()
    result = explain(report, src, call_fn=lambda prompt: "not json at all")
    assert result is None


def test_explain_succeeds_with_well_behaved_mock_provider():
    report, src = _report()
    result = explain(report, src, call_fn=lambda prompt: json.dumps(VALID))
    assert result is not None
    assert result.confidence == "HIGH"


def test_explain_with_no_configured_provider_returns_none():
    # In this sandbox, no GROQ_API_KEY/GEMINI_API_KEY is set — resolve_provider()
    # should raise NoProviderConfigured internally, and explain() must absorb
    # that into a clean None rather than propagating it.
    report, src = _report()
    for var in ("GROQ_API_KEY", "GEMINI_API_KEY"):
        os.environ.pop(var, None)
    result = explain(report, src, call_fn=None)
    assert result is None


def test_prompt_isolates_source_from_system_instructions():
    report, src = _report()
    from complexity_engine.ai.explain import build_request
    req = build_request(report, src)
    prompt = req.to_prompt()
    assert "SYSTEM INSTRUCTIONS" in prompt
    assert "ANALYSIS DATA" in prompt
    assert prompt.index("SYSTEM INSTRUCTIONS") < prompt.index("ANALYSIS DATA")
