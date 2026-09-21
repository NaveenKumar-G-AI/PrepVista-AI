/**
 * CodeForge — Seed Challenges
 *
 * Five hand-authored, fully-worked challenges. Hand-authored rather than run
 * through the live AI generation pipeline (src/generation/generationPipeline.ts)
 * because this sandbox has no network access to a real AI provider — see
 * docs/IMPLEMENTATION_MANIFEST.md. Every solution below is verified against its
 * own tests by scripts/validate-seed.ts before anything else is built on top
 * of this data (§17: "AI must not certify its own answer" — the same discipline
 * applies to hand-authored content: nothing here is trusted until it's actually
 * executed).
 *
 * challenge-01 is the central demo challenge and is deliberately seeded with a
 * realistic off-by-one bug in its *starter* code (see inline note) so the demo
 * can show a genuine partial failure, not a scripted one.
 */

import {
  ChallengeLifecycleStatus,
  DifficultyLabel,
  ProgressionStage,
  RoleContext,
  SupportedLanguage,
  TaskType,
  TestCategory,
  type Challenge,
} from "../domain/types.js";

const SEEDED_AT = "2026-06-01T00:00:00.000Z";

function baseAnalytics() {
  return null; // no real attempts yet — see §38, populated at runtime by the store
}

// ---------------------------------------------------------------------------
// Challenge 1 — the central demo challenge (§58's exact scenario)
// ---------------------------------------------------------------------------
//
// The starter code's bug: `for i in range(len(vectors) - 1)` then an
// unconditional `result.append(vectors[-1])` after the loop. This means the
// *last* vector is always kept even if it duplicates an earlier one, and an
// empty list crashes on `vectors[-1]`. Every test whose last element is not a
// duplicate (and is non-empty) still passes — which is exactly why this reads
// as "handles the main scenario but fails specific edge cases" rather than a
// wholesale failure. Hand-verified against all 10 tests below, then confirmed
// by actually executing it (see scripts/validate-seed.ts).

