"""
complexity_engine.python_adapter
==================================
The only currently-implemented language adapter. Everything here works
directly off Python's own `ast` module — real parsing, real line
numbers, no invented source positions and no LLM guessing the shape of
the code.

Scope, stated honestly (see README for the full limitations list):
  - loop bound tracing handles range()/collection iteration/enumerate/
    zip/.items() etc., including dependent (triangular) nested loops
    and multiplicative/divisive while-loops (logarithmic).
  - recursion solving covers single-variable recurrences of the shape
    T(n)=T(n-c)+f(n), T(n)=aT(n/b)+f(n) (Master theorem), branching
    arithmetic recursion (treated as exponential), and a memoization
    override when a cache-guard pattern is detected.
  - interprocedural calls are resolved through a cycle-safe call graph,
    but argument size is *not* renamed across calls with a differently-
    shaped signature (e.g. a helper called on a slice) — those fall
    back to the callee's own parameter name, which is still meaningful
    but not perfectly rescoped to the caller.
  - anything outside this falls back to UNKNOWN / LOW confidence,
    on purpose, rather than guessing.
"""
from __future__ import annotations

import ast
import math
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple, Set

from .expressions import ComplexityClass, Term, TermKind, constant, var, log_term, exponential, poly
from .evidence import Finding, EvidenceKind, Confidence, weakest


class PythonSyntaxError(Exception):
    pass


class NoFunctionFound(Exception):
    pass


# ---------------------------------------------------------------------------
# stdlib / builtin cost registry — CPython's documented amortized costs.
# Not invented per call; this is the same table as CPython's own
# "TimeComplexity" documentation for list/dict/set/heapq.
# ---------------------------------------------------------------------------

def cost_of_method(method: str, obj_size: Optional[str]) -> Tuple[Optional[ComplexityClass], Optional[str]]:
    o1 = {"append", "pop", "popleft", "appendleft", "add", "discard", "get", "setdefault", "update"}
    if method in o1:
        return ComplexityClass.constant(), f"'.{method}()' is O(1) amortized"
    if method == "sort":
        cc = ComplexityClass.of(poly({obj_size: 1}, {obj_size: 1})) if obj_size else ComplexityClass.constant()
        return cc, "'.sort()': Timsort, O(n log n) worst/average case, O(n) if already nearly sorted"
    if method == "insert":
        cc = ComplexityClass.of(var(obj_size)) if obj_size else ComplexityClass.constant()
        return cc, "'.insert()' at an arbitrary position shifts elements: O(n)"
    if method in ("remove", "index", "count"):
        cc = ComplexityClass.of(var(obj_size)) if obj_size else ComplexityClass.constant()
        return cc, f"'.{method}()' scans the collection: O(n)"
    if method in ("keys", "values", "items", "copy"):
        return ComplexityClass.constant(), f"'.{method}()' is O(1) to create; iterating it is sized at the loop"
    if method in ("heappush", "heappop"):
        cc = ComplexityClass.of(log_term(obj_size)) if obj_size else ComplexityClass.constant()
        return cc, f"heap '.{method}()': O(log n)"
    if method == "join":
        return ComplexityClass.constant(), "'.join()' is O(total length of parts) — size at the call if needed"
    return None, None


def cost_of_builtin(name: str, arg_sizes: List[str]) -> Tuple[Optional[ComplexityClass], Optional[str]]:
    size = arg_sizes[0] if arg_sizes else None
    if name in ("len", "id", "isinstance", "type", "hash", "print"):
        return ComplexityClass.constant(), None
    if name == "sorted":
        cc = ComplexityClass.of(poly({size: 1}, {size: 1})) if size else ComplexityClass.constant()
        return cc, "sorted(): Timsort, O(n log n)"
    if name in ("sum", "min", "max", "any", "all", "list", "tuple", "set", "frozenset"):
        if size:
            return ComplexityClass.of(var(size)), f"{name}() scans its argument: O({size})"
        return ComplexityClass.constant(), None
    return None, None


