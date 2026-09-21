"""
complexity_engine.expressions
==============================
Structured representation of asymptotic complexity classes.

This is NOT a string like "O(n^2)" glued together after the fact. A
complexity class is a *sum of terms*, and each term is a product of
variables (each raised to a power) and log-factors of variables, or a
pure exponential base**variable, or a constant, or an explicit
"unknown". Representing it this way (instead of manipulating strings)
is what makes simplification actually correct instead of pattern-matched:

    O(3n)          -> O(n)              coefficients are never tracked
    O(n + n)       -> O(n)              identical terms collapse
    O(n + n^2)     -> O(n^2)            dominant term wins
    O(n log n + n) -> O(n log n)        log factor makes it dominant
    O(n * n)       -> O(n^2)            multiplication adds exponents
    O(n + m)       -> O(n + m)          NEVER collapsed — different vars

Two terms are only ever compared when they range over the exact same
set of variables. A term in {n} and a term in {n, m} are never merged
into one another, because there's no general ordering between e.g.
n^2 and n*m without more information than the source code gives us.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Dict, FrozenSet, List, Optional, Tuple


class TermKind(Enum):
    CONSTANT = "CONSTANT"
    POLY_LOG = "POLY_LOG"
    EXPONENTIAL = "EXPONENTIAL"
    UNKNOWN = "UNKNOWN"


def _fmt_num(x: float) -> str:
    if float(x).is_integer():
        return str(int(x))
    return f"{x:.2f}".rstrip("0").rstrip(".")


@dataclass(frozen=True)
class Term:
    kind: TermKind
    powers: Tuple[Tuple[str, float], ...] = ()
    log_powers: Tuple[Tuple[str, float], ...] = ()
    exp_base: float = 0.0
    exp_var: str = ""
    reason: str = ""

    @property
    def var_set(self) -> FrozenSet[str]:
        return frozenset(v for v, _ in self.powers)

    def render(self) -> str:
        if self.kind is TermKind.CONSTANT:
            return "1"
        if self.kind is TermKind.UNKNOWN:
            return "unknown"
        if self.kind is TermKind.EXPONENTIAL:
            return f"{_fmt_num(self.exp_base)}^{self.exp_var}"
        parts: List[str] = []
        for v, p in sorted(self.powers):
            parts.append(v if p == 1 else f"{v}^{_fmt_num(p)}")
        for v, p in sorted(self.log_powers):
            parts.append(f"log({v})" if p == 1 else f"log({v})^{_fmt_num(p)}")
        return " * ".join(parts) if parts else "1"

    def dominates(self, other: "Term") -> bool:
        """True if `self` grows at least as fast as `other` in every
        dimension `other` has, with a strict inequality somewhere.
        Only meaningful for POLY_LOG terms; only comparable across
        var-sets when other's variables are a subset of self's."""
        if self.kind is not TermKind.POLY_LOG or other.kind is not TermKind.POLY_LOG:
            return False
        if not other.var_set <= self.var_set:
            return False
        sp, op = dict(self.powers), dict(other.powers)
        strictly_greater = self.var_set > other.var_set  # extra vars = strictly bigger
        for v in other.var_set:
            a, b = sp.get(v, 0), op.get(v, 0)
            if a < b:
                return False
            if a > b:
                strictly_greater = True
        if not strictly_greater:
            slp, olp = dict(self.log_powers), dict(other.log_powers)
            for v in other.var_set:
                a, b = slp.get(v, 0), olp.get(v, 0)
                if a < b:
                    return False
                if a > b:
                    strictly_greater = True
        return strictly_greater


def constant() -> Term:
    return Term(kind=TermKind.CONSTANT)


def poly(var_powers: Optional[Dict[str, float]] = None,
         log_powers: Optional[Dict[str, float]] = None) -> Term:
    p = tuple(sorted((v, pw) for v, pw in (var_powers or {}).items() if pw != 0))
    lp = tuple(sorted((v, pw) for v, pw in (log_powers or {}).items() if pw != 0))
    if not p and not lp:
        return constant()
    return Term(kind=TermKind.POLY_LOG, powers=p, log_powers=lp)


def var(name: str, power: float = 1.0) -> Term:
    return poly({name: power})


def log_term(name: str, power: float = 1.0) -> Term:
    return poly(None, {name: power})


def exponential(base: float, var_name: str) -> Term:
    return Term(kind=TermKind.EXPONENTIAL, exp_base=base, exp_var=var_name)


def unknown(reason: str) -> Term:
    return Term(kind=TermKind.UNKNOWN, reason=reason)


def _mul_terms(a: Term, b: Term) -> Term:
    if a.kind is TermKind.UNKNOWN or b.kind is TermKind.UNKNOWN:
        return unknown(a.reason or b.reason or "unknown factor")
    if a.kind is TermKind.CONSTANT:
        return b
    if b.kind is TermKind.CONSTANT:
        return a
    if a.kind is TermKind.EXPONENTIAL or b.kind is TermKind.EXPONENTIAL:
        if a.kind is TermKind.EXPONENTIAL and b.kind is TermKind.EXPONENTIAL and a.exp_var == b.exp_var:
            return exponential(a.exp_base * b.exp_base, a.exp_var)
        return a if a.kind is TermKind.EXPONENTIAL else b
    powers: Dict[str, float] = dict(a.powers)
    for v, p in b.powers:
        powers[v] = powers.get(v, 0) + p
    logs: Dict[str, float] = dict(a.log_powers)
    for v, p in b.log_powers:
        logs[v] = logs.get(v, 0) + p
    return poly(powers, logs)


@dataclass(frozen=True)
class ComplexityClass:
    terms: Tuple[Term, ...] = (constant(),)
    unknown_note: Optional[str] = None

    @staticmethod
    def constant() -> "ComplexityClass":
        return ComplexityClass(terms=(constant(),))

    @staticmethod
    def of(t: Term) -> "ComplexityClass":
        return ComplexityClass(terms=(t,)).simplify()

    @staticmethod
    def unknown(reason: str) -> "ComplexityClass":
        return ComplexityClass(terms=(unknown(reason),), unknown_note=reason)

    def simplify(self) -> "ComplexityClass":
        unk = [t for t in self.terms if t.kind is TermKind.UNKNOWN]
        exp = [t for t in self.terms if t.kind is TermKind.EXPONENTIAL]
        poly_terms = [t for t in self.terms if t.kind is TermKind.POLY_LOG]
        has_const = any(t.kind is TermKind.CONSTANT for t in self.terms)
        kept: List[Term] = []

        if exp:
            best_by_var: Dict[str, Term] = {}
            for t in exp:
                cur = best_by_var.get(t.exp_var)
                if cur is None or t.exp_base > cur.exp_base:
                    best_by_var[t.exp_var] = t
            kept = list(best_by_var.values())
        else:
            groups: Dict[FrozenSet[str], List[Term]] = {}
            for t in poly_terms:
                groups.setdefault(t.var_set, []).append(t)
            for group in groups.values():
                maximal = [t for t in group if not any(o is not t and o.dominates(t) for o in group)]
                seen = set()
                for t in maximal:
                    key = (t.powers, t.log_powers)
                    if key not in seen:
                        seen.add(key)
                        kept.append(t)
            if not kept and has_const:
                kept = [constant()]

        if not kept and not unk:
            kept = [constant()]

        note = self.unknown_note or (unk[0].reason if unk else None)
        result_terms: Tuple[Term, ...] = tuple(kept) if kept else (constant(),)
        if unk:
            result_terms = result_terms + (unk[0],)
        return ComplexityClass(terms=result_terms, unknown_note=note)

    def __add__(self, other: "ComplexityClass") -> "ComplexityClass":
        return ComplexityClass(terms=self.terms + other.terms,
                                unknown_note=self.unknown_note or other.unknown_note).simplify()

    def __mul__(self, other: "ComplexityClass") -> "ComplexityClass":
        products = tuple(_mul_terms(a, b) for a in self.terms for b in other.terms)
        return ComplexityClass(terms=products,
                                unknown_note=self.unknown_note or other.unknown_note).simplify()

    @staticmethod
    def max_of(a: "ComplexityClass", b: "ComplexityClass") -> "ComplexityClass":
        # Worst case across branches. For comparable (same-variable-set)
        # terms this correctly picks the dominant one; for incomparable
        # terms (different variables) it correctly keeps both rather
        # than forcing a false ordering — sum-then-simplify gives
        # exactly that behaviour.
        return a + b

    @property
    def has_unknown(self) -> bool:
        return any(t.kind is TermKind.UNKNOWN for t in self.terms) or self.unknown_note is not None

    @property
    def dominant_term_render(self) -> str:
        known = [t for t in self.terms if t.kind is not TermKind.UNKNOWN]
        return known[0].render() if len(known) == 1 else " + ".join(t.render() for t in known)

    def render(self) -> str:
        known = [t for t in self.terms if t.kind is not TermKind.UNKNOWN]
        if not known and self.has_unknown:
            return "UNKNOWN"
        body = " + ".join(t.render() for t in known) if known else "1"
        s = f"O({body})"
        if self.has_unknown:
            s += " (+ unresolved component)"
        return s

    def __str__(self) -> str:
        return self.render()

    def to_dict(self) -> dict:
        return {
            "notation": self.render(),
            "terms": [
                {
                    "kind": t.kind.value,
                    "powers": dict(t.powers),
                    "log_powers": dict(t.log_powers),
                    "exp_base": t.exp_base if t.kind is TermKind.EXPONENTIAL else None,
                    "exp_var": t.exp_var if t.kind is TermKind.EXPONENTIAL else None,
                }
                for t in self.terms if t.kind is not TermKind.UNKNOWN
            ],
            "has_unknown_component": self.has_unknown,
            "unknown_reason": self.unknown_note,
        }