const CH1_DEDUPE: Challenge = {
  challengeId: "debug-duplicate-feature-vectors",
  version: 1,
  title: "Fix: Deduplicating Feature Vectors",
  description:
    "ROLE: AI/ML Engineer\n" +
    "OBJECTIVE: Get this data-prep helper working correctly before it ships in the training pipeline.\n" +
    "SCENARIO: Feature vectors are read from an upstream pipeline before batching. Duplicate rows waste " +
    "compute and can quietly bias a model toward over-represented examples. A teammate wrote a first pass " +
    "at removing duplicates, but it's failing some of the test suite.\n" +
    "TASK: Fix `dedupe_vectors(vectors)` so it returns the unique vectors, preserving first-seen order.\n" +
    "CONSTRAINTS: Do not change the function name or its signature. Do not reorder unique vectors.\n" +
    "EXPECTED BEHAVIOR: For input vectors (each a list of numbers), return a new list containing each " +
    "distinct vector once, in the order it first appeared.",
  roleContext: [RoleContext.AI_ML_ENGINEER, RoleContext.DATA_ENGINEER],
  skill: "data_structures.hashing",
  subskill: "duplicate_detection",
  competencies: ["hash-based membership testing", "loop boundary reasoning", "order-preserving dedup"],
  prerequisites: ["data_structures.arrays"],
  difficulty: {
    conceptualComplexity: 2,
    implementationComplexity: 2,
    reasoningComplexity: 3,
    edgeCaseComplexity: 3,
    prerequisiteDepth: 2,
    expectedTimeMinutes: 12,
    calibrated: false,
  },
  difficultyLabel: DifficultyLabel.INTERMEDIATE,
  progressionStage: ProgressionStage.BASIC_APPLICATION,
  taskType: TaskType.DEBUGGING,
  supportedLanguages: [SupportedLanguage.PYTHON],
  learningObjective:
    "Recognize and correct an off-by-one loop boundary that causes an unconditional special-case for the " +
    "last element of a collection.",
  constraints: ["Preserve first-seen order.", "Do not use additional imports."],
  examples: [
    { input: "[[1,2],[3,4],[1,2]]", output: "[[1,2],[3,4]]", explanation: "The second [1,2] is a duplicate and is dropped." },
    { input: "[]", output: "[]", explanation: "No vectors in, none out." },
  ],
  starterCode: {
    [SupportedLanguage.PYTHON]:
      "def dedupe_vectors(vectors):\n" +
      "    seen = set()\n" +
      "    result = []\n" +
      "    for i in range(len(vectors) - 1):\n" +
      "        key = tuple(vectors[i])\n" +
      "        if key not in seen:\n" +
      "            seen.add(key)\n" +
      "            result.append(vectors[i])\n" +
      "    result.append(vectors[-1])\n" +
      "    return result\n",
  },
  publicTests: [
    { id: "p1", category: TestCategory.NORMAL, input: [[[1, 2], [3, 4], [5, 6]]], expectedOutput: [[1, 2], [3, 4], [5, 6]], hidden: false, points: 1 },
    { id: "p2", category: TestCategory.NORMAL, input: [[[1, 1], [1, 1], [2, 2]]], expectedOutput: [[1, 1], [2, 2]], hidden: false, points: 1 },
    { id: "p3", category: TestCategory.EDGE, input: [[[9, 9]]], expectedOutput: [[9, 9]], hidden: false, points: 1 },
    {
      id: "p4",
      category: TestCategory.BOUNDARY,
      input: [[[1, 2], [1, 2]]],
      expectedOutput: [[1, 2]],
      hidden: false,
      points: 2,
      note: "duplicate IS the last element — the case the buggy starter mishandles",
    },
  ],
  hiddenTests: [
    { id: "h1", category: TestCategory.NORMAL, input: [[[0, 0], [1, 1], [0, 0], [2, 2]]], expectedOutput: [[0, 0], [1, 1], [2, 2]], hidden: true, points: 1 },
    { id: "h2", category: TestCategory.NORMAL, input: [[[5, 5], [6, 6], [7, 7]]], expectedOutput: [[5, 5], [6, 6], [7, 7]], hidden: true, points: 1 },
    { id: "h3", category: TestCategory.EDGE, input: [[]], expectedOutput: [], hidden: true, points: 2, note: "empty input — buggy starter crashes on vectors[-1]" },
    { id: "h4", category: TestCategory.NORMAL, input: [[[1, 0], [0, 1], [1, 0], [0, 1], [9, 9]]], expectedOutput: [[1, 0], [0, 1], [9, 9]], hidden: true, points: 1 },
    {
      id: "h5",
      category: TestCategory.LARGE_INPUT,
      input: [Array.from({ length: 20 }, (_, i) => [i, i + 1])],
      expectedOutput: Array.from({ length: 20 }, (_, i) => [i, i + 1]),
      hidden: true,
      points: 1,
    },
    { id: "h6", category: TestCategory.NORMAL, input: [[[1, 2], [3, 4], [1, 2], [5, 6], [3, 4], [7, 8]]], expectedOutput: [[1, 2], [3, 4], [5, 6], [7, 8]], hidden: true, points: 1 },
  ],
  hints: [
    "Look closely at how the loop's range relates to the length of the input list — does it visit every index?",
    "Trace through a list where the very LAST vector is a duplicate of an earlier one. What does the function return?",
    "You shouldn't need to special-case the first or last element at all — every element can go through the exact same seen-check.",
    "Try changing the loop to cover the full range of indices, and fold the 'always append this one' line into the same seen-check the rest of the loop uses.",
    "The core loop can be as simple as: for v in vectors: key = tuple(v); if key not in seen: seen.add(key); result.append(v) — with nothing extra before or after it.",
  ],
  solutionMetadata: {
    referenceSolution: {
      [SupportedLanguage.PYTHON]:
        "def dedupe_vectors(vectors):\n" +
        "    seen = set()\n" +
        "    result = []\n" +
        "    for v in vectors:\n" +
        "        key = tuple(v)\n" +
        "        if key not in seen:\n" +
        "            seen.add(key)\n" +
        "            result.append(v)\n" +
        "    return result\n",
    },
    approachSummary: "Single pass; track seen vectors as tuples in a set for O(1) membership checks.",
    timeComplexity: "O(n)",
    spaceComplexity: "O(n)",
  },
  evaluationMetadata: { entryFunction: "dedupe_vectors", comparisonMode: "exact" },
  qualityStatus: ChallengeLifecycleStatus.ACTIVE,
  qualityAnalytics: baseAnalytics(),
  createdAt: SEEDED_AT,
  updatedAt: SEEDED_AT,
};