def _detect_memoization(func_node: ast.FunctionDef) -> bool:
    for d in func_node.decorator_list:
        if (isinstance(d, ast.Name) and d.id == "lru_cache") or \
           (isinstance(d, ast.Attribute) and d.attr in ("lru_cache", "cache")) or \
           (isinstance(d, ast.Call) and isinstance(d.func, ast.Name) and d.func.id == "lru_cache") or \
           (isinstance(d, ast.Call) and isinstance(d.func, ast.Attribute) and d.func.attr == "lru_cache"):
            return True
    has_membership_check = any(
        isinstance(n, ast.Compare) and any(isinstance(op, ast.In) for op in n.ops)
        for n in ast.walk(func_node)
    )
    has_cache_write = any(
        isinstance(n, ast.Assign) and len(n.targets) == 1 and isinstance(n.targets[0], ast.Subscript)
        for n in ast.walk(func_node)
    )
    return has_membership_check and has_cache_write


# ---------------------------------------------------------------------------
# Per-function analysis
# ---------------------------------------------------------------------------

@dataclass
class FunctionResult:
    name: str
    time: ComplexityClass
    space: ComplexityClass
    best_case: Optional[ComplexityClass]
    findings: Tuple[Finding, ...]
    confidence: Confidence
    recursive: bool


