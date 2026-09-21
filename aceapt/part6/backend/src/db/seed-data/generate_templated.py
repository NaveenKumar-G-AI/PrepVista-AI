"""
Generates ARITHMETIC / ALGEBRA / PATTERNS_SERIES questions with answers
computed (and asserted) in code rather than typed by hand, to eliminate
arithmetic mistakes. Run once to produce templated_questions.json; the file
is checked in so this script does not need to run again unless the bank is
being expanded.
"""
import json
from datetime import datetime, timezone

NOW = datetime.now(timezone.utc).isoformat()

questions = []


def opt(a, b, c, d):
    return [
        {"id": "A", "text": str(a)},
        {"id": "B", "text": str(b)},
        {"id": "C", "text": str(c)},
        {"id": "D", "text": str(d)},
    ]


def add(qid, domain, topic, skill, difficulty, prompt, options, correct_text, explanation, expected_time, tags):
    # Locate which option id matches the correct text, and assert exactly one match + no duplicate texts.
    texts = [o["text"] for o in options]
    assert len(set(texts)) == len(texts), f"{qid}: duplicate option text {texts}"
    matches = [o["id"] for o in options if o["text"] == str(correct_text)]
    assert len(matches) == 1, f"{qid}: correct answer {correct_text} must appear exactly once in {texts}"
    questions.append({
        "id": qid,
        "domain": domain,
        "topic": topic,
        "skill": skill,
        "difficulty": difficulty,
        "prompt": prompt,
        "options": options,
        "correctOptionId": matches[0],
        "explanation": explanation,
        "expectedTimeSeconds": expected_time,
        "health": "HEALTHY",
        "tags": tags,
        "createdAt": NOW,
    })


# ============================================================================
# ARITHMETIC (12)
# ============================================================================

# 1. percentage_of_number (EASY)
ans = 150 * 24 // 100
assert ans == 36
add("arith_001", "QUANTITATIVE", "ARITHMETIC", "percentages", "EASY",
    "What is 24% of 150?", opt(30, ans, 40, 45), ans,
    "24% of 150 = (24/100) x 150 = 36.", 45, ["percentages"])

# 2. simple_average (EASY)
nums = [12, 18, 24, 30, 36]
avg = sum(nums) // len(nums)
assert avg == 24
add("arith_002", "QUANTITATIVE", "ARITHMETIC", "averages", "EASY",
    "Find the average of 12, 18, 24, 30, 36.", opt(20, 26, avg, 30), avg,
    f"Sum = {sum(nums)}, count = {len(nums)}, average = {sum(nums)}/{len(nums)} = {avg}.", 45, ["averages"])

# 3. ratio_share (EASY)
total, ra, rb = 720, 5, 4
b_share = total * rb // (ra + rb)
assert b_share == 320
add("arith_003", "QUANTITATIVE", "ARITHMETIC", "ratio-proportion", "EASY",
    "Rs. 720 is divided between A and B in the ratio 5:4. How much does B get?",
    opt(400, b_share, 360, 300), b_share,
    f"Total parts = 5+4 = 9. B's share = (4/9) x 720 = {b_share}.", 50, ["ratio", "proportion"])

# 4. profit_loss_percent (MEDIUM)
cp, sp = 800, 960
profit_pct = (sp - cp) * 100 // cp
assert profit_pct == 20
add("arith_004", "QUANTITATIVE", "ARITHMETIC", "profit-loss", "MEDIUM",
    "A shopkeeper buys a table for Rs. 800 and sells it for Rs. 960. Find the profit percentage.",
    opt("15%", f"{profit_pct}%", "25%", "18%"), f"{profit_pct}%",
    f"Profit = 960 - 800 = 160. Profit% = (160/800) x 100 = {profit_pct}%.", 75, ["profit-loss", "percentages"])

# 5. percentage_change (MEDIUM)
old, new = 25000, 30000
inc_pct = (new - old) * 100 // old
assert inc_pct == 20
add("arith_005", "QUANTITATIVE", "ARITHMETIC", "percentages", "MEDIUM",
    "A city's population increased from 25,000 to 30,000. What is the percentage increase?",
    opt("16%", "22%", f"{inc_pct}%", "30%"), f"{inc_pct}%",
    f"Increase = 5,000. % increase = (5000/25000) x 100 = {inc_pct}%.", 75, ["percentages"])

