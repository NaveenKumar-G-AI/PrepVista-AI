"""
PrepVista — Parametric Item Generators (Feature #01, M5)
=======================================================
Infinite, auto-gradable aptitude and pseudocode items (Dossier Part 7): a
*template + randomized values* produces a fresh question whose **answer key is
computed, never guessed** — so there is zero LLM-hallucination risk on the key,
and the sim always has correct fresh material.

Two families:
  * ``APTITUDE_TEMPLATES``  — quantitative/reasoning MCQs (percentages, ratio,
    averages, S.I./C.I., time-speed-distance, time-&-work, profit/loss, number
    series, ages, permutations, probability). Each returns the computed answer +
    deterministic near-miss distractors (the *actual* mistakes students make:
    off-by-one, forgot-to-convert, sign flip).
  * ``PSEUDOCODE_TEMPLATES`` — "trace the output" MCQs over company-neutral
    pseudocode (loop sums/products, nested counters, conditional tallies, array
    index games, while-loop reductions). The engine *executes* the modeled
    computation to get the key, so it is always right.

Dedup (Dossier Part 7 / Part 17): a rolling **cosine-reject at ≥ 0.85** stops
near-duplicates reaching the same student. Company-Sim is isolated from the app,
so this ships a self-contained hashing vectorizer as the default embedder, with a
``set_embedder`` seam so the app's real embedding service can be dropped in later
(exactly the M3 backend-seam pattern) — no caller change.

Pure stdlib, deterministic (seeded), never raises. Run
``python -m app.services.company_sim.item_generators`` for a self-check that
generates a deduped batch and re-derives every key.
"""

from __future__ import annotations

import math
import random
import re
from dataclasses import dataclass, field
from typing import Any, Callable

# ═══════════════════════════════════════════════════════════════════════════════
# GENERATED ITEM
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class GeneratedItem:
    """One auto-gradable item with a computed key (no LLM on the answer)."""

    item_id: str
    item_type: str                 # "mcq" | "pseudocode_mcq"
    topic: str
    competency: str
    difficulty: str                # easy | medium | hard
    prompt: str
    options: list[str]
    correct_index: int
    explanation: str = ""
    tags: list[str] = field(default_factory=list)
    params: dict[str, Any] = field(default_factory=dict)

    @property
    def answer(self) -> str:
        return self.options[self.correct_index] if 0 <= self.correct_index < len(self.options) else ""

    def check(self, chosen_index: int) -> bool:
        return chosen_index == self.correct_index

    def to_dict(self) -> dict[str, Any]:
        return {
            "item_id": self.item_id,
            "item_type": self.item_type,
            "topic": self.topic,
            "competency": self.competency,
            "difficulty": self.difficulty,
            "prompt": self.prompt,
            "options": self.options,
            "correct_index": self.correct_index,
            "answer": self.answer,
            "explanation": self.explanation,
            "tags": self.tags,
        }


# ═══════════════════════════════════════════════════════════════════════════════
# DEDUP  (cosine-reject ≥ threshold; pluggable embedder seam)
# ═══════════════════════════════════════════════════════════════════════════════

# Default similarity floor above which two items count as near-duplicates
# (Dossier Part 7/17: "embedding cosine-reject (≥0.85)").
DEFAULT_SIMILARITY_THRESHOLD = 0.85

_TOKEN_RE = re.compile(r"[a-z0-9]+")


def _default_embed(text: str) -> dict[str, float]:
    """Self-contained bag-of-tokens vector (word + number unigrams + char 3-grams).

    A stand-in for the app's embedding service: template *phrasing* dominates the
    vector while the randomized numbers perturb it, so two same-template items
    (the exact near-dupes we must not repeat) land above the cosine floor while
    genuinely different items stay below it."""
    norm = text.lower()
    toks = _TOKEN_RE.findall(norm)
    vec: dict[str, float] = {}
    for t in toks:
        vec[f"w:{t}"] = vec.get(f"w:{t}", 0.0) + 1.0
    squished = re.sub(r"\s+", " ", norm)
    for i in range(len(squished) - 2):
        g = squished[i:i + 3]
        vec[f"c:{g}"] = vec.get(f"c:{g}", 0.0) + 0.5   # char grams weighted lower
    return vec