class FunctionAnalyzer:
    def __init__(self, func_node: ast.FunctionDef, call_graph: "CallGraph"):
        self.func_node = func_node
        self.call_graph = call_graph
        self.findings: List[Finding] = []
        self.recent_assign: Dict[str, str] = {}
        self.active_loop_vars: Dict[str, str] = {}
        self.best_case_override: Optional[ComplexityClass] = None
        self.space_terms: List[Term] = []
        self.param_names = [a.arg for a in func_node.args.args]
        for p in self.param_names:
            self.recent_assign[p] = p

    # -- size resolution -----------------------------------------------
    def resolve_size(self, expr: Optional[ast.expr]) -> Optional[str]:
        if expr is None:
            return None
        if isinstance(expr, ast.Name):
            return self.recent_assign.get(expr.id, expr.id)
        if isinstance(expr, ast.Call):
            if isinstance(expr.func, ast.Name):
                if expr.func.id == "len" and expr.args:
                    return self.resolve_size(expr.args[0])
                if expr.func.id in ("enumerate", "reversed", "iter", "sorted", "zip", "list", "tuple", "set") and expr.args:
                    return self.resolve_size(expr.args[0])
                if expr.func.id == "range" and len(expr.args) == 1:
                    return self.resolve_size(expr.args[0])
            if isinstance(expr.func, ast.Attribute) and expr.func.attr in ("items", "keys", "values", "copy") and not expr.args:
                return self.resolve_size(expr.func.value)
            return None
        if isinstance(expr, ast.BinOp):
            left, right = self.resolve_size(expr.left), self.resolve_size(expr.right)
            if isinstance(expr.right, ast.Constant) and left:
                return left
            if isinstance(expr.left, ast.Constant) and right:
                return right
            return left or right
        if isinstance(expr, ast.Subscript):
            return self.resolve_size(expr.value)  # over-approximates slices as full-size; documented limitation
        return None

    def _track_assign(self, targets, value) -> None:
        if len(targets) == 1 and isinstance(targets[0], ast.Name):
            src = self.resolve_size(value)
            if src:
                self.recent_assign[targets[0].id] = src

    # -- statement-level composition ------------------------------------
    def analyze_stmts(self, stmts: List[ast.stmt]) -> ComplexityClass:
        total = ComplexityClass.constant()
        for stmt in stmts:
            total = total + self.analyze_stmt(stmt)
        return total

    def analyze_stmt(self, stmt: ast.stmt) -> ComplexityClass:
        if isinstance(stmt, ast.For):
            return self.analyze_for(stmt)
        if isinstance(stmt, ast.While):
            return self.analyze_while(stmt)
        if isinstance(stmt, ast.If):
            test_cost = self.analyze_expr(stmt.test)
            then_cost = self.analyze_stmts(stmt.body)
            else_cost = self.analyze_stmts(stmt.orelse) if stmt.orelse else ComplexityClass.constant()
            return test_cost + ComplexityClass.max_of(then_cost, else_cost)
        if isinstance(stmt, (ast.Break, ast.Continue, ast.Pass, ast.Global, ast.Nonlocal, ast.Import, ast.ImportFrom)):
            return ComplexityClass.constant()
        if isinstance(stmt, ast.Return):
            return self.analyze_expr(stmt.value) if stmt.value is not None else ComplexityClass.constant()
        if isinstance(stmt, ast.Assign):
            self._track_assign(stmt.targets, stmt.value)
            return self.analyze_expr(stmt.value)
        if isinstance(stmt, ast.AugAssign):
            return self.analyze_expr(stmt.value)
        if isinstance(stmt, ast.AnnAssign):
            return self.analyze_expr(stmt.value) if stmt.value is not None else ComplexityClass.constant()
        if isinstance(stmt, ast.Expr):
            return self.analyze_expr(stmt.value)
        if isinstance(stmt, (ast.With, ast.AsyncWith)):
            return self.analyze_stmts(stmt.body)
        if isinstance(stmt, ast.Try):
            cost = self.analyze_stmts(stmt.body)
            for h in stmt.handlers:
                cost = ComplexityClass.max_of(cost, self.analyze_stmts(h.body))
            if stmt.finalbody:
                cost = cost + self.analyze_stmts(stmt.finalbody)
            return cost
        if isinstance(stmt, ast.FunctionDef):
            return ComplexityClass.constant()
        return ComplexityClass.constant()

    # -- loops ------------------------------------------------------------
    def analyze_for(self, node: ast.For) -> ComplexityClass:
        target_name = node.target.id if isinstance(node.target, ast.Name) else None

        graph_result = self._maybe_graph_traversal(node, target_name)
        if graph_result is not None:
            return graph_result

        bound_name: Optional[str] = None
        it = node.iter
        if isinstance(it, ast.Call) and isinstance(it.func, ast.Name) and it.func.id == "range":
            args = it.args
            bound_expr = args[0] if len(args) == 1 else (args[1] if len(args) >= 2 else None)
            resolved = self.resolve_size(bound_expr) if bound_expr is not None else None
            if resolved and resolved in self.active_loop_vars:
                bound_name = self.active_loop_vars[resolved]
                finding = Finding(EvidenceKind.DEPENDENT_LOOP,
                    f"range() bound is the active outer loop variable '{resolved}' — this nest is "
                    f"triangular, contributing Theta({bound_name}^2) total when combined with the outer loop",
                    Confidence.HIGH, line=node.lineno, function=self.func_node.name)
            elif resolved:
                bound_name = resolved
                finding = Finding(EvidenceKind.LOOP_BOUND, f"range() bound resolves to '{resolved}'",
                                   Confidence.HIGH, line=node.lineno, function=self.func_node.name)
            else:
                finding = Finding(EvidenceKind.LOOP_BOUND,
                    "range() bound is not a simple variable/len() expression — cannot size this loop",
                    Confidence.LOW, line=node.lineno, function=self.func_node.name)
        else:
            resolved = self.resolve_size(it)
            if resolved:
                bound_name = resolved
                finding = Finding(EvidenceKind.LOOP_BOUND, f"iterates over '{resolved}'",
                                   Confidence.HIGH, line=node.lineno, function=self.func_node.name)
            else:
                finding = Finding(EvidenceKind.LOOP_BOUND,
                    "loop iterable is not a simple named collection — cannot size this loop",
                    Confidence.LOW, line=node.lineno, function=self.func_node.name)

        self.findings.append(finding)
        bound_cc = ComplexityClass.of(var(bound_name)) if bound_name else ComplexityClass.unknown(finding.description)

        if target_name:
            self.active_loop_vars[target_name] = bound_name or "?"
        body_cost = self.analyze_stmts(node.body)
        if target_name:
            self.active_loop_vars.pop(target_name, None)
        self._maybe_flag_break(node.body)
        return bound_cc * body_cost

    def _maybe_graph_traversal(self, node: ast.For, target_name: Optional[str]) -> Optional[ComplexityClass]:
        if not target_name or len(node.body) != 1 or not isinstance(node.body[0], ast.For):
            return None
        inner = node.body[0]
        if not isinstance(inner.iter, ast.Subscript) or not isinstance(inner.iter.value, ast.Name):
            return None
        idx = inner.iter.slice
        idx_name = idx.id if isinstance(idx, ast.Name) else None
        if idx_name != target_name:
            return None
        outer_iter_expr = node.iter.args[0] if isinstance(node.iter, ast.Call) and node.iter.args else node.iter
        outer_bound = self.resolve_size(outer_iter_expr)
        if not outer_bound:
            return None
        self.findings.append(Finding(EvidenceKind.NESTED_LOOP,
            f"adjacency-list traversal ('for {target_name} in ...: for x in "
            f"{inner.iter.value.id}[{target_name}]'): summed neighbor counts equal edge count, "
            f"giving O(V + E) rather than O(V * max_degree)",
            Confidence.MEDIUM, line=node.lineno, function=self.func_node.name))
        self.active_loop_vars[target_name] = outer_bound
        inner_target = inner.target.id if isinstance(inner.target, ast.Name) else None
        if inner_target:
            self.active_loop_vars[inner_target] = "E"
        body_cost = self.analyze_stmts(inner.body)
        self.active_loop_vars.pop(target_name, None)
        if inner_target:
            self.active_loop_vars.pop(inner_target, None)
        ve = ComplexityClass.of(var(outer_bound)) + ComplexityClass.of(var("E"))
        return ve * body_cost

    def analyze_while(self, node: ast.While) -> ComplexityClass:
        cvar, start = self._while_controlling_var(node)
        update = self._while_update_kind(node, cvar) if cvar else None

        if cvar and update in ("mult", "div") and start:
            self.findings.append(Finding(EvidenceKind.LOGARITHMIC_LOOP,
                f"'{cvar}' is {'multiplied' if update == 'mult' else 'divided'} by a constant each "
                f"iteration, starting from '{start}': O(log {start})",
                Confidence.HIGH, line=node.lineno, function=self.func_node.name))
            bound_cc = ComplexityClass.of(log_term(start))
        elif cvar and update in ("add", "sub") and start:
            self.findings.append(Finding(EvidenceKind.LOOP_BOUND,
                f"'{cvar}' changes by a constant each iteration from '{start}': O({start})",
                Confidence.HIGH, line=node.lineno, function=self.func_node.name))
            bound_cc = ComplexityClass.of(var(start))
        else:
            self.findings.append(Finding(EvidenceKind.LOOP_BOUND,
                "while-loop bound could not be determined from a recognized counter pattern",
                Confidence.LOW, line=node.lineno, function=self.func_node.name))
            bound_cc = ComplexityClass.unknown("unrecognized while-loop bound")

        body_cost = self.analyze_stmts(node.body)
        self._maybe_flag_break(node.body)
        return bound_cc * body_cost

    def _while_controlling_var(self, node: ast.While) -> Tuple[Optional[str], Optional[str]]:
        test = node.test
        if isinstance(test, ast.Compare) and len(test.ops) == 1:
            left, right = test.left, test.comparators[0]
            if isinstance(left, ast.Name):
                cvar, other = left.id, right
            elif isinstance(right, ast.Name):
                cvar, other = right.id, left
            else:
                return None, None
            other_resolved = self.resolve_size(other) if not isinstance(other, ast.Constant) else None
            if other_resolved:
                return cvar, other_resolved
            start = self.recent_assign.get(cvar, cvar)
            return cvar, start
        return None, None

    def _while_update_kind(self, node: ast.While, cvar: str) -> Optional[str]:
        wrapper = ast.Module(body=node.body, type_ignores=[])
        for stmt in ast.walk(wrapper):
            if isinstance(stmt, ast.AugAssign) and isinstance(stmt.target, ast.Name) and stmt.target.id == cvar:
                return {"Mult": "mult", "FloorDiv": "div", "Div": "div", "Add": "add", "Sub": "sub"}.get(
                    type(stmt.op).__name__)
            if isinstance(stmt, ast.Assign) and len(stmt.targets) == 1 and isinstance(stmt.targets[0], ast.Name) \
                    and stmt.targets[0].id == cvar and isinstance(stmt.value, ast.BinOp) \
                    and isinstance(stmt.value.left, ast.Name) and stmt.value.left.id == cvar:
                return {"Mult": "mult", "FloorDiv": "div", "Div": "div", "Add": "add", "Sub": "sub"}.get(
                    type(stmt.value.op).__name__)
        return None

    def _maybe_flag_break(self, body: List[ast.stmt]) -> None:
        for stmt in body:
            if isinstance(stmt, ast.If) and (self._contains_exit(stmt.body) or self._contains_exit(stmt.orelse)):
                self.best_case_override = ComplexityClass.constant()
                self.findings.append(Finding(EvidenceKind.EARLY_EXIT,
                    "loop contains a conditional break/return: best case can be O(1)",
                    Confidence.MEDIUM, line=stmt.lineno, function=self.func_node.name))
                return

    @staticmethod
    def _contains_exit(stmts: List[ast.stmt]) -> bool:
        return any(isinstance(s, (ast.Break, ast.Return)) for s in stmts)

    # -- expressions / calls ----------------------------------------------
    def analyze_expr(self, expr: Optional[ast.expr]) -> ComplexityClass:
        if expr is None:
            return ComplexityClass.constant()
        if isinstance(expr, ast.Call):
            return self._analyze_call(expr)
        if isinstance(expr, (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)):
            gen = expr.generators[0] if expr.generators else None
            bound_name = self.resolve_size(gen.iter) if gen else None
            bound_cc = ComplexityClass.of(var(bound_name)) if bound_name else ComplexityClass.unknown(
                "comprehension source is not a simple sized collection")
            elt = getattr(expr, "elt", None) or getattr(expr, "key", None)
            elt_cost = self.analyze_expr(elt)
            self.findings.append(Finding(EvidenceKind.LOOP_BOUND,
                f"comprehension iterates O({bound_name or '?'}) times", Confidence.HIGH if bound_name else Confidence.LOW,
                line=expr.lineno, function=self.func_node.name))
            return bound_cc * elt_cost
        if isinstance(expr, ast.BoolOp):
            total = ComplexityClass.constant()
            for v in expr.values:
                total = total + self.analyze_expr(v)
            return total
        if isinstance(expr, ast.BinOp):
            return self.analyze_expr(expr.left) + self.analyze_expr(expr.right)
        if isinstance(expr, ast.Compare):
            total = self.analyze_expr(expr.left)
            for c in expr.comparators:
                total = total + self.analyze_expr(c)
            if any(isinstance(op, (ast.In, ast.NotIn)) for op in expr.ops):
                container = expr.comparators[0] if expr.comparators else None
                container_name = self.resolve_size(container) if container is not None else None
                self.findings.append(Finding(EvidenceKind.DATA_STRUCTURE_OPERATION,
                    f"membership test assumes an O(1) container (set/dict) for '{container_name or '...'}' "
                    f"— if it's actually a list, this check is O({container_name or 'n'}) instead of O(1)",
                    Confidence.MEDIUM, line=getattr(expr, "lineno", None), function=self.func_node.name))
            return total
        if isinstance(expr, ast.IfExp):
            return ComplexityClass.max_of(self.analyze_expr(expr.body), self.analyze_expr(expr.orelse))
        return ComplexityClass.constant()

    def _analyze_call(self, call: ast.Call) -> ComplexityClass:
        if isinstance(call.func, ast.Attribute):
            method = call.func.attr
            obj_size = self.resolve_size(call.func.value)
            cc, reason = cost_of_method(method, obj_size)
            if cc is not None:
                self.findings.append(Finding(EvidenceKind.DATA_STRUCTURE_OPERATION, reason or f".{method}() call",
                                              Confidence.HIGH, line=call.lineno, function=self.func_node.name))
                if method in ("append", "add", "appendleft") and self.active_loop_vars:
                    innermost = list(self.active_loop_vars.values())[-1]
                    if innermost and innermost != "?":
                        self.space_terms.append(var(innermost))
                return cc
            self.findings.append(Finding(EvidenceKind.UNRESOLVED,
                f"method '.{method}()' has no known cost model — treated conservatively as O(1)",
                Confidence.LOW, line=call.lineno, function=self.func_node.name))
            return ComplexityClass.constant()

        if isinstance(call.func, ast.Name):
            name = call.func.id
            if name == self.func_node.name:
                return ComplexityClass.constant()  # recursion is solved separately, not accumulated here

            arg_sizes = [s for s in (self.resolve_size(a) for a in call.args) if s]
            cc, reason = cost_of_builtin(name, arg_sizes)
            if cc is not None:
                if reason:
                    self.findings.append(Finding(EvidenceKind.LIBRARY_OPERATION, reason, Confidence.HIGH,
                                                  line=call.lineno, function=self.func_node.name))
                return cc

            resolved = self.call_graph.resolve(name)
            if resolved is not None:
                self.findings.append(Finding(EvidenceKind.FUNCTION_CALL,
                    f"calls '{name}()', whose own time complexity is {resolved.time.render()}",
                    Confidence.MEDIUM, line=call.lineno, function=self.func_node.name))
                return resolved.time
            self.findings.append(Finding(EvidenceKind.UNRESOLVED,
                f"call to unresolved function '{name}()' — treated conservatively as O(1)",
                Confidence.LOW, line=call.lineno, function=self.func_node.name))
            return ComplexityClass.constant()
        return ComplexityClass.constant()

    # -- top-level ----------------------------------------------------------
    def analyze(self) -> FunctionResult:
        extra_work = self.analyze_stmts(self.func_node.body)
        memoized = _detect_memoization(self.func_node)
        rec_time, rec_findings, rec_space = _analyze_recursion(
            self.func_node, self.param_names, extra_work, memoized)
        self.findings.extend(rec_findings)

        if rec_time is not None:
            time, space, best_case = rec_time, (rec_space or ComplexityClass.constant()), None
        else:
            time = extra_work
            space = ComplexityClass(terms=tuple(self.space_terms)).simplify() if self.space_terms else ComplexityClass.constant()
            best_case = self.best_case_override

        confidence = weakest([f.confidence for f in self.findings]) if self.findings else Confidence.HIGH
        return FunctionResult(name=self.func_node.name, time=time, space=space, best_case=best_case,
                               findings=tuple(self.findings), confidence=confidence, recursive=rec_time is not None)


