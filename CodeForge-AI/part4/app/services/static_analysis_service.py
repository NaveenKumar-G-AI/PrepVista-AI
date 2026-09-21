"""
Deterministic static analysis over the real submitted source, using
Python's own `ast` module — not an LLM guess, not a style opinion. We
report structure (nesting, function count, obvious unused names,
duplicate blocks) and stay away from subjective "this is bad code"
judgments per Phase 7.
"""
from __future__ import annotations

import ast
import hashlib
from collections import Counter

from app.models.schemas import CodeAnalysis


class _NestingVisitor(ast.NodeVisitor):
    def __init__(self) -> None:
        self.max_depth = 0
        self._depth = 0
        self.function_count = 0
        self.loop_nodes: list[ast.AST] = []
        self.recursive_calls: set[str] = set()
        self._current_func_stack: list[str] = []
        self.decision_points = 0  # for cyclomatic estimate

    def _enter(self):
        self._depth += 1
        self.max_depth = max(self.max_depth, self._depth)

    def _exit(self):
        self._depth -= 1

    def visit_FunctionDef(self, node: ast.FunctionDef):
        self.function_count += 1
        self._current_func_stack.append(node.name)
        self._enter()
        self.generic_visit(node)
        self._exit()
        self._current_func_stack.pop()

    visit_AsyncFunctionDef = visit_FunctionDef

    def visit_For(self, node: ast.For):
        self.loop_nodes.append(node)
        self.decision_points += 1
        self._enter()
        self.generic_visit(node)
        self._exit()

    def visit_While(self, node: ast.While):
        self.loop_nodes.append(node)
        self.decision_points += 1
        self._enter()
        self.generic_visit(node)
        self._exit()

    def visit_If(self, node: ast.If):
        self.decision_points += 1
        self._enter()
        self.generic_visit(node)
        self._exit()

    def visit_Try(self, node: ast.Try):
        self.decision_points += len(node.handlers) or 1
        self._enter()
        self.generic_visit(node)
        self._exit()

    def visit_Call(self, node: ast.Call):
        is_self_call = (
            isinstance(node.func, ast.Name)
            and self._current_func_stack
            and node.func.id == self._current_func_stack[-1]
        )
        if is_self_call:
            self.recursive_calls.add(node.func.id)
        self.generic_visit(node)


def _find_unused_names(tree: ast.AST) -> list[str]:
    assigned: set[str] = set()
    used: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Name):
            if isinstance(node.ctx, ast.Store):
                assigned.add(node.id)
            elif isinstance(node.ctx, ast.Load):
                used.add(node.id)
    return sorted(n for n in assigned - used if not n.startswith("_"))


def _find_duplicate_blocks(tree: ast.AST) -> int:
    """Hashes each top-level statement's dumped structure; counts groups
    with more than one identical member as evidence of duplication."""
    hashes = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            for stmt in node.body:
                dumped = ast.dump(stmt, annotate_fields=False)
                if len(dumped) > 40:  # ignore trivial one-liners
                    hashes.append(hashlib.sha1(dumped.encode()).hexdigest())
    counts = Counter(hashes)
    return sum(1 for c in counts.values() if c > 1)


def analyze_python(source_code: str) -> CodeAnalysis | None:
    """Returns None if the source doesn't even parse (compilation already
    failed elsewhere) — never fabricate analysis of unparseable code."""
    try:
        tree = ast.parse(source_code)
    except SyntaxError:
        return None

    visitor = _NestingVisitor()
    visitor.visit(tree)

    patterns = []
    if visitor.loop_nodes:
        patterns.append("uses_loops")
    if visitor.recursive_calls:
        patterns.append("uses_recursion")
    if any(isinstance(n, (ast.DictComp, ast.SetComp)) for n in ast.walk(tree)):
        patterns.append("uses_hash_based_structure")
    if any(isinstance(n, ast.ListComp) for n in ast.walk(tree)):
        patterns.append("uses_comprehension")

    loc = len([ln for ln in source_code.splitlines() if ln.strip()])

    return CodeAnalysis(
        function_count=visitor.function_count,
        max_nesting_depth=visitor.max_depth,
        cyclomatic_estimate=1 + visitor.decision_points,
        duplicate_blocks=_find_duplicate_blocks(tree),
        unused_names=_find_unused_names(tree),
        loc=loc,
        patterns=patterns,
    )


def get_loop_nesting_depth(source_code: str) -> int:
    """Used by complexity_service: max depth of loop-inside-loop nesting
    specifically (distinct from general block nesting)."""
    try:
        tree = ast.parse(source_code)
    except SyntaxError:
        return 0

    max_depth = 0

    def walk(node: ast.AST, depth: int) -> None:
        nonlocal max_depth
        for child in ast.iter_child_nodes(node):
            if isinstance(child, (ast.For, ast.While)):
                max_depth = max(max_depth, depth + 1)
                walk(child, depth + 1)
            else:
                walk(child, depth)

    walk(tree, 0)
    return max_depth