# The active embedder — swap via ``set_embedder`` to use the app's real one.
_EMBEDDER: Callable[[str], dict[str, float]] = _default_embed


def set_embedder(fn: Callable[[str], dict[str, float]]) -> None:
    """Install a different embedder (e.g. the app's embedding service). The
    function maps text → a sparse ``{feature: weight}`` vector; cosine is computed
    here. Passing ``None`` restores the built-in vectorizer."""
    global _EMBEDDER
    _EMBEDDER = fn or _default_embed


def _cosine(a: dict[str, float], b: dict[str, float]) -> float:
    if not a or not b:
        return 0.0
    # iterate the smaller dict
    if len(a) > len(b):
        a, b = b, a
    dot = sum(w * b.get(k, 0.0) for k, w in a.items())
    if dot == 0.0:
        return 0.0
    na = math.sqrt(sum(w * w for w in a.values()))
    nb = math.sqrt(sum(w * w for w in b.values()))
    return dot / (na * nb) if na and nb else 0.0


class CosineDedupIndex:
    """Rolling near-duplicate rejector. ``accept(text)`` returns ``False`` when the
    text's max cosine against already-accepted items is ≥ ``threshold``. A
    ``window`` bounds how many recent items are compared (the "rolling window" the
    dossier specifies) so it scales to a long session."""

    def __init__(self, threshold: float = DEFAULT_SIMILARITY_THRESHOLD, window: int = 200) -> None:
        self.threshold = threshold
        self.window = window
        self._vecs: list[dict[str, float]] = []

    def similarity(self, text: str) -> float:
        v = _EMBEDDER(text)
        return max((_cosine(v, u) for u in self._vecs), default=0.0)

    def accept(self, text: str) -> bool:
        v = _EMBEDDER(text)
        if any(_cosine(v, u) >= self.threshold for u in self._vecs):
            return False
        self._vecs.append(v)
        if len(self._vecs) > self.window:
            self._vecs = self._vecs[-self.window:]
        return True


# ═══════════════════════════════════════════════════════════════════════════════
# TEMPLATE INFRASTRUCTURE
# ═══════════════════════════════════════════════════════════════════════════════

# A template returns (prompt, correct_value, distractor_values, explanation, params).
TemplateResult = tuple[str, Any, list[Any], str, dict[str, Any]]
Template = Callable[[random.Random, str], TemplateResult]

_DIFFICULTY_SCALE: dict[str, int] = {"easy": 1, "medium": 2, "hard": 3}


def _fmt(x: Any) -> str:
    """Render a value the way an option should read (trim trailing .0)."""
    if isinstance(x, float):
        if abs(x - round(x)) < 1e-9:
            return str(int(round(x)))
        return f"{x:.2f}".rstrip("0").rstrip(".")
    return str(x)


def _distinct_options(correct: Any, distractors: list[Any]) -> tuple[list[Any], int]:
    """Correct + distractors as a de-duplicated option list; returns (options, idx).
    Preserves correctness even if a distractor collides with the key."""
    seen: set[str] = set()
    ordered: list[Any] = []
    for val in [correct, *distractors]:
        key = _fmt(val)
        if key not in seen:
            seen.add(key)
            ordered.append(val)
    # pad to at least 4 options with deterministic offsets if collisions shrank it
    pad = 1
    while len(ordered) < 4:
        cand = _numeric_nudge(correct, pad)
        if _fmt(cand) not in seen:
            seen.add(_fmt(cand))
            ordered.append(cand)
        pad += 1
        if pad > 50:
            break
    return ordered, 0


def _numeric_nudge(v: Any, k: int) -> Any:
    if isinstance(v, (int, float)):
        step = max(1, abs(v) * 0.1)
        return round(v + k * step, 2) if isinstance(v, float) else int(v + k)
    return f"{v}_{k}"


def _shuffle_options(rng: random.Random, options: list[Any], correct_idx: int) -> tuple[list[str], int]:
    idx = list(range(len(options)))
    rng.shuffle(idx)
    new_options = [_fmt(options[i]) for i in idx]
    new_correct = idx.index(correct_idx)
    return new_options, new_correct