# ---------------------------------------------------------------------------
# Recursion / recurrence solving
# ---------------------------------------------------------------------------

def _classify_arg_at(call: ast.Call, idx: int, param: str) -> Tuple[str, Optional[float]]:
    if idx >= len(call.args):
        return "unknown", None
    arg = call.args[idx]
    if isinstance(arg, ast.BinOp) and isinstance(arg.left, ast.Name) and arg.left.id == param \
            and isinstance(arg.right, ast.Constant) and isinstance(arg.right.value, (int, float)):
        if isinstance(arg.op, ast.Sub):
            return "sub_const", arg.right.value
        if isinstance(arg.op, (ast.FloorDiv, ast.Div)):
            return "div_const", arg.right.value
    return "unknown", None


def _polynomial_degree(cc: ComplexityClass, param: str) -> Optional[float]:
    known = [t for t in cc.terms if t.kind is not TermKind.UNKNOWN]
    if len(known) != 1:
        return None
    t = known[0]
    if t.kind is TermKind.CONSTANT:
        return 0.0
    if t.kind is TermKind.POLY_LOG and t.var_set <= {param} and not t.log_powers:
        return dict(t.powers).get(param, 0.0)
    return None


def _master_theorem(a: float, b: float, d: float, param: str) -> ComplexityClass:
    log_b_a = math.log(a, b) if a > 0 and b > 1 else 0.0
    if abs(d - log_b_a) < 1e-9:
        return ComplexityClass.of(poly({param: d}, {param: 1}))
    if d < log_b_a:
        return ComplexityClass.of(poly({param: log_b_a}))
    return ComplexityClass.of(poly({param: d}))