// ---------------------------------------------------------------------------
// Challenge 2 — same underlying skill (hashing), new context (§15's exact
// transfer chain: hash map -> duplicate detection -> ... -> record matching),
// higher difficulty, IMPLEMENTATION instead of DEBUGGING.
// ---------------------------------------------------------------------------

const CH2_MERGE: Challenge = {
  challengeId: "merge-records-by-email",
  version: 1,
  title: "Join Feature and Label Records",
  description:
    "ROLE: AI/ML Engineer\n" +
    "OBJECTIVE: Build a clean training set by joining two upstream exports.\n" +
    "SCENARIO: Feature vectors and labels are produced by two different pipelines and only share a customer " +
    "email as a common key. Emails aren't consistently formatted between the two systems (casing, stray " +
    "whitespace).\n" +
    "TASK: Implement `merge_by_email(list_a, list_b)`. `list_a` items look like " +
    '{"email": str, "features": [num, ...]}; list_b items look like {"email": str, "label": num}. Return a ' +
    "list of {\"email\": normalized_email, \"features\": ..., \"label\": ...} for every email present in BOTH " +
    "lists, sorted ascending by normalized email.\n" +
    "CONSTRAINTS: Normalize emails by trimming whitespace and lowercasing before comparing or returning them. " +
    "If a list contains the same normalized email twice, keep only the first occurrence from that list.\n" +
    "EXPECTED BEHAVIOR: Emails present in only one list are excluded from the result (inner join).",
  roleContext: [RoleContext.AI_ML_ENGINEER, RoleContext.DATA_ENGINEER],
  skill: "data_structures.hashing",
  subskill: "record_matching",
  competencies: ["hash-map joins", "key normalization", "deterministic ordering"],
  prerequisites: ["data_structures.arrays"],
  difficulty: {
    conceptualComplexity: 3,
    implementationComplexity: 3,
    reasoningComplexity: 3,
    edgeCaseComplexity: 4,
    prerequisiteDepth: 3,
    expectedTimeMinutes: 18,
    calibrated: false,
  },
  difficultyLabel: DifficultyLabel.INTERMEDIATE,
  progressionStage: ProgressionStage.INTERMEDIATE_APPLICATION,
  taskType: TaskType.IMPLEMENTATION,
  supportedLanguages: [SupportedLanguage.PYTHON],
  learningObjective: "Apply hash-map keying to a two-collection join, including key normalization and tie-breaking.",
  constraints: ["Inner join semantics only.", "Normalize before comparing AND before returning."],
  examples: [
    {
      input: 'list_a=[{"email":"A@x.com","features":[1,2]}], list_b=[{"email":" a@x.com ","label":1}]',
      output: '[{"email":"a@x.com","features":[1,2],"label":1}]',
    },
  ],
  starterCode: {
    [SupportedLanguage.PYTHON]:
      "def merge_by_email(list_a, list_b):\n" + "    # TODO: implement\n" + "    pass\n",
  },
  publicTests: [
    {
      id: "p1",
      category: TestCategory.NORMAL,
      input: [
        [{ email: "a@x.com", features: [1, 2] }, { email: "b@x.com", features: [3, 4] }],
        [{ email: "a@x.com", label: 1 }, { email: "c@x.com", label: 0 }],
      ],
      expectedOutput: [{ email: "a@x.com", features: [1, 2], label: 1 }],
      hidden: false,
      points: 1,
    },
    {
      id: "p2",
      category: TestCategory.NORMAL,
      input: [
        [{ email: "A@X.com", features: [9] }],
        [{ email: " a@x.com ", label: 5 }],
      ],
      expectedOutput: [{ email: "a@x.com", features: [9], label: 5 }],
      hidden: false,
      points: 1,
      note: "normalization: case + whitespace",
    },
  ],
  hiddenTests: [
    {
      id: "h1",
      category: TestCategory.EDGE,
      input: [[], [{ email: "a@x.com", label: 1 }]],
      expectedOutput: [],
      hidden: true,
      points: 1,
    },
    {
      id: "h2",
      category: TestCategory.BOUNDARY,
      input: [
        [{ email: "a@x.com", features: [1] }, { email: "a@x.com", features: [2] }],
        [{ email: "a@x.com", label: 7 }],
      ],
      expectedOutput: [{ email: "a@x.com", features: [1], label: 7 }],
      hidden: true,
      points: 2,
      note: "duplicate email within one side — first occurrence wins",
    },
    {
      id: "h3",
      category: TestCategory.NORMAL,
      input: [
        [{ email: "z@x.com", features: [1] }, { email: "a@x.com", features: [2] }],
        [{ email: "a@x.com", label: 1 }, { email: "z@x.com", label: 2 }],
      ],
      expectedOutput: [{ email: "a@x.com", features: [2], label: 1 }, { email: "z@x.com", features: [1], label: 2 }],
      hidden: true,
      points: 1,
      note: "output must be sorted by email regardless of input order",
    },
  ],
  hints: [
    "Build a lookup for one side first: a dict keyed by the normalized email.",
    "Normalize with the same function on both sides, and normalize before you use the value as a dict key — not after.",
    "For the duplicate-within-a-side case, only write into the dict when the key isn't already present.",
    "Iterate one dict's keys, check membership in the other, and collect matches into a list before sorting it.",
    "Sort the final list with `result.sort(key=lambda r: r[\"email\"])` as the very last step.",
  ],
  solutionMetadata: {
    referenceSolution: {
      [SupportedLanguage.PYTHON]:
        "def merge_by_email(list_a, list_b):\n" +
        "    def norm(e):\n" +
        "        return e.strip().lower()\n" +
        "\n" +
        "    a_by_email = {}\n" +
        "    for rec in list_a:\n" +
        "        key = norm(rec[\"email\"])\n" +
        "        if key not in a_by_email:\n" +
        "            a_by_email[key] = rec\n" +
        "\n" +
        "    b_by_email = {}\n" +
        "    for rec in list_b:\n" +
        "        key = norm(rec[\"email\"])\n" +
        "        if key not in b_by_email:\n" +
        "            b_by_email[key] = rec\n" +
        "\n" +
        "    merged = []\n" +
        "    for key, a_rec in a_by_email.items():\n" +
        "        if key in b_by_email:\n" +
        "            merged.append({\"email\": key, \"features\": a_rec[\"features\"], \"label\": b_by_email[key][\"label\"]})\n" +
        "    merged.sort(key=lambda r: r[\"email\"])\n" +
        "    return merged\n",
    },
    approachSummary: "Two hash-map indexes keyed by normalized email, then an inner-join walk over one of them.",
    timeComplexity: "O(n + m)",
    spaceComplexity: "O(n + m)",
  },
  evaluationMetadata: { entryFunction: "merge_by_email", comparisonMode: "exact" },
  qualityStatus: ChallengeLifecycleStatus.ACTIVE,
  qualityAnalytics: baseAnalytics(),
  createdAt: SEEDED_AT,
  updatedAt: SEEDED_AT,
};