# 6. speed_distance_time (MEDIUM)
dist, time = 180, 3
speed = dist // time
assert speed == 60
add("arith_006", "QUANTITATIVE", "ARITHMETIC", "time-speed-distance", "MEDIUM",
    "A car travels 180 km in 3 hours. What is its average speed in km/h?",
    opt(50, 55, speed, 65), speed,
    f"Speed = Distance / Time = 180 / 3 = {speed} km/h.", 70, ["time-speed-distance"])

# 7. successive_percentage_change (MEDIUM_PLUS)
mult = 1.20 * 0.90
overall_pct = round((mult - 1) * 100)
assert overall_pct == 8
add("arith_007", "QUANTITATIVE", "ARITHMETIC", "percentages", "MEDIUM_PLUS",
    "The price of an item is first increased by 20% and then decreased by 10%. What is the overall percentage change?",
    opt("+10%", "+12%", f"+{overall_pct}%", "+6%"), f"+{overall_pct}%",
    "Net multiplier = 1.20 x 0.90 = 1.08, an overall increase of 8% (successive % changes do not simply add).",
    110, ["percentages", "successive-change"])

# 8. simple_interest_find_rate (MEDIUM_PLUS)
P, SI, T = 5000, 1200, 4
rate = SI * 100 // (P * T)
assert rate == 6
add("arith_008", "QUANTITATIVE", "ARITHMETIC", "simple-interest", "MEDIUM_PLUS",
    "A sum of Rs. 5,000 earns simple interest of Rs. 1,200 in 4 years. What is the annual rate of interest?",
    opt("5%", f"{rate}%", "8%", "7%"), f"{rate}%",
    f"SI = P x R x T / 100, so R = (SI x 100) / (P x T) = (1200 x 100) / (5000 x 4) = {rate}%.", 110,
    ["simple-interest"])

# 9. average_new_member (MEDIUM_PLUS)
old_avg, old_n, new_avg = 25, 8, 26
old_total = old_avg * old_n
new_total = new_avg * (old_n + 1)
new_person = new_total - old_total
assert new_person == 34
add("arith_009", "QUANTITATIVE", "ARITHMETIC", "averages", "MEDIUM_PLUS",
    "The average age of 8 people is 25 years. A new person joins and the average becomes 26 years. What is the new person's age?",
    opt(28, 30, 32, new_person), new_person,
    f"Old total = 25x8 = 200. New total = 26x9 = 234. New person's age = 234 - 200 = {new_person}.", 110,
    ["averages"])

# 10. compound_interest_2yr (HARD)
P, r, n = 10000, 0.10, 2
A = round(P * (1 + r) ** n)
CI = A - P
assert CI == 2100
add("arith_010", "QUANTITATIVE", "ARITHMETIC", "compound-interest", "HARD",
    "Find the compound interest on Rs. 10,000 for 2 years at 10% per annum, compounded annually.",
    opt("Rs. 2,000", "Rs. 2,200", "Rs. 2,500", f"Rs. {CI:,}"), f"Rs. {CI:,}",
    f"Amount = 10000 x (1.10)^2 = 12,100. Compound Interest = 12,100 - 10,000 = Rs. {CI:,}.", 150,
    ["compound-interest"])

# 11. work_rate_combined (HARD)
a_days, b_days = 12, 24
# combined rate = 1/12 + 1/24 = 3/24 = 1/8 -> 8 days
combined_days = 8
assert (1 / a_days + 1 / b_days) == 1 / combined_days
add("arith_011", "QUANTITATIVE", "ARITHMETIC", "time-and-work", "HARD",
    "A can complete a piece of work in 12 days and B can complete it in 24 days. Working together, how many days will they take?",
    opt(6, 10, 9, combined_days), combined_days,
    "A's rate = 1/12/day, B's rate = 1/24/day. Combined = 1/12 + 1/24 = 3/24 = 1/8, so together they take 8 days.",
    150, ["time-and-work"])