def _fmt(x: float) -> str:
    return str(int(x)) if float(x).is_integer() else f"{x:.3f}".rstrip("0")


def _analyze_recursion(func_node: ast.FunctionDef, params: List[str], extra_work: ComplexityClass, memoized: bool
                        ) -> Tuple[Optional[ComplexityClass], List[Finding], Optional[ComplexityClass]]:
    self_calls = [n for n in ast.walk(func_node)
                  if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == func_node.name]
    if not self_calls:
        return None, [], None

    a = len(self_calls)
    findings = [Finding(EvidenceKind.RECURSIVE_CALL, f"{a} self-call(s) detected in '{func_node.name}'",
                         Confidence.HIGH, function=func_node.name)]

    # Try each parameter (not just the first) to find one where every
    # self-call shows a recognized arithmetic/geometric decrease against
    # it. This catches e.g. def f(x, n): ... f(x, n - 1) ..., not only
    # the case where the size parameter happens to be listed first.
    primary: Optional[str] = None
    calls: Optional[List[Tuple[str, Optional[float]]]] = None
    for idx, candidate in enumerate(params):
        classified = [_classify_arg_at(call, idx, candidate) for call in self_calls]
        if all(k != "unknown" for k, _ in classified):
            primary, calls = candidate, classified
            break

    if primary is None or calls is None:
        findings.append(Finding(
            EvidenceKind.RECURSIVE_CALL,
            "recursive call arguments don't show a single-parameter arithmetic/geometric decrease this "
            "recurrence solver recognizes (e.g. an index-gap pattern like binary search's lo/hi, or a "
            "transformation routed through an intermediate variable) — the true complexity may still be "
            "well-defined, just outside this solver's pattern set",
            Confidence.LOW, function=func_node.name))
        return (ComplexityClass.unknown("recursion argument pattern not recognized"), findings,
                ComplexityClass.unknown("unrecognized recursion depth"))

    kinds = {k for k, _ in calls}

    if memoized and kinds == {"sub_const"} and primary:
        findings.append(Finding(EvidenceKind.MEMOIZATION,
            f"cache-guard pattern detected; recursion is over a bounded integer state space in '{primary}'",
            Confidence.MEDIUM, function=func_node.name))
        deg = _polynomial_degree(extra_work, primary) or 0.0
        time = ComplexityClass.of(poly({primary: 1 + deg}))
        return time, findings, ComplexityClass.of(var(primary))

    if a == 1 and kinds == {"sub_const"} and primary:
        deg = _polynomial_degree(extra_work, primary)
        if deg is not None:
            time = ComplexityClass.of(var(primary, deg + 1))
            findings.append(Finding(EvidenceKind.RECURSIVE_CALL,
                f"T(n) = T(n-c) + O({extra_work.dominant_term_render}) resolves to O({primary}^{_fmt(deg + 1)})",
                Confidence.HIGH, function=func_node.name))
            return time, findings, ComplexityClass.of(var(primary))
        findings.append(Finding(EvidenceKind.RECURSIVE_CALL,
            "T(n) = T(n-c) + f(n) detected but f(n) isn't a plain polynomial this engine can solve",
            Confidence.LOW, function=func_node.name))
        return ComplexityClass.unknown("unsolved linear recurrence"), findings, ComplexityClass.of(var(primary))

    if kinds == {"div_const"} and primary:
        b = next((v for k, v in calls if v), 2) or 2
        deg = _polynomial_degree(extra_work, primary)
        deg = deg if deg is not None else 0.0
        time = _master_theorem(a=a, b=b, d=deg, param=primary)
        findings.append(Finding(EvidenceKind.RECURSIVE_CALL,
            f"T(n) = {a}T(n/{_fmt(b)}) + O({extra_work.dominant_term_render}) — Master theorem gives {time.render()}",
            Confidence.HIGH, function=func_node.name))
        return time, findings, ComplexityClass.of(log_term(primary))

    if a >= 2 and kinds == {"sub_const"} and primary:
        findings.append(Finding(EvidenceKind.RECURSIVE_CALL,
            f"T(n) = {a}T(n-c) + O(...): branching recursion with arithmetic decrease is exponential, "
            f"bounded by O({a}^{primary})",
            Confidence.MEDIUM, function=func_node.name))
        return ComplexityClass.of(exponential(a, primary)), findings, ComplexityClass.of(var(primary))

    findings.append(Finding(EvidenceKind.RECURSIVE_CALL,
        "recursive call pattern doesn't match a recurrence shape this engine solves",
        Confidence.LOW, function=func_node.name))
    return ComplexityClass.unknown("unrecognized recurrence shape"), findings, ComplexityClass.unknown("unrecognized recursion depth")