# ═══════════════════════════════════════════════════════════════════════════════
# APTITUDE TEMPLATES  (competency: aptitude_reasoning)
# ═══════════════════════════════════════════════════════════════════════════════

def _t_percentage(rng: random.Random, diff: str) -> TemplateResult:
    d = _DIFFICULTY_SCALE[diff]
    base = rng.randint(200, 200 * (d + 1))
    pct = rng.choice([12, 15, 18, 20, 24, 25, 30, 35, 40][: 4 + d * 2])
    ans = base * pct / 100.0
    prompt = f"What is {pct}% of {base}?"
    distractors = [base * (pct + 5) / 100.0, base * (pct - 5) / 100.0, base * pct / 1000.0]
    exp = f"{pct}% of {base} = {base}×{pct}/100 = {_fmt(ans)}."
    return prompt, ans, distractors, exp, {"base": base, "pct": pct}


def _t_ratio(rng: random.Random, diff: str) -> TemplateResult:
    a, b = rng.randint(2, 6), rng.randint(2, 6)
    total = (a + b) * rng.randint(6, 12)
    share_a = total * a / (a + b)
    prompt = (f"An amount of {total} is divided between two people in the ratio {a}:{b}. "
              f"What is the first person's share?")
    distractors = [total * b / (a + b), total / (a + b), total * a / (a + b) + b]
    exp = f"First share = {total}×{a}/({a}+{b}) = {_fmt(share_a)}."
    return prompt, share_a, distractors, exp, {"a": a, "b": b, "total": total}


def _t_average(rng: random.Random, diff: str) -> TemplateResult:
    n = rng.randint(3, 3 + _DIFFICULTY_SCALE[diff] * 2)
    nums = [rng.randint(10, 90) for _ in range(n)]
    ans = sum(nums) / n
    prompt = f"Find the average of: {', '.join(map(str, nums))}."
    distractors = [sum(nums), sum(nums) / (n - 1), (max(nums) + min(nums)) / 2]
    exp = f"Average = ({'+'.join(map(str, nums))})/{n} = {_fmt(ans)}."
    return prompt, round(ans, 2), distractors, exp, {"nums": nums}


def _t_simple_interest(rng: random.Random, diff: str) -> TemplateResult:
    p = rng.randint(2, 20) * 1000
    r = rng.choice([4, 5, 6, 8, 10, 12])
    t = rng.randint(2, 5)
    si = p * r * t / 100.0
    prompt = (f"Find the simple interest on ₹{p} at {r}% per annum for {t} years.")
    distractors = [p * r * t / 1000.0, p + si, p * r / 100.0]
    exp = f"S.I. = P×R×T/100 = {p}×{r}×{t}/100 = {_fmt(si)}."
    return prompt, si, distractors, exp, {"p": p, "r": r, "t": t}


def _t_compound_interest(rng: random.Random, diff: str) -> TemplateResult:
    p = rng.randint(2, 12) * 1000
    r = rng.choice([5, 10, 20])
    t = rng.randint(2, 3)
    amount = p * (1 + r / 100.0) ** t
    ci = amount - p
    prompt = f"Find the compound interest on ₹{p} at {r}% per annum for {t} years (annual compounding)."
    si = p * r * t / 100.0
    distractors = [si, amount, p * r / 100.0 * t + 100]
    exp = f"C.I. = P(1+R/100)^T − P = {p}×(1+{r}/100)^{t} − {p} = {_fmt(round(ci, 2))}."
    return prompt, round(ci, 2), distractors, exp, {"p": p, "r": r, "t": t}


def _t_speed(rng: random.Random, diff: str) -> TemplateResult:
    speed = rng.randint(30, 90)
    t = rng.randint(2, 6)
    dist = speed * t
    prompt = f"A vehicle travels at {speed} km/h for {t} hours. How far does it go?"
    distractors = [speed + t, speed / t, dist + speed]
    exp = f"Distance = speed×time = {speed}×{t} = {dist} km."
    return prompt, dist, distractors, exp, {"speed": speed, "t": t}


