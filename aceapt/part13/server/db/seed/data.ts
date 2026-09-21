export const TOPIC_SLUGS = ["quant", "logical", "data", "verbal", "technical"] as const;
export type TopicSlug = (typeof TOPIC_SLUGS)[number];

export const TOPIC_DEFS: Record<TopicSlug, { name: string; category: string }> = {
  quant: { name: "Quantitative Aptitude", category: "quant" },
  logical: { name: "Logical Reasoning", category: "logical" },
  data: { name: "Data Interpretation", category: "data" },
  verbal: { name: "Verbal Ability", category: "verbal" },
  technical: { name: "Technical Aptitude", category: "technical" },
};

export type Difficulty = "easy" | "medium" | "hard";

export interface QuestionDef {
  topic: TopicSlug;
  skill: string;
  difficulty: Difficulty;
  prompt: string;
  options: { id: string; text: string }[];
  correctOptionId: string;
  explanation: string;
  expectedTimeSeconds: number;
}

const opts = (a: string, b: string, c: string, d: string) => [
  { id: "a", text: a },
  { id: "b", text: b },
  { id: "c", text: c },
  { id: "d", text: d },
];

const TIME = { easy: 45, medium: 75, hard: 110 } as const;

export const QUESTION_DEFS: QuestionDef[] = [
  // --- Quantitative Aptitude -------------------------------------------------
  { topic: "quant", skill: "Percentages", difficulty: "easy", expectedTimeSeconds: TIME.easy,
    prompt: "A shopkeeper marks an item at ₹500 and offers a 20% discount. What is the selling price?",
    options: opts("₹400", "₹450", "₹380", "₹420"), correctOptionId: "a",
    explanation: "20% of 500 is 100, so selling price = 500 - 100 = ₹400." },
  { topic: "quant", skill: "Percentages", difficulty: "easy", expectedTimeSeconds: TIME.easy,
    prompt: "What is 15% of 200?", options: opts("30", "25", "35", "20"), correctOptionId: "a",
    explanation: "15% of 200 = 0.15 × 200 = 30." },
  { topic: "quant", skill: "Speed, Time & Distance", difficulty: "easy", expectedTimeSeconds: TIME.easy,
    prompt: "If a train travels 60 km in 1.5 hours, what is its speed in km/h?",
    options: opts("40", "45", "35", "50"), correctOptionId: "a", explanation: "Speed = distance / time = 60 / 1.5 = 40 km/h." },
  { topic: "quant", skill: "Fractions", difficulty: "easy", expectedTimeSeconds: TIME.easy,
    prompt: "What is 3/4 expressed as a percentage?", options: opts("75%", "70%", "80%", "65%"), correctOptionId: "a",
    explanation: "3/4 = 0.75 = 75%." },
  { topic: "quant", skill: "Averages", difficulty: "medium", expectedTimeSeconds: TIME.medium,
    prompt: "The average of 5 numbers is 20. If one number is excluded, the average of the remaining 4 becomes 18. What was the excluded number?",
    options: opts("28", "22", "24", "26"), correctOptionId: "a",
    explanation: "Sum of 5 = 100, sum of remaining 4 = 72, excluded = 100 - 72 = 28." },
  { topic: "quant", skill: "Simple Interest", difficulty: "medium", expectedTimeSeconds: TIME.medium,
    prompt: "A sum of money doubles itself in 8 years at simple interest. What is the rate of interest per annum?",
    options: opts("12.5%", "10%", "8%", "15%"), correctOptionId: "a",
    explanation: "For doubling under SI: Rate = 100 / Time = 100/8 = 12.5%." },
  { topic: "quant", skill: "Pipes & Cisterns", difficulty: "medium", expectedTimeSeconds: TIME.medium,
    prompt: "Two pipes can fill a tank in 12 and 15 hours respectively. If both are opened together, how long will it take to fill the tank?",
    options: opts("6 hours 40 minutes", "7 hours", "6 hours", "8 hours"), correctOptionId: "a",
    explanation: "Combined rate = 1/12 + 1/15 = 9/60, time = 60/9 ≈ 6h 40m." },
  { topic: "quant", skill: "Time & Work", difficulty: "medium", expectedTimeSeconds: TIME.medium,
    prompt: "A can complete a work in 10 days, B in 15 days. Working together, how many days will they take?",
    options: opts("6 days", "5 days", "7 days", "8 days"), correctOptionId: "a",
    explanation: "Combined rate = 1/10 + 1/15 = 1/6, so 6 days." },
  { topic: "quant", skill: "Speed, Time & Distance", difficulty: "medium", expectedTimeSeconds: TIME.medium,
    prompt: "A car covers a distance in 5 hours at 60 km/h. How long will it take to cover the same distance at 75 km/h?",
    options: opts("4 hours", "4.5 hours", "3.5 hours", "5 hours"), correctOptionId: "a",
    explanation: "Distance = 300 km; time at 75 km/h = 300/75 = 4 hours." },
  { topic: "quant", skill: "Ratio & Proportion", difficulty: "hard", expectedTimeSeconds: TIME.hard,
    prompt: "The ratio of two numbers is 3:4 and their LCM is 180. Find the sum of the numbers.",
    options: opts("105", "98", "112", "120"), correctOptionId: "a",
    explanation: "Numbers = 3x, 4x; LCM = 12x = 180 → x = 15; numbers 45 & 60; sum = 105." },
  { topic: "quant", skill: "Mixtures & Alligations", difficulty: "hard", expectedTimeSeconds: TIME.hard,
    prompt: "A trader mixes 26 kg of rice at ₹20/kg with 30 kg of rice at ₹36/kg. Find the average price per kg of the mixture (nearest rupee).",
    options: opts("₹29", "₹27", "₹31", "₹25"), correctOptionId: "a",
    explanation: "(26×20 + 30×36) / 56 = 1600/56 ≈ ₹28.6 ≈ ₹29." },
  { topic: "quant", skill: "Permutations & Combinations", difficulty: "hard", expectedTimeSeconds: TIME.hard,
    prompt: "In how many ways can 5 people be seated in a row such that two particular people always sit together?",
    options: opts("48", "24", "60", "120"), correctOptionId: "a",
    explanation: "Treat the pair as one unit: 4! arrangements × 2! internal orders = 24 × 2 = 48." },

  // --- Logical Reasoning ------------------------------------------------------
  { topic: "logical", skill: "Classification", difficulty: "easy", expectedTimeSeconds: TIME.easy,
    prompt: "Find the odd one out: Apple, Banana, Carrot, Mango", options: opts("Carrot", "Apple", "Banana", "Mango"),
    correctOptionId: "a", explanation: "Carrot is a vegetable; the others are fruits." },
  { topic: "logical", skill: "Number Series", difficulty: "easy", expectedTimeSeconds: TIME.easy,
    prompt: "Complete the series: 2, 4, 8, 16, __", options: opts("32", "24", "30", "36"), correctOptionId: "a",
    explanation: "Each term doubles the previous one: 16 × 2 = 32." },
  { topic: "logical", skill: "Number Series", difficulty: "easy", expectedTimeSeconds: TIME.easy,
    prompt: "Which number should replace the question mark? 3, 6, 11, 18, 27, ?",
    options: opts("38", "36", "40", "35"), correctOptionId: "a",
    explanation: "Differences are 3,5,7,9,11 — next term = 27 + 11 = 38." },
  { topic: "logical", skill: "Coding-Decoding", difficulty: "medium", expectedTimeSeconds: TIME.medium,
    prompt: "If FLOWER is coded as GMPXFS, how is CODED coded?",
    options: opts("DPEFE", "DPFEE", "DPEEF", "DPFFE"), correctOptionId: "a",
    explanation: "Each letter is shifted forward by one: C→D, O→P, D→E, E→F, D→E = DPEFE." },
  { topic: "logical", skill: "Coding-Decoding", difficulty: "medium", expectedTimeSeconds: TIME.medium,
    prompt: "In a certain code, 'PAPER' is written as 'QBQFS'. How is 'PENCIL' written in that code?",
    options: opts("QFODJM", "QFODJM", "QEODJM", "QFOCJM"), correctOptionId: "a",
    explanation: "Each letter shifts forward by one: P→Q, E→F, N→O, C→D, I→J, L→M = QFODJM." },
  { topic: "logical", skill: "Syllogism", difficulty: "medium", expectedTimeSeconds: TIME.medium,
    prompt: "Statements: All pens are pencils. All pencils are erasers. Conclusion: All pens are erasers. Is the conclusion valid?",
    options: opts("Valid", "Invalid", "Cannot be determined", "Partially valid"), correctOptionId: "a",
    explanation: "This is a valid chain syllogism (A⊆B, B⊆C ⟹ A⊆C)." },
  { topic: "logical", skill: "Blood Relations", difficulty: "medium", expectedTimeSeconds: TIME.medium,
    prompt: "A is the brother of B. B is the sister of C. C is the father of D. How is A related to D?",
    options: opts("Uncle", "Father", "Brother", "Grandfather"), correctOptionId: "a",
    explanation: "A is C's sibling, and C is D's father, so A is D's uncle." },
  { topic: "logical", skill: "Direction Sense", difficulty: "medium", expectedTimeSeconds: TIME.medium,
    prompt: "A man walks 5 km East, then 3 km South, then 5 km West. How far is he from his starting point?",
    options: opts("3 km", "5 km", "8 km", "13 km"), correctOptionId: "a",
    explanation: "East and West cancel out (5-5=0); only the 3 km South displacement remains." },
  { topic: "logical", skill: "Blood Relations", difficulty: "hard", expectedTimeSeconds: TIME.hard,
    prompt: "Pointing to a photograph, a man says, 'She is the daughter of my grandfather's only son.' How is the woman related to the man (assume the man is not the son)?",
    options: opts("Sister", "Cousin", "Niece", "Daughter"), correctOptionId: "a",
    explanation: "The grandfather's only son is the man's father, so the woman is the man's sister." },
  { topic: "logical", skill: "Pattern Recognition", difficulty: "hard", expectedTimeSeconds: TIME.hard,
    prompt: "Find the odd one out: 8-64, 5-25, 6-42, 9-81", options: opts("6-42", "8-64", "5-25", "9-81"),
    correctOptionId: "a", explanation: "Each pair is n and n²; 6² = 36, not 42 — the others hold." },
  { topic: "logical", skill: "Age Problems", difficulty: "hard", expectedTimeSeconds: TIME.hard,
    prompt: "A is twice as old as B was two years ago. The difference between their present ages is 2 years. What is A's present age?",
    options: opts("8", "10", "6", "12"), correctOptionId: "a",
    explanation: "Let B's age 2 years ago = x. A now = 2x, B now = x+2. 2x-(x+2)=2 → x=4, A=8." },
  { topic: "logical", skill: "Seating/Position", difficulty: "hard", expectedTimeSeconds: TIME.hard,
    prompt: "In a row of 40 students, X is 12th from the left end. What is X's position from the right end?",
    options: opts("29th", "28th", "30th", "27th"), correctOptionId: "a", explanation: "Position from right = 40 - 12 + 1 = 29." },

  // --- Data Interpretation -----------------------------------------------------
  { topic: "data", skill: "Reading Tables", difficulty: "easy", expectedTimeSeconds: TIME.easy,
    prompt: "A company's sales (units) over 4 months: Jan=100, Feb=150, Mar=120, Apr=180. In which month were sales highest?",
    options: opts("April", "February", "March", "January"), correctOptionId: "a", explanation: "180 in April is the highest value." },
  { topic: "data", skill: "Reading Tables", difficulty: "easy", expectedTimeSeconds: TIME.easy,
    prompt: "Using the same monthly sales (Jan=100, Feb=150, Mar=120, Apr=180), what is the total sales over the 4 months?",
    options: opts("550", "500", "600", "520"), correctOptionId: "a", explanation: "100+150+120+180 = 550." },
  { topic: "data", skill: "Percentage Change", difficulty: "easy", expectedTimeSeconds: TIME.easy,
    prompt: "A company's monthly expenses are ₹40,000 on rent and ₹60,000 on salaries. What fraction of total expenses is rent?",
    options: opts("2/5", "1/3", "1/2", "3/5"), correctOptionId: "a", explanation: "Total = 100,000; rent fraction = 40,000/100,000 = 2/5." },
  { topic: "data", skill: "Percentage Change", difficulty: "medium", expectedTimeSeconds: TIME.medium,
    prompt: "Using sales Jan=100, Feb=150, Mar=120, Apr=180 — what is the percentage increase in sales from Jan to Feb?",
    options: opts("50%", "40%", "60%", "45%"), correctOptionId: "a", explanation: "(150-100)/100 × 100 = 50%." },
  { topic: "data", skill: "Pie Charts", difficulty: "medium", expectedTimeSeconds: TIME.medium,
    prompt: "A pie chart shows expenses: Salaries 40%, Rent 20%, Marketing 25%, Others 15%. If total expenses are ₹10,00,000, how much is spent on Marketing?",
    options: opts("₹2,50,000", "₹2,00,000", "₹3,00,000", "₹1,50,000"), correctOptionId: "a",
    explanation: "25% of 10,00,000 = 2,50,000." },
  { topic: "data", skill: "Set Theory", difficulty: "medium", expectedTimeSeconds: TIME.medium,
    prompt: "In a class of 50 students, 30 play cricket, 20 play football, and 10 play both. How many play neither?",
    options: opts("10", "5", "15", "0"), correctOptionId: "a", explanation: "At least one = 30+20-10=40; neither = 50-40=10." },
  { topic: "data", skill: "Set Theory", difficulty: "medium", expectedTimeSeconds: TIME.medium,
    prompt: "A survey of 200 people found 120 prefer tea, 90 prefer coffee, and 30 prefer neither. How many prefer both?",
    options: opts("40", "30", "50", "20"), correctOptionId: "a",
    explanation: "At least one = 200-30=170; both = 120+90-170 = 40." },
  { topic: "data", skill: "Statistics", difficulty: "hard", expectedTimeSeconds: TIME.hard,
    prompt: "A dataset has values 10, 20, 30, 40, 50. What is the median?", options: opts("30", "25", "35", "20"),
    correctOptionId: "a", explanation: "The middle value of the ordered set is 30." },
  { topic: "data", skill: "Growth Rates", difficulty: "hard", expectedTimeSeconds: TIME.hard,
    prompt: "Revenue grew from ₹80 lakh to ₹125 lakh over 3 years. What is the approximate compound annual growth rate (CAGR)?",
    options: opts("~16%", "~20%", "~12%", "~25%"), correctOptionId: "a",
    explanation: "(125/80)^(1/3) - 1 ≈ 1.161 - 1 ≈ 16%." },
  { topic: "data", skill: "Bar Charts", difficulty: "hard", expectedTimeSeconds: TIME.hard,
    prompt: "Product A sold 240 units and Product B sold 180 units in Q1. In Q2, A grew by 25% and B declined by 10%. What is the new combined total?",
    options: opts("462", "440", "480", "450"), correctOptionId: "a",
    explanation: "A: 240×1.25=300; B: 180×0.9=162; total = 462." },
  { topic: "data", skill: "Statistics", difficulty: "hard", expectedTimeSeconds: TIME.hard,
    prompt: "A dataset has mean 50 and standard deviation 5. Approximately what percentage lies between 45 and 55, assuming a normal distribution?",
    options: opts("~68%", "~95%", "~50%", "~99%"), correctOptionId: "a", explanation: "45 to 55 is mean ± 1 SD, which covers about 68% under a normal curve." },
  { topic: "data", skill: "Profit & Loss", difficulty: "hard", expectedTimeSeconds: TIME.hard,
    prompt: "A company's profit margin was 12% on revenue of ₹50 lakh last year. This year revenue grew 20% and margin improved to 15%. What is this year's profit (in lakh)?",
    options: opts("9", "7.2", "8.4", "10"), correctOptionId: "a", explanation: "This year's revenue = 60 lakh; profit = 60 × 0.15 = 9 lakh." },

  // --- Verbal Ability -----------------------------------------------------------
  { topic: "verbal", skill: "Spelling", difficulty: "easy", expectedTimeSeconds: TIME.easy,
    prompt: "Choose the correctly spelled word.", options: opts("Receive", "Recieve", "Receeve", "Receve"),
    correctOptionId: "a", explanation: "\"i before e except after c\" — Receive is correct." },
  { topic: "verbal", skill: "Vocabulary", difficulty: "easy", expectedTimeSeconds: TIME.easy,
    prompt: "Choose the synonym of 'Abundant'.", options: opts("Plentiful", "Scarce", "Empty", "Tiny"),
    correctOptionId: "a", explanation: "'Abundant' means existing in large quantities — 'Plentiful' matches." },
  { topic: "verbal", skill: "Vocabulary", difficulty: "easy", expectedTimeSeconds: TIME.easy,
    prompt: "Choose the antonym of 'Optimistic'.", options: opts("Pessimistic", "Hopeful", "Cheerful", "Confident"),
    correctOptionId: "a", explanation: "'Pessimistic' is the direct opposite of 'Optimistic'." },
  { topic: "verbal", skill: "Grammar", difficulty: "easy", expectedTimeSeconds: TIME.easy,
    prompt: "Choose the correct plural form of 'Analysis'.", options: opts("Analyses", "Analysises", "Analysis's", "Analysisis"),
    correctOptionId: "a", explanation: "Greek-derived '-is' nouns pluralize as '-es': analysis → analyses." },
  { topic: "verbal", skill: "Prepositions", difficulty: "medium", expectedTimeSeconds: TIME.medium,
    prompt: "Fill in the blank: She has been working here ___ 2019.", options: opts("since", "for", "from", "at"),
    correctOptionId: "a", explanation: "'Since' is used with a specific point in time; 'for' would be used with a duration." },
  { topic: "verbal", skill: "Error Spotting", difficulty: "medium", expectedTimeSeconds: TIME.medium,
    prompt: "Identify the part with an error: 'Neither of the boys have completed their homework.'",
    options: opts("have completed", "Neither of", "the boys", "their homework"), correctOptionId: "a",
    explanation: "'Neither' is singular, so it should be 'has completed', not 'have completed'." },
  { topic: "verbal", skill: "Analogies", difficulty: "medium", expectedTimeSeconds: TIME.medium,
    prompt: "Choose the word that best completes the analogy: Doctor : Hospital :: Teacher : ___",
    options: opts("School", "Book", "Student", "Chalk"), correctOptionId: "a",
    explanation: "A doctor works at a hospital; a teacher works at a school." },
  { topic: "verbal", skill: "Voice", difficulty: "medium", expectedTimeSeconds: TIME.medium,
    prompt: "Choose the correct passive voice of: 'The chef is cooking the meal.'",
    options: opts("The meal is being cooked by the chef.", "The meal was cooked by the chef.", "The meal is cooked by the chef.", "The meal has been cooked by the chef."),
    correctOptionId: "a", explanation: "Present continuous active becomes present continuous passive: 'is being cooked'." },
  { topic: "verbal", skill: "Punctuation", difficulty: "medium", expectedTimeSeconds: TIME.medium,
    prompt: "Choose the correctly punctuated sentence.",
    options: opts("It's a great day, isn't it?", "Its a great day, isnt it", "Its' a great day, isn't it?", "It's a great day isnt it?"),
    correctOptionId: "a", explanation: "'It's' (it is) and 'isn't' both need apostrophes, and the sentence needs a comma and question mark." },
  { topic: "verbal", skill: "Idioms", difficulty: "hard", expectedTimeSeconds: TIME.hard,
    prompt: "Choose the option that best captures the meaning of the idiom 'to bite the bullet'.",
    options: opts("To face a difficult situation bravely", "To avoid a difficult task", "To eat quickly", "To argue aggressively"),
    correctOptionId: "a", explanation: "'Bite the bullet' means to endure a painful or difficult situation with courage." },
  { topic: "verbal", skill: "Grammar", difficulty: "hard", expectedTimeSeconds: TIME.hard,
    prompt: "Select the grammatically correct sentence.",
    options: opts(
      "Each of the students has submitted their assignment.",
      "Each of the students have submitted their assignment.",
      "Each of student has submitted their assignment.",
      "Each of the students has submit their assignment."
    ),
    correctOptionId: "a", explanation: "'Each' takes a singular verb ('has'), and the sentence needs the article 'the' before 'students'." },
  { topic: "verbal", skill: "One-word Substitution", difficulty: "hard", expectedTimeSeconds: TIME.hard,
    prompt: "Choose the most appropriate one-word substitute for 'a person who can speak two languages fluently'.",
    options: opts("Bilingual", "Linguist", "Translator", "Polyglot"), correctOptionId: "a",
    explanation: "'Bilingual' specifically means fluent in two languages; 'polyglot' implies several languages." },

  // --- Technical Aptitude ---------------------------------------------------------
  { topic: "technical", skill: "Algorithms", difficulty: "easy", expectedTimeSeconds: TIME.easy,
    prompt: "What is the time complexity of binary search on a sorted array of n elements?",
    options: opts("O(log n)", "O(n)", "O(n log n)", "O(1)"), correctOptionId: "a",
    explanation: "Binary search halves the search space each step, giving O(log n)." },
  { topic: "technical", skill: "Data Structures", difficulty: "easy", expectedTimeSeconds: TIME.easy,
    prompt: "Which data structure uses FIFO (First In First Out) order?", options: opts("Queue", "Stack", "Tree", "Graph"),
    correctOptionId: "a", explanation: "A queue processes elements in the order they arrive: first in, first out." },
  { topic: "technical", skill: "Databases", difficulty: "easy", expectedTimeSeconds: TIME.easy,
    prompt: "What does SQL stand for?",
    options: opts("Structured Query Language", "Simple Query Language", "Sequential Query Language", "Standard Query Language"),
    correctOptionId: "a", explanation: "SQL stands for Structured Query Language." },
  { topic: "technical", skill: "Databases", difficulty: "easy", expectedTimeSeconds: TIME.easy,
    prompt: "Which of these is a NoSQL database?", options: opts("MongoDB", "MySQL", "PostgreSQL", "Oracle"),
    correctOptionId: "a", explanation: "MongoDB is a document-oriented NoSQL database; the others are relational (SQL) databases." },
  { topic: "technical", skill: "Algorithms", difficulty: "medium", expectedTimeSeconds: TIME.medium,
    prompt: "What is the worst-case time complexity of QuickSort?", options: opts("O(n²)", "O(n log n)", "O(log n)", "O(n)"),
    correctOptionId: "a", explanation: "QuickSort degrades to O(n²) when the pivot repeatedly splits the array unevenly (e.g., already-sorted input with a naive pivot)." },
  { topic: "technical", skill: "OOP", difficulty: "medium", expectedTimeSeconds: TIME.medium,
    prompt: "In OOP, which principle allows a subclass to provide its own implementation of a method already defined in its parent class?",
    options: opts("Polymorphism (Overriding)", "Encapsulation", "Abstraction", "Inheritance"), correctOptionId: "a",
    explanation: "Method overriding is a form of runtime polymorphism." },
  { topic: "technical", skill: "Web", difficulty: "medium", expectedTimeSeconds: TIME.medium,
    prompt: "Which of the following is NOT a valid HTTP method?", options: opts("FETCH", "GET", "POST", "DELETE"),
    correctOptionId: "a", explanation: "FETCH is a browser API for making requests, not an HTTP method itself." },
  { topic: "technical", skill: "Graphs", difficulty: "medium", expectedTimeSeconds: TIME.medium,
    prompt: "What is the space complexity of an adjacency matrix representation of a graph with V vertices?",
    options: opts("O(V²)", "O(V)", "O(V+E)", "O(E)"), correctOptionId: "a",
    explanation: "An adjacency matrix stores a V×V grid regardless of edge count." },
  { topic: "technical", skill: "Web", difficulty: "medium", expectedTimeSeconds: TIME.medium,
    prompt: "What does 'REST' stand for in RESTful APIs?",
    options: opts("Representational State Transfer", "Remote State Transfer", "Representational Style Transfer", "Real-time State Transfer"),
    correctOptionId: "a", explanation: "REST stands for Representational State Transfer." },
  { topic: "technical", skill: "Algorithms", difficulty: "hard", expectedTimeSeconds: TIME.hard,
    prompt: "Which sorting algorithm is stable and has O(n log n) time complexity in all cases?",
    options: opts("MergeSort", "QuickSort", "HeapSort", "SelectionSort"), correctOptionId: "a",
    explanation: "MergeSort is stable and guarantees O(n log n) in the best, average, and worst cases." },
  { topic: "technical", skill: "Data Structures", difficulty: "hard", expectedTimeSeconds: TIME.hard,
    prompt: "In a hash table with open addressing, which technique probes the next slot using a quadratic function of the probe number?",
    options: opts("Quadratic probing", "Linear probing", "Double hashing", "Chaining"), correctOptionId: "a",
    explanation: "Quadratic probing checks slots at intervals of 1², 2², 3², etc. from the original hash." },
  { topic: "technical", skill: "Networking", difficulty: "hard", expectedTimeSeconds: TIME.hard,
    prompt: "What is the primary difference between TCP and UDP?",
    options: opts(
      "TCP is connection-oriented and reliable; UDP is connectionless and faster but unreliable.",
      "TCP is connectionless; UDP is connection-oriented.",
      "Both are connection-oriented.",
      "Both are connectionless."
    ),
    correctOptionId: "a", explanation: "TCP guarantees delivery and order via connections; UDP trades that reliability for lower overhead." },
];

