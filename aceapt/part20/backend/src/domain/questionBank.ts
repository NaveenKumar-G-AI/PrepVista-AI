// Hand-authored, hand-verified seed question bank for the Feature 20 vertical
// slice. In production this is replaced by Feature 17's generation engine —
// see README.md "Integration notes". Every answer below was worked through
// by hand; do not edit correctIndex without re-deriving the arithmetic.

export type Difficulty = "Easy" | "Medium" | "Hard" | "Very Hard";

export interface SeedQuestion {
  slug: string;
  concept: string;
  difficulty: Difficulty;
  prompt: string;
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  explanation: string;
  tags: string[];
}

// Main simulation blueprint: 15 questions, deliberately mixed topics and
// volatile difficulty (Feature 20 §2/§3) — no two consecutive questions
// share a concept, and difficulty does not progress monotonically.
export const MAIN_QUESTIONS: SeedQuestion[] = [
  {
    slug: "pct-election",
    concept: "Percentage",
    difficulty: "Easy",
    prompt:
      "In an election, a candidate secured 60% of the total votes and won by 4,800 votes. What was the total number of votes polled?",
    options: ["22,000", "24,000", "26,000", "20,000"],
    correctIndex: 1,
    explanation: "Winning margin = 60% − 40% = 20% of total = 4,800, so total = 4,800 / 0.20 = 24,000.",
    tags: [],
  },
  {
    slug: "tw-two-pipes",
    concept: "Time & Work",
    difficulty: "Medium",
    prompt:
      "A can complete a task in 12 days and B can complete it in 18 days. Working together, how many days will they take to complete it?",
    options: ["8 days", "6.5 days", "7.2 days", "7.5 days"],
    correctIndex: 2,
    explanation: "Combined rate = 1/12 + 1/18 = 5/36 per day, so time = 36/5 = 7.2 days.",
    tags: [],
  },
  {
    slug: "di-quarterly-sales",
    concept: "Data Interpretation",
    difficulty: "Hard",
    prompt:
      "A company's quarterly sales (₹ lakh) were: Q1 = 40, Q2 = 55, Q3 = 35, Q4 = 70. By how much did Q4 sales exceed the average quarterly sales for the year?",
    options: ["₹15 lakh", "₹25 lakh", "₹30 lakh", "₹20 lakh"],
    correctIndex: 3,
    explanation: "Average = (40+55+35+70)/4 = 50. Q4 exceeds this by 70 − 50 = ₹20 lakh.",
    tags: [],
  },
  {
    slug: "ns-smallest-4digit",
    concept: "Number System",
    difficulty: "Easy",
    prompt: "What is the smallest 4-digit number exactly divisible by 15?",
    options: ["1000", "1005", "1010", "1015"],
    correctIndex: 1,
    explanation: "1000 / 15 ≈ 66.67, so the next multiple of 15 is 67 × 15 = 1005.",
    tags: [],
  },
  {
    slug: "pl-markup-discount-tax",
    concept: "Profit & Loss",
    difficulty: "Very Hard",
    prompt:
      "A trader marks goods 40% above cost price, then gives a 25% discount on the marked price, and finally adds 5% tax on the discounted price. If the cost price is ₹2,000, what does the customer finally pay?",
    options: ["₹2,100", "₹2,150", "₹2,310", "₹2,205"],
    correctIndex: 3,
    explanation: "MP = 2000×1.40 = 2800. After 25% discount: 2800×0.75 = 2100. After 5% tax: 2100×1.05 = ₹2,205.",
    tags: [],
  },
  {
    slug: "ratio-add-ten",
    concept: "Ratio",
    difficulty: "Medium",
    prompt:
      "Two numbers are in the ratio 3:5. When 10 is added to each, the ratio becomes 5:7. Find the smaller of the two original numbers.",
    options: ["12", "15", "18", "20"],
    correctIndex: 1,
    explanation: "Let numbers be 3x, 5x. 7(3x+10) = 5(5x+10) → 21x+70 = 25x+50 → x = 5. Smaller number = 3×5 = 15.",
    tags: [],
  },
  {
    slug: "avg-consecutive-even",
    concept: "Averages",
    difficulty: "Easy",
    prompt: "The average of 5 consecutive even numbers is 24. What is the largest of these numbers?",
    options: ["24", "26", "28", "30"],
    correctIndex: 2,
    explanation: "For 5 consecutive evens the middle number equals the average (24), so the numbers are 20,22,24,26,28.",
    tags: [],
  },
  {
    slug: "prob-two-red-balls",
    concept: "Probability",
    difficulty: "Hard",
    prompt:
      "A bag has 5 red, 4 blue and 3 green balls. Two balls are drawn at random without replacement. What is the probability that both are red?",
    options: ["5/66", "1/6", "10/33", "5/33"],
    correctIndex: 3,
    explanation: "P = C(5,2)/C(12,2) = 10/66 = 5/33.",
    tags: [],
  },
  {
    slug: "alg-x-plus-inverse",
    concept: "Algebra",
    difficulty: "Medium",
    prompt: "If x + 1/x = 5, what is the value of x² + 1/x²?",
    options: ["21", "23", "25", "27"],
    correctIndex: 1,
    explanation: "x² + 1/x² = (x + 1/x)² − 2 = 25 − 2 = 23.",
    tags: [],
  },
  {
    slug: "ns-remainder-7-100",
    concept: "Number System",
    difficulty: "Very Hard",
    prompt: "What is the remainder when 7^100 is divided by 5?",
    options: ["4", "3", "2", "1"],
    correctIndex: 3,
    explanation: "7 mod 5 = 2, and 2^n mod 5 cycles 2,4,3,1 every 4 steps. 100 is a multiple of 4, so remainder = 1.",
    tags: [],
  },
  {
    slug: "pct-up-then-down",
    concept: "Percentage",
    difficulty: "Easy",
    prompt: "A number is increased by 20% and then decreased by 20%. What is the net percentage change?",
    options: ["No change", "2% decrease", "4% increase", "4% decrease"],
    correctIndex: 3,
    explanation: "Net change = −(20×20)/100 = −4%, i.e. a 4% decrease.",
    tags: [],
  },
  {
    slug: "geo-rectangle-perimeter",
    concept: "Geometry",
    difficulty: "Hard",
    prompt:
      "The length of a rectangle is 5 cm more than its width. If the perimeter is 50 cm, find the area of the rectangle.",
    options: ["140 cm²", "150 cm²", "160 cm²", "135 cm²"],
    correctIndex: 1,
    explanation: "4w + 10 = 50 → w = 10, length = 15, area = 10×15 = 150 cm².",
    tags: [],
  },
  {
    slug: "di-cricket-football",
    concept: "Data Interpretation",
    difficulty: "Medium",
    prompt:
      "In a class of 60 students, 35 play cricket, 25 play football, and 10 play both. How many students play neither sport?",
    options: ["5", "10", "15", "20"],
    correctIndex: 1,
    explanation: "At least one sport = 35+25−10 = 50. Neither = 60−50 = 10.",
    tags: [],
  },
  {
    slug: "ratio-chain",
    concept: "Ratio",
    difficulty: "Easy",
    prompt: "If A:B = 2:3 and B:C = 4:5, find A:B:C.",
    options: ["2:3:5", "6:9:10", "8:12:15", "4:6:5"],
    correctIndex: 2,
    explanation: "Scale A:B by 4 → 8:12, scale B:C by 3 → 12:15. Combined: A:B:C = 8:12:15.",
    tags: [],
  },
  {
    slug: "prob-committee-women",
    concept: "Probability",
    difficulty: "Very Hard",
    prompt:
      "A committee of 3 is formed from 5 men and 4 women. What is the probability that the committee has at least 2 women?",
    options: ["1/3", "5/12", "7/18", "17/42"],
    correctIndex: 3,
    explanation: "Total = C(9,3) = 84. Favourable = C(4,2)C(5,1) + C(4,3) = 30 + 4 = 34. P = 34/84 = 17/42.",
    tags: [],
  },
];