// ---------------------------------------------------------------------------
// Challenge 3 — different role + skill, used for role-relevance scoring.
// ---------------------------------------------------------------------------

const CH3_VALIDATE: Challenge = {
  challengeId: "validate-signup-payload",
  version: 1,
  title: "Validate a Signup Payload",
  description:
    "ROLE: Backend Engineer\n" +
    "OBJECTIVE: Reject malformed signups before they reach the database.\n" +
    "SCENARIO: The signup endpoint currently trusts its input.\n" +
    "TASK: Implement `validate_signup(payload)`, returning {\"valid\": bool, \"errors\": [str, ...]}.\n" +
    "CONSTRAINTS: email must contain '@' and a '.' after it; password must be a string of length >= 8; " +
    "age must be an integer >= 13 (booleans are not valid ages, even though Python treats them as ints). " +
    "Check in this order: email, password, age.\n" +
    "EXPECTED BEHAVIOR: errors lists every failing field's error code among 'invalid_email', 'weak_password', 'invalid_age'.",
  roleContext: [RoleContext.BACKEND_ENGINEER, RoleContext.GENERAL_SWE],
  skill: "engineering.validation",
  subskill: "payload_validation",
  competencies: ["defensive input checking", "type discrimination"],
  prerequisites: ["fundamentals.control_flow"],
  difficulty: {
    conceptualComplexity: 1,
    implementationComplexity: 2,
    reasoningComplexity: 1,
    edgeCaseComplexity: 3,
    prerequisiteDepth: 1,
    expectedTimeMinutes: 10,
    calibrated: false,
  },
  difficultyLabel: DifficultyLabel.EASY,
  progressionStage: ProgressionStage.BASIC_APPLICATION,
  taskType: TaskType.IMPLEMENTATION,
  supportedLanguages: [SupportedLanguage.PYTHON],
  learningObjective: "Write defensive validation logic that handles type edge cases (bool-as-int), not just missing fields.",
  constraints: ["Do not raise exceptions for missing fields — treat them as invalid."],
  examples: [{ input: '{"email":"a@b.com","password":"password123","age":25}', output: '{"valid":true,"errors":[]}' }],
  starterCode: { [SupportedLanguage.PYTHON]: "def validate_signup(payload):\n    # TODO: implement\n    pass\n" },
  publicTests: [
    { id: "p1", category: TestCategory.NORMAL, input: [{ email: "a@b.com", password: "password123", age: 25 }], expectedOutput: { valid: true, errors: [] }, hidden: false, points: 1 },
    { id: "p2", category: TestCategory.NEGATIVE, input: [{ email: "not-an-email", password: "password123", age: 25 }], expectedOutput: { valid: false, errors: ["invalid_email"] }, hidden: false, points: 1 },
  ],
  hiddenTests: [
    { id: "h1", category: TestCategory.NEGATIVE, input: [{ email: "a@b.com", password: "short", age: 25 }], expectedOutput: { valid: false, errors: ["weak_password"] }, hidden: true, points: 1 },
    { id: "h2", category: TestCategory.BOUNDARY, input: [{ email: "a@b.com", password: "password123", age: true }], expectedOutput: { valid: false, errors: ["invalid_age"] }, hidden: true, points: 2, note: "bool is not a valid age even though isinstance(True, int) is True" },
    { id: "h3", category: TestCategory.NEGATIVE, input: [{}], expectedOutput: { valid: false, errors: ["invalid_email", "weak_password", "invalid_age"] }, hidden: true, points: 1 },
  ],
  hints: [
    "Handle each field independently and append to the same errors list.",
    "`payload.get(field)` returns None for a missing field — make sure your type check handles that.",
    "In Python, `isinstance(True, int)` is True — you need an explicit bool check before the age range check.",
    "Structure: three independent if-blocks, each appending its own error code.",
    "return {\"valid\": len(errors) == 0, \"errors\": errors} as the final line.",
  ],
  solutionMetadata: {
    referenceSolution: {
      [SupportedLanguage.PYTHON]:
        "def validate_signup(payload):\n" +
        "    errors = []\n" +
        "    email = payload.get(\"email\")\n" +
        "    if not isinstance(email, str) or \"@\" not in email or \".\" not in email.split(\"@\")[-1]:\n" +
        "        errors.append(\"invalid_email\")\n" +
        "    password = payload.get(\"password\")\n" +
        "    if not isinstance(password, str) or len(password) < 8:\n" +
        "        errors.append(\"weak_password\")\n" +
        "    age = payload.get(\"age\")\n" +
        "    if not isinstance(age, int) or isinstance(age, bool) or age < 13:\n" +
        "        errors.append(\"invalid_age\")\n" +
        "    return {\"valid\": len(errors) == 0, \"errors\": errors}\n",
    },
    approachSummary: "Independent per-field checks accumulated into one errors list.",
    timeComplexity: "O(1)",
    spaceComplexity: "O(1)",
  },
  evaluationMetadata: { entryFunction: "validate_signup", comparisonMode: "exact" },
  qualityStatus: ChallengeLifecycleStatus.ACTIVE,
  qualityAnalytics: baseAnalytics(),
  createdAt: SEEDED_AT,
  updatedAt: SEEDED_AT,
};

