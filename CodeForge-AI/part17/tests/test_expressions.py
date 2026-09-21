import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from complexity_engine.expressions import ComplexityClass, var, log_term, exponential, constant, unknown


def test_drops_constant_coefficients():
    cc = ComplexityClass.of(var("n")) + ComplexityClass.of(var("n")) + ComplexityClass.of(var("n"))
    assert cc.render() == "O(n)"


def test_sum_of_same_var_dominant_wins():
    cc = ComplexityClass.of(var("n")) + ComplexityClass.of(var("n", 2))
    assert cc.render() == "O(n^2)"


def test_log_factor_dominates_plain_var():
    cc = ComplexityClass.of(var("n")) * ComplexityClass.of(log_term("n"))
    plain = ComplexityClass.of(var("n"))
    combined = cc + plain
    assert combined.render() == "O(n * log(n))"


def test_multiplication_adds_exponents():
    cc = ComplexityClass.of(var("n")) * ComplexityClass.of(var("n"))
    assert cc.render() == "O(n^2)"


def test_different_variables_never_collapse():
    cc = ComplexityClass.of(var("n")) + ComplexityClass.of(var("m"))
    # both variables must survive simplification — order isn't the point, presence is
    rendered = cc.render()
    assert rendered.startswith("O(") and " + " in rendered
    assert {"n", "m"} <= set(rendered.strip("O()").replace(" ", "").split("+"))


def test_multivariable_terms_preserved_independently():
    cc = ComplexityClass.of(var("rows")) * ComplexityClass.of(var("cols"))
    assert cc.render() == "O(cols * rows)"


def test_exponential_dominates_polynomial():
    cc = ComplexityClass.of(exponential(2, "n")) + ComplexityClass.of(var("n", 5))
    assert cc.render() == "O(2^n)"


def test_unknown_flagged_but_known_part_kept():
    cc = ComplexityClass.of(var("n")) + ComplexityClass.unknown("unresolved call")
    r = cc.render()
    assert "O(n)" in r and "unresolved" in r


def test_constant_alone():
    assert ComplexityClass.constant().render() == "O(1)"
