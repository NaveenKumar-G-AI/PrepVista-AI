import {
  UNDERSTANDING_DIMENSIONS,
  type DimensionProfile,
  type EvidenceItem,
  type MentalModel,
  type StudentSubmission,
  type UnderstandingDimension,
} from "@/types/index.js";

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}

export function makeMentalModel(overrides: Partial<MentalModel> = {}): MentalModel {
  return {
    problem_objective: "Given an array of integers and a target, return the indices of the two numbers that add up to the target.",
    constraints: ["2 <= nums.length <= 10^4", "Exactly one valid answer exists."],
    algorithm: "Single-pass hash map lookup (two-sum)",
    algorithm_steps: [
      "Iterate through the array once",
      "For each value, check whether target - value is already in the map",
      "If found, return the stored index and the current index",
      "Otherwise store value -> index in the map and continue",
    ],
    important_variables: [
      { name: "seen", meaning: "Maps a previously-seen value to its index", changes_when: "After each element that doesn't complete a pair" },
    ],
    data_structures: ["hash map"],
    state_transitions: ["`seen` gains one entry per iteration that doesn't return"],
    control_flow_summary: "A single for-loop with an early return once a complementary pair is found.",
    candidate_invariants: [
      "At the start of each iteration, `seen` contains exactly the indices of all elements examined so far, with no false matches.",
    ],
    correctness_argument:
      "Because every prior element is recorded before moving on, any valid pair is found the moment its second element is reached.",
    complexity: { time: "O(n)", space: "O(n)", justification: "Single pass with O(1) average hash map operations per element." },
    tradeoffs: ["Trades O(n) space for O(n) time versus the O(n^2)/O(1)-space brute force"],
    relevant_edge_cases: ["no valid pair exists", "duplicate values", "the same element used twice"],
    assumptions: ["Exactly one valid answer exists"],
    derivedFromExistingAnalysis: false,
    ...overrides,
  };
}

export function makeSubmission(overrides: Partial<StudentSubmission> = {}): StudentSubmission {
  return {
    id: "sub_1",
    student_id: "student_1",
    challenge_id: "challenge_1",
    problem_statement:
      "Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.",
    constraints: "2 <= nums.length <= 10^4",
    language: "python",
    source_code: [
      "def two_sum(nums, target):",
      "    seen = {}",
      "    for i, n in enumerate(nums):",
      "        complement = target - n",
      "        if complement in seen:",
      "            return [seen[complement], i]",
      "        seen[n] = i",
      "    return []",
    ].join("\n"),
    initial_explanation:
      "I used a hash map to remember numbers I've already seen so I can look up the complement in O(1) instead of scanning again.",
    execution: { ran: true, passed_tests: 10, total_tests: 10, runtime_ms: 12 },
    ...overrides,
  };
}

export function makeEvidence(overrides: Partial<EvidenceItem> = {}): EvidenceItem {
  return {
    id: overrides.id ?? nextId("ev"),
    assessment_id: "a1",
    dimension: "algorithm",
    concept: "hash map lookup",
    probe_id: "p1",
    probe_type: "explanation",
    question: "Why does a hash map help here?",
    student_response: "Because lookups are O(1) on average, so I don't need a nested loop.",
    expected_evidence: "References average O(1) lookup avoiding an O(n) nested scan.",
    observed_evidence: "Referenced O(1) average lookup avoiding nested scan.",
    result: "correct",
    confidence: 80,
    ai_provider_used: "mock",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

export function makeDimensionProfile(overrides: Partial<DimensionProfile> = {}): DimensionProfile {
  return {
    dimension: "problem",
    score: 0,
    confidence: 0,
    evidence_strength: "weak",
    status: "not_assessed",
    supporting_evidence: [],
    identified_gaps: [],
    ...overrides,
  };
}

export function makeDimensionsRecord(
  partial: Partial<Record<UnderstandingDimension, Partial<DimensionProfile>>> = {}
): Record<UnderstandingDimension, DimensionProfile> {
  const base = Object.fromEntries(
    UNDERSTANDING_DIMENSIONS.map((d) => [d, makeDimensionProfile({ dimension: d })])
  ) as Record<UnderstandingDimension, DimensionProfile>;
  for (const key of Object.keys(partial) as UnderstandingDimension[]) {
    base[key] = { ...base[key], ...partial[key] };
  }
  return base;
}

export function emptyEvidenceByDimension(): Record<UnderstandingDimension, EvidenceItem[]> {
  return Object.fromEntries(UNDERSTANDING_DIMENSIONS.map((d) => [d, [] as EvidenceItem[]])) as Record<
    UnderstandingDimension,
    EvidenceItem[]
  >;
}