// ---------------------------------------------------------------------------
// Challenge 4 — same skill as 1 & 2 (hashing) but FOUNDATION difficulty, used
// to exercise the repetition/diversity penalty in the selector's unit tests.
// ---------------------------------------------------------------------------

const CH4_FREQ: Challenge = {
  challengeId: "count-word-frequencies",
  version: 1,
  title: "Word Frequency Counter",
  description:
    "ROLE: General Software Engineer\n" +
    "OBJECTIVE: Build a basic word-frequency counter.\n" +
    "TASK: Implement `word_frequencies(text)` returning a dict mapping each lowercase alphanumeric word to " +
    "its occurrence count.\n" +
    "CONSTRAINTS: Treat sequences of letters/digits/apostrophes as words; ignore other punctuation.",
  roleContext: [RoleContext.GENERAL_SWE, RoleContext.DATA_ENGINEER],
  skill: "data_structures.hashing",
  subskill: "frequency_analysis",
  competencies: ["hash-map counting"],
  prerequisites: ["data_structures.strings"],
  difficulty: {
    conceptualComplexity: 1,
    implementationComplexity: 1,
    reasoningComplexity: 1,
    edgeCaseComplexity: 1,
    prerequisiteDepth: 1,
    expectedTimeMinutes: 8,
    calibrated: false,
  },
  difficultyLabel: DifficultyLabel.FOUNDATION,
  progressionStage: ProgressionStage.FOUNDATION,
  taskType: TaskType.IMPLEMENTATION,
  supportedLanguages: [SupportedLanguage.PYTHON],
  learningObjective: "Use a hash map as a counter.",
  constraints: [],
  examples: [{ input: '"The cat sat. The cat ran."', output: '{"the":2,"cat":2,"sat":1,"ran":1}' }],
  starterCode: { [SupportedLanguage.PYTHON]: "def word_frequencies(text):\n    # TODO: implement\n    pass\n" },
  publicTests: [
    { id: "p1", category: TestCategory.NORMAL, input: ["The cat sat. The cat ran."], expectedOutput: { the: 2, cat: 2, sat: 1, ran: 1 }, hidden: false, points: 1 },
  ],
  hiddenTests: [
    { id: "h1", category: TestCategory.EDGE, input: [""], expectedOutput: {}, hidden: true, points: 1 },
    { id: "h2", category: TestCategory.NORMAL, input: ["It's a test. It's easy."], expectedOutput: { "it's": 2, a: 1, test: 1, easy: 1 }, hidden: true, points: 1 },
  ],
  hints: [
    "A regular expression like [a-zA-Z0-9']+ over the lowercased text will find each word.",
    "For each word, do freq[w] = freq.get(w, 0) + 1.",
    "Remember to lowercase the whole text before splitting, not after.",
    "import re at the top of the function or module.",
    "return the dict directly — no need to sort it.",
  ],
  solutionMetadata: {
    referenceSolution: {
      [SupportedLanguage.PYTHON]:
        "import re\n\n\n" +
        "def word_frequencies(text):\n" +
        "    words = re.findall(r\"[a-zA-Z0-9']+\", text.lower())\n" +
        "    freq = {}\n" +
        "    for w in words:\n" +
        "        freq[w] = freq.get(w, 0) + 1\n" +
        "    return freq\n",
    },
    approachSummary: "Regex tokenization followed by a hash-map counter.",
    timeComplexity: "O(n)",
    spaceComplexity: "O(k) for k distinct words",
  },
  evaluationMetadata: { entryFunction: "word_frequencies", comparisonMode: "exact" },
  qualityStatus: ChallengeLifecycleStatus.ACTIVE,
  qualityAnalytics: baseAnalytics(),
  createdAt: SEEDED_AT,
  updatedAt: SEEDED_AT,
};

