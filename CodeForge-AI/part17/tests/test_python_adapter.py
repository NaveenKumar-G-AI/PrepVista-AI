import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from complexity_engine.resolver import analyze, AnalysisFailure, UnsupportedLanguage
from complexity_engine.evidence import Confidence


def _time(src, **kw):
    return analyze(src, language="python", **kw).time_complexity.render()


def test_constant_time():
    assert _time("def f(n):\n    return n + 1\n") == "O(1)"


def test_linear_over_collection():
    assert _time("def f(arr):\n    t=0\n    for x in arr:\n        t+=x\n    return t\n") == "O(arr)"


def test_independent_nested_loops():
    src = "def f(n):\n    c=0\n    for i in range(n):\n        for j in range(n):\n            c+=1\n    return c\n"
    assert _time(src) == "O(n^2)"


def test_dependent_triangular_loop():
    src = "def f(n):\n    c=0\n    for i in range(n):\n        for j in range(i):\n            c+=1\n    return c\n"
    assert _time(src) == "O(n^2)"


def test_logarithmic_multiplicative():
    assert _time("def f(n):\n    i=1\n    while i<n:\n        i*=2\n    return i\n") == "O(log(n))"


def test_logarithmic_divisive():
    assert _time("def f(n):\n    i=n\n    while i>0:\n        i//=2\n    return i\n") == "O(log(n))"


def test_sequential_loops_sum_not_multiply():
    src = "def f(n):\n    for i in range(n):\n        pass\n    for j in range(n):\n        pass\n    return 0\n"
    assert _time(src) == "O(n)"


def test_conditional_branch_worst_case():
    src = ("def f(n):\n    flag=True\n    if flag:\n        for i in range(n):\n            pass\n"
           "    else:\n        for i in range(n):\n            for j in range(n):\n                pass\n    return 0\n")
    assert _time(src) == "O(n^2)"


def test_early_exit_best_case():
    src = "def f(arr,t):\n    for i in range(len(arr)):\n        if arr[i]==t:\n            return i\n    return -1\n"
    r = analyze(src, language="python")
    assert r.time_complexity.render() == "O(arr)"
    assert r.best_case is not None and r.best_case.render() == "O(1)"


def test_matrix_two_dimensions_preserved():
    src = "def f(rows,cols,m):\n    t=0\n    for i in range(rows):\n        for j in range(cols):\n            t+=m[i][j]\n    return t\n"
    assert _time(src) == "O(cols * rows)"


def test_graph_traversal_v_plus_e():
    src = "def f(vertices,adj):\n    t=0\n    for u in range(vertices):\n        for v in adj[u]:\n            t+=1\n    return t\n"
    assert _time(src) == "O(vertices + E)"


def test_recursion_arithmetic_decrease():
    assert _time("def f(n):\n    if n<=0:\n        return 0\n    return 1+f(n-1)\n") == "O(n)"


def test_recursion_master_theorem_case2():
    src = "def f(n):\n    if n<=1:\n        return 1\n    t=0\n    for i in range(n):\n        t+=1\n    return f(n//2)+f(n//2)+t\n"
    assert _time(src) == "O(n * log(n))"


def test_recursion_master_theorem_binary_search_shape():
    src = "def f(n):\n    if n<=1:\n        return 1\n    return f(n//2)\n"
    assert _time(src) == "O(log(n))"


def test_naive_exponential_recursion():
    assert _time("def fib(n):\n    if n<=1:\n        return n\n    return fib(n-1)+fib(n-2)\n") == "O(2^n)"


def test_memoization_overrides_exponential():
    src = ("def fib(n,memo=None):\n    if memo is None:\n        memo={}\n    if n in memo:\n        return memo[n]\n"
           "    if n<=1:\n        return n\n    r=fib(n-1,memo)+fib(n-2,memo)\n    memo[n]=r\n    return r\n")
    assert _time(src) == "O(n)"


def test_unresolvable_recursion_shape_is_unknown_not_guessed():
    src = ("def f(arr,t,lo,hi):\n    if lo>hi:\n        return -1\n    mid=(lo+hi)//2\n"
           "    if arr[mid]==t:\n        return mid\n    if arr[mid]<t:\n        return f(arr,t,mid+1,hi)\n"
           "    return f(arr,t,lo,mid-1)\n")
    r = analyze(src, language="python")
    assert r.time_complexity.render() == "UNKNOWN"
    assert r.confidence == Confidence.LOW


def test_sort_is_n_log_n():
    assert _time("def f(arr):\n    return sorted(arr)\n") == "O(arr * log(arr))"


def test_list_insert_zero_is_linear_per_call():
    r = analyze("def f(arr,n):\n    for i in range(n):\n        arr.insert(0,i)\n    return arr\n", language="python")
    assert "arr" in r.time_complexity.render()


def test_unresolved_function_call_is_low_confidence_not_fabricated():
    r = analyze("def f(arr):\n    return some_external_thing(arr)\n", language="python")
    assert r.time_complexity.render() == "O(1)"
    assert r.confidence == Confidence.LOW


def test_interprocedural_call_uses_callee_complexity():
    src = "def helper(arr):\n    t=0\n    for x in arr:\n        t+=x\n    return t\ndef f(arr):\n    return helper(arr)\n"
    assert _time(src, function_name="f") == "O(arr)"


def test_mutual_recursion_does_not_infinite_loop():
    src = "def is_even(n):\n    if n==0:\n        return True\n    return is_odd(n-1)\ndef is_odd(n):\n    if n==0:\n        return False\n    return is_even(n-1)\n"
    # Should complete without recursing forever, regardless of exact answer.
    r = analyze(src, language="python", function_name="is_even")
    assert r is not None


def test_unsupported_language_raises_cleanly():
    try:
        analyze("int main(){}", language="cpp")
        assert False, "expected UnsupportedLanguage"
    except UnsupportedLanguage:
        pass


def test_syntax_error_raises_cleanly():
    try:
        analyze("def f(:\n  pass", language="python")
        assert False, "expected AnalysisFailure"
    except AnalysisFailure as e:
        assert e.kind == "SyntaxError"


def test_no_function_found_raises_cleanly():
    try:
        analyze("x = 1\ny = 2\n", language="python")
        assert False, "expected AnalysisFailure"
    except AnalysisFailure as e:
        assert e.kind == "NoFunctionFound"