export interface ProfileDef {
  slug: string;
  name: string;
  assessmentType: string;
  durationMinutes: number;
  sections: Array<{ name: string; topics: TopicSlug[]; questionCount: number }>;
  difficultyDistribution: Record<Difficulty, number>;
  negativeMarking: { enabled: boolean; penaltyFraction: number };
  scoringRules: { correctMarks: number; unansweredMarks: number };
  targetScore: number;
  questionTimeExpectationSeconds: number;
}

/**
 * Sections deliberately interleave topics in small blocks (rather than one
 * big block per topic) so a realistic simulation produces enough topic
 * transitions to say something about mixed-topic switching (Section 12) —
 * a single contiguous block per topic would only switch 3-4 times in a
 * 30-question paper.
 */
export const PROFILE_DEFS: ProfileDef[] = [
  {
    slug: "general-aptitude",
    name: "General Aptitude — Campus Placement",
    assessmentType: "campus_placement",
    durationMinutes: 45,
    sections: [
      { name: "Quantitative I", topics: ["quant"], questionCount: 4 },
      { name: "Logical Reasoning I", topics: ["logical"], questionCount: 4 },
      { name: "Data Interpretation I", topics: ["data"], questionCount: 3 },
      { name: "Verbal Ability I", topics: ["verbal"], questionCount: 4 },
      { name: "Quantitative II", topics: ["quant"], questionCount: 4 },
      { name: "Logical Reasoning II", topics: ["logical"], questionCount: 4 },
      { name: "Data Interpretation II", topics: ["data"], questionCount: 3 },
      { name: "Verbal Ability II", topics: ["verbal"], questionCount: 4 },
    ],
    difficultyDistribution: { easy: 0.3, medium: 0.5, hard: 0.2 },
    negativeMarking: { enabled: true, penaltyFraction: 0.25 },
    scoringRules: { correctMarks: 1, unansweredMarks: 0 },
    targetScore: 80,
    questionTimeExpectationSeconds: 75,
  },
  {
    slug: "technical-aptitude",
    name: "Technical Aptitude — Company-style Assessment",
    assessmentType: "technical_screening",
    durationMinutes: 30,
    sections: [
      { name: "Core CS I", topics: ["technical"], questionCount: 6 },
      { name: "Quantitative", topics: ["quant"], questionCount: 4 },
      { name: "Core CS II", topics: ["technical"], questionCount: 6 },
      { name: "Logical Reasoning", topics: ["logical"], questionCount: 4 },
    ],
    difficultyDistribution: { easy: 0.25, medium: 0.5, hard: 0.25 },
    negativeMarking: { enabled: false, penaltyFraction: 0 },
    scoringRules: { correctMarks: 1, unansweredMarks: 0 },
    targetScore: 75,
    questionTimeExpectationSeconds: 80,
  },
];