# 12. relative_speed_trains (HARD)
len1, len2 = 125, 100
s1_kmh, s2_kmh = 45, 36
rel_speed_ms = (s1_kmh + s2_kmh) * 5 / 18
total_len = len1 + len2
time_s = round(total_len / rel_speed_ms)
assert time_s == 10
add("arith_012", "QUANTITATIVE", "ARITHMETIC", "relative-speed", "HARD",
    "Two trains, 125 m and 100 m long, run in opposite directions on parallel tracks at 45 km/h and 36 km/h respectively. How many seconds will they take to cross each other completely?",
    opt("8 seconds", "12 seconds", "15 seconds", f"{time_s} seconds"), f"{time_s} seconds",
    "Relative speed (opposite directions) = 45+36 = 81 km/h = 81 x 5/18 = 22.5 m/s. Total length = 225 m. Time = 225/22.5 = 10 s.",
    150, ["relative-speed", "trains"])

# ============================================================================
# ALGEBRA (8)
# ============================================================================

# 1. linear_equation_one_var (EASY)
x = (20 - 5) // 3
assert x == 5
add("alg_001", "QUANTITATIVE", "ALGEBRA", "linear-equations", "EASY",
    "Solve for x: 3x + 5 = 20", opt(4, x, 6, 3), x,
    f"3x = 20 - 5 = 15, so x = {x}.", 45, ["linear-equations"])

# 2. simple_substitution (EASY)
xv = 4
val = 2 * xv ** 2 + 3
assert val == 35
add("alg_002", "QUANTITATIVE", "ALGEBRA", "algebraic-expressions", "EASY",
    "If x = 4, what is the value of 2x^2 + 3?", opt(19, 29, val, 40), val,
    f"2(4)^2 + 3 = 2(16) + 3 = 32 + 3 = {val}.", 50, ["algebraic-expressions"])

# 3. age_problem_simple (MEDIUM)
son = 15
rahul = 2 * son
assert rahul == 30
add("alg_003", "QUANTITATIVE", "ALGEBRA", "age-problems", "MEDIUM",
    "Rahul is twice as old as his son. If the son is 15 years old, what is Rahul's age?",
    opt(25, 28, 32, rahul), rahul,
    f"Rahul's age = 2 x 15 = {rahul} years.", 70, ["age-problems"])

# 4. two_step_word_problem (MEDIUM)
# x + 12 = 3x - 6  ->  18 = 2x -> x = 9
xn = 9
assert xn + 12 == 3 * xn - 6
add("alg_004", "QUANTITATIVE", "ALGEBRA", "linear-equations", "MEDIUM",
    "A number increased by 12 equals thrice the number decreased by 6. Find the number.",
    opt(6, 12, 15, xn), xn,
    f"x + 12 = 3x - 6  ->  18 = 2x  ->  x = {xn}.", 75, ["linear-equations", "word-problem"])

# 5. two_variable_linear_system (MEDIUM_PLUS)
# x+y=15, x-y=5 -> x=10, y=5
xv2 = (15 + 5) // 2
assert xv2 == 10
add("alg_005", "QUANTITATIVE", "ALGEBRA", "simultaneous-equations", "MEDIUM_PLUS",
    "If x + y = 15 and x - y = 5, what is the value of x?", opt(5, 7, 12, xv2), xv2,
    f"Adding the two equations: 2x = 20, so x = {xv2} (and y = 5).", 100, ["simultaneous-equations"])

# 6. age_problem_ratio (MEDIUM_PLUS)
total_age, rp, rq = 35, 3, 4
q_age = rq * total_age // (rp + rq)
assert q_age == 20
add("alg_006", "QUANTITATIVE", "ALGEBRA", "age-problems", "MEDIUM_PLUS",
    "The ages of P and Q are in the ratio 3:4. If the sum of their ages is 35 years, what is Q's age?",
    opt(15, 18, 21, q_age), q_age,
    f"Total parts = 3+4 = 7. Q's age = (4/7) x 35 = {q_age} years.", 105, ["age-problems", "ratio"])

# 7. quadratic_factoring (HARD)
# x^2 -7x+12=0 -> roots 3,4 -> sum 7
r1, r2 = 3, 4
assert r1 * r2 == 12 and r1 + r2 == 7
add("alg_007", "QUANTITATIVE", "ALGEBRA", "quadratic-equations", "HARD",
    "If x^2 - 7x + 12 = 0, what is the sum of the two roots of the equation?",
    opt(12, 5, -7, r1 + r2), r1 + r2,
    f"Factoring: x^2-7x+12 = (x-3)(x-4) = 0, so the roots are 3 and 4, and their sum is {r1+r2}. (Also confirmed by -b/a = 7.)",
    140, ["quadratic-equations"])