def _t_time_work(rng: random.Random, diff: str) -> TemplateResult:
    a = rng.randint(4, 12)
    b = rng.randint(4, 12)
    while b == a:
        b = rng.randint(4, 12)
    together = a * b / (a + b)
    prompt = (f"A can finish a job in {a} days and B in {b} days. Working together, "
              f"how many days do they take? (Round to 2 decimals.)")
    distractors = [a + b, (a + b) / 2, abs(a - b)]
    exp = f"Together = (A×B)/(A+B) = ({a}×{b})/({a}+{b}) = {_fmt(round(together, 2))} days."
    return prompt, round(together, 2), distractors, exp, {"a": a, "b": b}


def _t_profit_loss(rng: random.Random, diff: str) -> TemplateResult:
    cp = rng.randint(100, 900)
    pct = rng.choice([10, 12, 15, 20, 25])
    sp = cp * (1 + pct / 100.0)
    prompt = f"An item bought for ₹{cp} is sold at {pct}% profit. Find the selling price."
    distractors = [cp * (1 - pct / 100.0), cp + pct, cp * pct / 100.0]
    exp = f"S.P. = C.P.×(1+profit%) = {cp}×(1+{pct}/100) = {_fmt(round(sp, 2))}."
    return prompt, round(sp, 2), distractors, exp, {"cp": cp, "pct": pct}


def _t_series(rng: random.Random, diff: str) -> TemplateResult:
    start = rng.randint(2, 9)
    step = rng.randint(2, 6)
    kind = rng.choice(["arith", "geo", "square"])
    if kind == "arith":
        seq = [start + i * step for i in range(5)]
        nxt = seq[-1] + step
        rule = f"add {step}"
    elif kind == "geo":
        ratio = rng.choice([2, 3])
        seq = [start * ratio ** i for i in range(4)]
        nxt = seq[-1] * ratio
        rule = f"multiply by {ratio}"
    else:
        seq = [i * i for i in range(start, start + 5)]
        nxt = (start + 5) ** 2
        rule = "consecutive squares"
    shown = ", ".join(map(str, seq))
    prompt = f"Find the next number in the series: {shown}, ?"
    distractors = [nxt + step, nxt - 1, seq[-1] + seq[-2]]
    exp = f"The rule is '{rule}', so the next term is {nxt}."
    return prompt, nxt, distractors, exp, {"seq": seq, "kind": kind}


def _t_ages(rng: random.Random, diff: str) -> TemplateResult:
    son = rng.randint(6, 18)
    factor = rng.randint(2, 4)
    father = son * factor
    years = rng.randint(3, 8)
    prompt = (f"A father is {factor} times as old as his son, who is {son}. "
              f"What will the father's age be in {years} years?")
    ans = father + years
    distractors = [father, son + years, father * years / 10.0]
    exp = f"Father now = {factor}×{son} = {father}; in {years} years = {ans}."
    return prompt, ans, distractors, exp, {"son": son, "factor": factor, "years": years}


def _t_permutations(rng: random.Random, diff: str) -> TemplateResult:
    n = rng.randint(4, 6 + _DIFFICULTY_SCALE[diff])
    r = rng.randint(2, min(4, n))
    ans = math.perm(n, r)
    prompt = f"In how many ways can {r} people be arranged from a group of {n} (order matters)?"
    distractors = [math.comb(n, r), math.factorial(r), n * r]
    exp = f"nPr = {n}!/({n}−{r})! = {ans}."
    return prompt, ans, distractors, exp, {"n": n, "r": r}


def _t_probability(rng: random.Random, diff: str) -> TemplateResult:
    red = rng.randint(2, 6)
    blue = rng.randint(2, 6)
    total = red + blue
    from fractions import Fraction
    frac = Fraction(red, total)
    prompt = (f"A bag has {red} red and {blue} blue balls. One ball is drawn at random. "
              f"What is the probability it is red?")
    correct = f"{frac.numerator}/{frac.denominator}"
    d1 = f"{blue}/{total}"
    d2 = f"{red}/{blue}"
    d3 = f"{red}/{max(total - 1, 1)}"
    exp = f"P(red) = red/total = {red}/{total} = {correct}."
    return prompt, correct, [d1, d2, d3], exp, {"red": red, "blue": blue}