// Drill pool: one remedial question per concept (used for concept-focused
// drills) plus tagging for the fixed question-selection drill (Feature 20 §38).
export const DRILL_QUESTIONS: SeedQuestion[] = [
  {
    slug: "drill-pct-original-number",
    concept: "Percentage",
    difficulty: "Easy",
    prompt: "A number is decreased by 25% to get 90. What is the original number?",
    options: ["100", "110", "120", "135"],
    correctIndex: 2,
    explanation: "0.75x = 90 → x = 120.",
    tags: ["selection-drill"],
  },
  {
    slug: "drill-ratio-share",
    concept: "Ratio",
    difficulty: "Easy",
    prompt: "₹720 is divided between A and B in the ratio 5:7. Find B's share.",
    options: ["₹300", "₹360", "₹420", "₹480"],
    correctIndex: 2,
    explanation: "12 parts = 720, 1 part = 60, B = 7×60 = ₹420.",
    tags: [],
  },
  {
    slug: "drill-tw-leak",
    concept: "Time & Work",
    difficulty: "Medium",
    prompt:
      "A pipe fills a tank in 10 hours. With a leak, it takes 12 hours. How long would the leak alone take to empty the full tank?",
    options: ["45 hours", "48 hours", "50 hours", "60 hours"],
    correctIndex: 3,
    explanation: "Leak rate = 1/10 − 1/12 = 1/60 per hour, so it drains the tank alone in 60 hours.",
    tags: ["selection-drill"],
  },
  {
    slug: "drill-prob-die-roll",
    concept: "Probability",
    difficulty: "Easy",
    prompt: "A die is rolled once. What is the probability of getting a number greater than 4?",
    options: ["1/6", "1/3", "1/2", "2/3"],
    correctIndex: 1,
    explanation: "Numbers greater than 4 are {5,6} → 2/6 = 1/3.",
    tags: [],
  },
  {
    slug: "drill-ns-sum-20",
    concept: "Number System",
    difficulty: "Easy",
    prompt: "What is the sum of the first 20 natural numbers?",
    options: ["190", "200", "210", "220"],
    correctIndex: 2,
    explanation: "n(n+1)/2 = 20×21/2 = 210.",
    tags: [],
  },
  {
    slug: "drill-avg-removed-number",
    concept: "Averages",
    difficulty: "Medium",
    prompt:
      "The average of 4 numbers is 20. One number is removed and the average of the remaining 3 becomes 18. What was the removed number?",
    options: ["22", "24", "26", "28"],
    correctIndex: 2,
    explanation: "Sum of 4 = 80, sum of remaining 3 = 54, removed number = 80 − 54 = 26.",
    tags: ["selection-drill"],
  },
  {
    slug: "drill-di-tea-coffee",
    concept: "Data Interpretation",
    difficulty: "Medium",
    prompt:
      "In a survey of 200 people, 120 like tea, 90 like coffee, and 40 like both. How many like neither?",
    options: ["20", "30", "40", "50"],
    correctIndex: 1,
    explanation: "At least one = 120+90−40 = 170. Neither = 200−170 = 30.",
    tags: [],
  },
  {
    slug: "drill-pl-cost-price",
    concept: "Profit & Loss",
    difficulty: "Easy",
    prompt: "An article is sold at a loss of 10% for ₹450. What was the cost price?",
    options: ["₹480", "₹495", "₹500", "₹510"],
    correctIndex: 2,
    explanation: "0.9x = 450 → x = ₹500.",
    tags: [],
  },
  {
    slug: "drill-alg-substitution",
    concept: "Algebra",
    difficulty: "Medium",
    prompt: "If 2x − 3 = 11, find the value of x² − 5.",
    options: ["40", "42", "44", "46"],
    correctIndex: 2,
    explanation: "x = 7, so x² − 5 = 49 − 5 = 44.",
    tags: ["selection-drill"],
  },
  {
    slug: "drill-geo-circle-area",
    concept: "Geometry",
    difficulty: "Easy",
    prompt: "Find the area of a circle with radius 7 cm. (Use π = 22/7)",
    options: ["132 cm²", "144 cm²", "154 cm²", "168 cm²"],
    correctIndex: 2,
    explanation: "Area = (22/7)×7² = 154 cm².",
    tags: [],
  },
];