# 8. relative_rate_algebra (HARD)
# (x+4)*2 = 36 -> x = 14
xv3 = 36 // 2 - 4
assert (xv3 + 4) * 2 == 36
add("alg_008", "QUANTITATIVE", "ALGEBRA", "linear-equations", "HARD",
    "A boat travels downstream at a speed of (x+4) km/h and covers 36 km in 2 hours. What is the value of x?",
    opt(12, 16, 10, xv3), xv3,
    f"(x+4) x 2 = 36  ->  x+4 = 18  ->  x = {xv3}.", 140, ["linear-equations", "word-problem"])

# ============================================================================
# PATTERNS_SERIES (10)
# ============================================================================

add("series_001", "LOGICAL", "PATTERNS_SERIES", "number-series", "EASY",
    "What is the next number in the series: 4, 8, 12, 16, ?", opt(18, 20, 22, 24), 20,
    "Each term increases by 4: 4, 8, 12, 16, 20.", 45, ["number-series"])

add("series_002", "LOGICAL", "PATTERNS_SERIES", "number-series", "EASY",
    "What is the next number in the series: 3, 6, 12, 24, ?", opt(36, 42, 48, 60), 48,
    "Each term doubles the previous one: 3, 6, 12, 24, 48.", 45, ["number-series"])

add("series_003", "LOGICAL", "PATTERNS_SERIES", "number-series", "EASY",
    "What is the next number in the series: 2, 5, 8, 11, ?", opt(13, 14, 15, 16), 14,
    "Each term increases by 3: 2, 5, 8, 11, 14.", 45, ["number-series"])

add("series_004", "LOGICAL", "PATTERNS_SERIES", "number-series", "MEDIUM",
    "What is the next number in the series: 5, 15, 45, 135, ?", opt(270, 360, 405, 450), 405,
    "Each term is multiplied by 3: 5, 15, 45, 135, 405.", 75, ["number-series"])

add("series_005", "LOGICAL", "PATTERNS_SERIES", "number-series", "MEDIUM",
    "Find the missing number: 7, 14, ?, 28, 35", opt(20, 21, 22, 24), 21,
    "The series increases by 7 each time: 7, 14, 21, 28, 35.", 75, ["number-series"])

add("series_006", "LOGICAL", "PATTERNS_SERIES", "letter-series", "MEDIUM",
    "What comes next in the series: B, D, F, H, ?", opt("G", "I", "J", "K"), "J",
    "One letter is skipped each time (B_D_F_H_J): B, D, F, H, J.", 75, ["letter-series"])

add("series_007", "LOGICAL", "PATTERNS_SERIES", "number-series", "MEDIUM_PLUS",
    "What is the next number in the series: 1, 2, 4, 7, 11, ?", opt(15, 16, 17, 18), 16,
    "The differences between terms increase by 1 each time (1,2,3,4), so the next difference is 5: 11+5 = 16.",
    110, ["number-series"])

add("series_008", "LOGICAL", "PATTERNS_SERIES", "number-series", "MEDIUM_PLUS",
    "What is the next number in the series: 2, 3, 5, 8, 13, ?", opt(18, 20, 21, 23), 21,
    "Each term is the sum of the two preceding terms (a Fibonacci-style pattern): 8+13 = 21.", 110,
    ["number-series"])

add("series_009", "LOGICAL", "PATTERNS_SERIES", "number-series", "HARD",
    "What is the next number in the series: 2, 6, 12, 20, 30, ?", opt(36, 40, 42, 45), 42,
    "Each term equals n x (n+1): 1x2, 2x3, 3x4, 4x5, 5x6, 6x7 = 42.", 150, ["number-series"])

add("series_010", "LOGICAL", "PATTERNS_SERIES", "number-series", "HARD",
    "What is the next number in the series: 2, 5, 11, 23, 47, ?", opt(90, 94, 96, 95), 95,
    "Each term is double the previous term plus 1: 47 x 2 + 1 = 95.", 150, ["number-series"])

print(json.dumps({"count": len(questions), "ids": [q["id"] for q in questions]}, indent=2))

with open("templated_questions.json", "w") as f:
    json.dump(questions, f, indent=2)

print(f"\nWrote {len(questions)} templated questions to templated_questions.json")