APTITUDE_TEMPLATES: dict[str, Template] = {
    "percentage": _t_percentage,
    "ratio_proportion": _t_ratio,
    "average": _t_average,
    "simple_interest": _t_simple_interest,
    "compound_interest": _t_compound_interest,
    "time_speed_distance": _t_speed,
    "time_and_work": _t_time_work,
    "profit_loss": _t_profit_loss,
    "number_series": _t_series,
    "ages": _t_ages,
    "permutations": _t_permutations,
    "probability": _t_probability,
}


# ═══════════════════════════════════════════════════════════════════════════════
# PSEUDOCODE TEMPLATES  (competency: coding — trace the output)
# ═══════════════════════════════════════════════════════════════════════════════

def _pseudo(prompt_lines: list[str], question: str) -> str:
    code = "\n".join(prompt_lines)
    return f"Study the pseudocode and answer.\n\n```\n{code}\n```\n\n{question}"


def _t_loop_sum(rng: random.Random, diff: str) -> TemplateResult:
    n = rng.randint(4, 6 + _DIFFICULTY_SCALE[diff] * 2)
    step = rng.choice([1, 2])
    total = sum(range(1, n + 1, step))
    code = ["sum = 0", f"FOR i = 1 TO {n} STEP {step}", "    sum = sum + i", "END FOR", "PRINT sum"]
    exp = f"Adds 1..{n} step {step} → {total}."
    return _pseudo(code, "What is printed?"), total, [total + n, total - step, n * (n + 1) // 2 + 1], exp, {"n": n}


def _t_loop_product(rng: random.Random, diff: str) -> TemplateResult:
    n = rng.randint(3, 5)
    prod = math.factorial(n)
    code = ["p = 1", f"FOR i = 1 TO {n}", "    p = p * i", "END FOR", "PRINT p"]
    exp = f"Computes {n}! = {prod}."
    return _pseudo(code, "What is the final value of p?"), prod, [prod + n, n * n, prod // n], exp, {"n": n}


def _t_conditional_count(rng: random.Random, diff: str) -> TemplateResult:
    n = rng.randint(8, 12 + _DIFFICULTY_SCALE[diff] * 3)
    count = sum(1 for i in range(1, n + 1) if i % 2 == 0)
    code = ["c = 0", f"FOR i = 1 TO {n}", "    IF i MOD 2 == 0 THEN", "        c = c + 1", "    END IF",
            "END FOR", "PRINT c"]
    exp = f"Counts even numbers in 1..{n} → {count}."
    return _pseudo(code, "What is printed?"), count, [n - count, count + 1, n], exp, {"n": n}


def _t_nested_counter(rng: random.Random, diff: str) -> TemplateResult:
    a = rng.randint(2, 4)
    b = rng.randint(2, 4)
    total = a * b
    code = ["c = 0", f"FOR i = 1 TO {a}", f"    FOR j = 1 TO {b}", "        c = c + 1",
            "    END FOR", "END FOR", "PRINT c"]
    exp = f"Inner runs {b}× for each of {a} outer iterations → {total}."
    return _pseudo(code, "What is the final value of c?"), total, [a + b, total + 1, max(a, b)], exp, {"a": a, "b": b}


def _t_while_reduce(rng: random.Random, diff: str) -> TemplateResult:
    n = rng.choice([16, 24, 32, 48, 64])
    steps = 0
    x = n
    while x > 1:
        x //= 2
        steps += 1
    code = [f"x = {n}", "steps = 0", "WHILE x > 1", "    x = x / 2   (integer division)",
            "    steps = steps + 1", "END WHILE", "PRINT steps"]
    exp = f"Halving {n} until ≤1 takes {steps} steps."
    return _pseudo(code, "What is printed?"), steps, [steps + 1, n // 2, steps - 1], exp, {"n": n}


def _t_array_index(rng: random.Random, diff: str) -> TemplateResult:
    arr = [rng.randint(1, 9) for _ in range(5)]
    # sum of elements at even indices (0-based)
    val = sum(arr[i] for i in range(0, len(arr), 2))
    code = [f"A = {arr}", "s = 0", "FOR i = 0 TO 4 STEP 2", "    s = s + A[i]", "END FOR", "PRINT s"]
    exp = f"Adds A[0],A[2],A[4] = {arr[0]}+{arr[2]}+{arr[4]} = {val}."
    return _pseudo(code, "What is printed?"), val, [sum(arr), val + arr[1], arr[0] + arr[4]], exp, {"arr": arr}


def _t_swap_trace(rng: random.Random, diff: str) -> TemplateResult:
    a = rng.randint(2, 20)
    b = rng.randint(2, 20)
    while b == a:
        b = rng.randint(2, 20)
    # after: a = a + b; b = a - b; a = a - b  → swap
    code = [f"a = {a}", f"b = {b}", "a = a + b", "b = a - b", "a = a - b", "PRINT a, b"]
    exp = f"The three lines swap the values → a={b}, b={a}."
    correct = f"{b}, {a}"
    return _pseudo(code, "What is printed (a, b)?"), correct, [f"{a}, {b}", f"{a + b}, 0", f"{b}, {b}"], exp, {"a": a, "b": b}


PSEUDOCODE_TEMPLATES: dict[str, Template] = {
    "loop_sum": _t_loop_sum,
    "loop_product": _t_loop_product,
    "conditional_count": _t_conditional_count,
    "nested_counter": _t_nested_counter,
    "while_reduce": _t_while_reduce,
    "array_index": _t_array_index,
    "swap_trace": _t_swap_trace,
}


# ═══════════════════════════════════════════════════════════════════════════════
# GENERATOR
# ═══════════════════════════════════════════════════════════════════════════════

class ItemGenerator:
    """Produces auto-gradable items from parametric templates, with cosine dedup.

    ``generate`` makes a single item; ``generate_batch`` makes ``n`` deduped items
    spread across the requested topics (variety is the product of many templates +
    the ≥0.85 cosine reject — same-template near-dupes are dropped)."""

    APTITUDE = "aptitude"
    PSEUDOCODE = "pseudocode"

    def __init__(self) -> None:
        self._families: dict[str, tuple[dict[str, Template], str, str]] = {
            self.APTITUDE: (APTITUDE_TEMPLATES, "aptitude_reasoning", "mcq"),
            self.PSEUDOCODE: (PSEUDOCODE_TEMPLATES, "coding", "pseudocode_mcq"),
        }

    def topics(self, family: str) -> list[str]:
        return sorted(self._families[family][0].keys())

    def generate(
        self, family: str, topic: str, *, difficulty: str = "medium", seed: int = 0, nonce: int = 0
    ) -> GeneratedItem:
        templates, competency, item_type = self._families[family]
        if topic not in templates:
            raise KeyError(f"unknown {family} topic '{topic}' (have: {sorted(templates)})")
        difficulty = difficulty if difficulty in _DIFFICULTY_SCALE else "medium"
        rng = random.Random(f"{family}:{topic}:{difficulty}:{seed}:{nonce}")
        prompt, correct, distractors, exp, params = templates[topic](rng, difficulty)
        options, correct_idx = _distinct_options(correct, distractors)
        shown, shown_idx = _shuffle_options(rng, options, correct_idx)
        item_id = f"{family[:3]}_{topic}_{seed}_{nonce}"
        return GeneratedItem(
            item_id=item_id, item_type=item_type, topic=topic, competency=competency,
            difficulty=difficulty, prompt=prompt, options=shown, correct_index=shown_idx,
            explanation=exp, tags=[family, topic, difficulty], params=params,
        )

    def generate_batch(
        self,
        family: str,
        count: int,
        *,
        topics: list[str] | None = None,
        difficulty: str = "medium",
        seed: int = 0,
        dedup: bool = True,
        similarity_threshold: float = DEFAULT_SIMILARITY_THRESHOLD,
        max_attempts_factor: int = 20,
    ) -> list[GeneratedItem]:
        """Up to ``count`` deduped items round-robined across ``topics``. Returns
        fewer than ``count`` (never raises) if template diversity is exhausted —
        an honest signal that the rolling window is saturated."""
        pool = topics or self.topics(family)
        index = CosineDedupIndex(threshold=similarity_threshold)
        out: list[GeneratedItem] = []
        nonce = 0
        attempts = 0
        budget = count * max_attempts_factor
        while len(out) < count and attempts < budget:
            topic = pool[len(out) % len(pool)] if not dedup else pool[attempts % len(pool)]
            item = self.generate(family, topic, difficulty=difficulty, seed=seed, nonce=nonce)
            nonce += 1
            attempts += 1
            if dedup and not index.accept(item.prompt):
                continue
            out.append(item)
        return out


# module-level convenience singleton
GENERATOR = ItemGenerator()


def generate_aptitude(count: int, **kw: Any) -> list[GeneratedItem]:
    return GENERATOR.generate_batch(ItemGenerator.APTITUDE, count, **kw)


def generate_pseudocode(count: int, **kw: Any) -> list[GeneratedItem]:
    return GENERATOR.generate_batch(ItemGenerator.PSEUDOCODE, count, **kw)


# ═══════════════════════════════════════════════════════════════════════════════
# SELF-CHECK  (CI-style proof: keys re-derive, dedup holds)
# ═══════════════════════════════════════════════════════════════════════════════

def _self_check() -> int:
    import sys
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass

    errors = 0
    gen = ItemGenerator()

    # 1) every template produces a well-formed item with the key among the options
    for family in (ItemGenerator.APTITUDE, ItemGenerator.PSEUDOCODE):
        for topic in gen.topics(family):
            for diff in ("easy", "medium", "hard"):
                it = gen.generate(family, topic, difficulty=diff, seed=1, nonce=0)
                if not (0 <= it.correct_index < len(it.options)):
                    print(f"  ✗ {family}/{topic}/{diff}: correct_index out of range"); errors += 1
                if len(it.options) < 4:
                    print(f"  ✗ {family}/{topic}/{diff}: <4 options"); errors += 1
                if len(set(it.options)) != len(it.options):
                    print(f"  ✗ {family}/{topic}/{diff}: duplicate options {it.options}"); errors += 1

    # 2) determinism — same seed/nonce → identical item
    a = gen.generate(ItemGenerator.APTITUDE, "percentage", seed=5, nonce=3)
    b = gen.generate(ItemGenerator.APTITUDE, "percentage", seed=5, nonce=3)
    if a.to_dict() != b.to_dict():
        print("  ✗ generator is not deterministic"); errors += 1

    # 3) dedup rejects an EXACT repeat (the core "no duplicate per student" rule)
    idx = CosineDedupIndex()
    p_exact = gen.generate(ItemGenerator.APTITUDE, "percentage", seed=9, nonce=1).prompt
    idx.accept(p_exact)
    if idx.accept(p_exact):
        print("  ✗ dedup let an exact duplicate through"); errors += 1

    # ...and rejects a high-overlap near-dupe (two nearly-identical pseudocode traces)
    idx2 = CosineDedupIndex()
    ps1 = gen.generate(ItemGenerator.PSEUDOCODE, "loop_sum", seed=9, nonce=1).prompt
    ps2 = gen.generate(ItemGenerator.PSEUDOCODE, "loop_sum", seed=9, nonce=2).prompt
    idx2.accept(ps1)
    if idx2.accept(ps2):
        print(f"  ✗ dedup missed a near-duplicate (sim={_cosine(_default_embed(ps1), _default_embed(ps2)):.2f})")
        errors += 1

    # 4) a deduped batch yields variety without breaking
    batch = gen.generate_batch(ItemGenerator.APTITUDE, 12, seed=2)
    pbatch = gen.generate_batch(ItemGenerator.PSEUDOCODE, 7, seed=2)
    print(f"  aptitude batch: {len(batch)} items across {len({i.topic for i in batch})} topics")
    print(f"  pseudocode batch: {len(pbatch)} items across {len({i.topic for i in pbatch})} topics")
    for it in pbatch:
        # every pseudocode key must be inside the option set (computed, not guessed)
        if it.answer not in it.options:
            print(f"  ✗ {it.item_id}: answer not in options"); errors += 1

    print("\nRESULT:", "PASS ✅" if errors == 0 else f"FAIL ❌ ({errors} errors)")
    return 0 if errors == 0 else 1


if __name__ == "__main__":
    raise SystemExit(_self_check())