# ---------------------------------------------------------------------------
# Call graph + module entrypoint
# ---------------------------------------------------------------------------

class CallGraph:
    def __init__(self, module: ast.Module):
        self.defs: Dict[str, ast.FunctionDef] = {n.name: n for n in module.body if isinstance(n, ast.FunctionDef)}
        self._cache: Dict[str, Optional[FunctionResult]] = {}
        self._in_progress: Set[str] = set()

    def resolve(self, name: str) -> Optional[FunctionResult]:
        if name in self._cache:
            return self._cache[name]
        if name not in self.defs or name in self._in_progress:
            return None
        self._in_progress.add(name)
        result = FunctionAnalyzer(self.defs[name], self).analyze()
        self._in_progress.discard(name)
        self._cache[name] = result
        return result


def analyze_python_function(source: str, function_name: Optional[str] = None) -> FunctionResult:
    try:
        tree = ast.parse(source)
    except SyntaxError as e:
        raise PythonSyntaxError(str(e)) from e

    graph = CallGraph(tree)
    if not graph.defs:
        raise NoFunctionFound("no top-level function definitions found in source")
    target = function_name or list(graph.defs.keys())[-1]
    if target not in graph.defs:
        raise NoFunctionFound(f"function '{target}' not found in source")
    result = graph.resolve(target)
    assert result is not None
    return result
