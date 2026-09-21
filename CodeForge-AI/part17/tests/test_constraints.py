import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from complexity_engine.constraints import parse_constraints, assess_constraint_fit, Risk
from complexity_engine.expressions import ComplexityClass, var


def test_parses_simple_bound():
    cs = parse_constraints("1 <= n <= 100000")
    assert cs is not None and cs.bounds["n"] == 100000


def test_parses_scientific_notation():
    cs = parse_constraints("n <= 10^5")
    assert cs is not None and cs.bounds["n"] == 100000


def test_parses_multiple_variables():
    cs = parse_constraints("1 <= n, m <= 1000")
    assert cs is not None and cs.bounds["n"] == 1000 and cs.bounds["m"] == 1000


def test_unparseable_text_returns_none_not_a_guess():
    assert parse_constraints("the input is reasonably small") is None


def test_quadratic_at_large_n_is_high_risk_or_worse():
    cc = ComplexityClass.of(var("n", 2))
    cs = parse_constraints("n <= 10^5")
    a = assess_constraint_fit(cc, cs)
    assert a.risk in (Risk.HIGH, Risk.LIKELY_INFEASIBLE)


def test_linear_at_large_n_is_low_risk():
    cc = ComplexityClass.of(var("n"))
    cs = parse_constraints("n <= 10^7")
    a = assess_constraint_fit(cc, cs)
    assert a.risk == Risk.LOW


def test_missing_constraints_is_unknown_not_fabricated():
    cc = ComplexityClass.of(var("n", 2))
    a = assess_constraint_fit(cc, None)
    assert a.risk == Risk.UNKNOWN


def test_unmatched_variable_is_unknown():
    cc = ComplexityClass.of(var("m", 2))  # bound only covers "n"
    cs = parse_constraints("n <= 100")
    a = assess_constraint_fit(cc, cs)
    assert a.risk == Risk.UNKNOWN