// ---------------------------------------------------------------------------
// Challenge 5 — different skill entirely + a real prerequisite, used to
// exercise prerequisite gating in the selector's unit tests.
// ---------------------------------------------------------------------------

const CH5_SEARCH: Challenge = {
  challengeId: "search-insert-position",
  version: 1,
  title: "Sorted Insert Position",
  description:
    "ROLE: General Software Engineer\n" +
    "OBJECTIVE: Locate or place a value in a sorted list efficiently.\n" +
    "TASK: Implement `search_insert_position(nums, target)`. `nums` is sorted ascending with no duplicates. " +
    "Return the index of `target` if present, otherwise the index where it would be inserted to keep `nums` sorted.\n" +
    "CONSTRAINTS: Must run in O(log n) time.",
  roleContext: [RoleContext.GENERAL_SWE],
  skill: "algorithms.searching",
  subskill: "binary_search",
  competencies: ["binary search bounds"],
  prerequisites: ["data_structures.arrays", "algorithms.searching"],
  difficulty: {
    conceptualComplexity: 3,
    implementationComplexity: 3,
    reasoningComplexity: 3,
    edgeCaseComplexity: 3,
    prerequisiteDepth: 3,
    expectedTimeMinutes: 15,
    calibrated: false,
  },
  difficultyLabel: DifficultyLabel.ADVANCED,
  progressionStage: ProgressionStage.COMPLEX_COMBINATION,
  taskType: TaskType.IMPLEMENTATION,
  supportedLanguages: [SupportedLanguage.PYTHON],
  learningObjective: "Implement binary search with correct half-open interval bounds.",
  constraints: ["O(log n) time — a linear scan will fail the performance test."],
  examples: [{ input: "nums=[1,3,5,6], target=5", output: "2" }],
  starterCode: { [SupportedLanguage.PYTHON]: "def search_insert_position(nums, target):\n    # TODO: implement\n    pass\n" },
  publicTests: [
    { id: "p1", category: TestCategory.NORMAL, input: [[1, 3, 5, 6], 5], expectedOutput: 2, hidden: false, points: 1 },
    { id: "p2", category: TestCategory.NORMAL, input: [[1, 3, 5, 6], 2], expectedOutput: 1, hidden: false, points: 1 },
  ],
  hiddenTests: [
    { id: "h1", category: TestCategory.BOUNDARY, input: [[1, 3, 5, 6], 7], expectedOutput: 4, hidden: true, points: 1 },
    { id: "h2", category: TestCategory.BOUNDARY, input: [[1, 3, 5, 6], 0], expectedOutput: 0, hidden: true, points: 1 },
    { id: "h3", category: TestCategory.EDGE, input: [[], 5], expectedOutput: 0, hidden: true, points: 1 },
    {
      id: "h4",
      category: TestCategory.PERFORMANCE,
      input: [Array.from({ length: 5000 }, (_, i) => i * 2), 6001],
      expectedOutput: 3001,
      hidden: true,
      points: 2,
      note: "large sorted input — a linear scan is still correct here, so this only fully discriminates when timed",
    },
  ],
  hints: [
    "Keep two bounds, lo and hi, and narrow them each iteration — this is a half-open interval, hi starts at len(nums).",
    "Compare nums[mid] to target; decide which half can be discarded.",
    "The loop condition is lo < hi, not lo <= hi, if hi starts at len(nums).",
    "When nums[mid] < target, the answer can't be at or before mid, so lo = mid + 1.",
    "When nums[mid] >= target, hi = mid. The loop ends with lo == hi, which is your answer.",
  ],
  solutionMetadata: {
    referenceSolution: {
      [SupportedLanguage.PYTHON]:
        "def search_insert_position(nums, target):\n" +
        "    lo, hi = 0, len(nums)\n" +
        "    while lo < hi:\n" +
        "        mid = (lo + hi) // 2\n" +
        "        if nums[mid] < target:\n" +
        "            lo = mid + 1\n" +
        "        else:\n" +
        "            hi = mid\n" +
        "    return lo\n",
    },
    approachSummary: "Standard half-open-interval binary search.",
    timeComplexity: "O(log n)",
    spaceComplexity: "O(1)",
  },
  evaluationMetadata: { entryFunction: "search_insert_position", comparisonMode: "exact" },
  qualityStatus: ChallengeLifecycleStatus.ACTIVE,
  qualityAnalytics: baseAnalytics(),
  createdAt: SEEDED_AT,
  updatedAt: SEEDED_AT,
};

export const SEED_CHALLENGES: Challenge[] = [CH1_DEDUPE, CH2_MERGE, CH3_VALIDATE, CH4_FREQ, CH5_SEARCH];

export function getSeedChallenge(id: string): Challenge | undefined {
  return SEED_CHALLENGES.find((c) => c.challengeId === id);
}
