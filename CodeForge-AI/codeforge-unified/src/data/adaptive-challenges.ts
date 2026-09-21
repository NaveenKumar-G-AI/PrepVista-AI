interface SkillDef { id: string; name: string; parent: string | null; description: string; }

// The skill graph (Phase 2). Data-driven: this array is the ONLY place skill
// hierarchy is defined. Nothing in the recommendation/mastery code hardcodes
// "Arrays" or "Graphs" — they operate on whatever skills+relationships exist.
export const SKILLS: SkillDef[] = [
  { id: 'skill_programming', name: 'Programming', parent: null, description: 'Root of the technical skill graph.' },

  { id: 'skill_python', name: 'Python', parent: 'skill_programming', description: 'Python language proficiency.' },
  { id: 'skill_python_functions', name: 'Python Functions', parent: 'skill_python', description: 'Defining and using functions in Python.' },
  { id: 'skill_python_collections', name: 'Python Collections', parent: 'skill_python', description: 'dict/list/set/Counter/defaultdict usage.' },
  { id: 'skill_python_oop', name: 'Python OOP', parent: 'skill_python', description: 'Classes, objects, encapsulation in Python.' },

  { id: 'skill_data_structures', name: 'Data Structures', parent: 'skill_programming', description: 'Core data structures.' },
  { id: 'skill_arrays', name: 'Arrays', parent: 'skill_data_structures', description: 'Array/list manipulation.' },
  { id: 'skill_strings', name: 'Strings', parent: 'skill_data_structures', description: 'String manipulation.' },
  { id: 'skill_hash_maps', name: 'Hash Maps', parent: 'skill_data_structures', description: 'Hash map / dictionary based reasoning.' },
  { id: 'skill_stacks', name: 'Stacks', parent: 'skill_data_structures', description: 'LIFO structure usage.' },
  { id: 'skill_queues', name: 'Queues', parent: 'skill_data_structures', description: 'FIFO structure usage.' },
  { id: 'skill_trees', name: 'Trees', parent: 'skill_data_structures', description: 'Tree structures and traversal.' },
  { id: 'skill_graphs', name: 'Graphs', parent: 'skill_data_structures', description: 'Graph representation.' },

  { id: 'skill_algorithms', name: 'Algorithms', parent: 'skill_programming', description: 'Algorithmic technique.' },
  { id: 'skill_searching', name: 'Searching', parent: 'skill_algorithms', description: 'Search techniques incl. binary search.' },
  { id: 'skill_sorting', name: 'Sorting', parent: 'skill_algorithms', description: 'Sorting techniques.' },
  { id: 'skill_two_pointers', name: 'Two Pointers', parent: 'skill_algorithms', description: 'Two-pointer technique.' },
  { id: 'skill_sliding_window', name: 'Sliding Window', parent: 'skill_algorithms', description: 'Sliding window technique.' },
  { id: 'skill_recursion', name: 'Recursion', parent: 'skill_algorithms', description: 'Recursive problem solving.' },
  { id: 'skill_dp', name: 'Dynamic Programming', parent: 'skill_algorithms', description: 'DP technique.' },
  { id: 'skill_graph_algorithms', name: 'Graph Algorithms', parent: 'skill_algorithms', description: 'BFS/DFS/graph traversal & search.' },
];

// Relationships (Phase 3). from = source skill, to = dependent/related skill.
// For PREREQUISITE: `from` is a prerequisite OF `to`.
export const RELATIONSHIPS: { from: string; to: string; type: 'PREREQUISITE' | 'RELATED_TO' | 'BUILDS_ON' | 'TRANSFER_TO'; weight?: number }[] = [
  { from: 'skill_arrays', to: 'skill_two_pointers', type: 'PREREQUISITE' },
  { from: 'skill_arrays', to: 'skill_sliding_window', type: 'PREREQUISITE' },
  { from: 'skill_arrays', to: 'skill_searching', type: 'PREREQUISITE' },
  { from: 'skill_two_pointers', to: 'skill_sliding_window', type: 'BUILDS_ON' },
  { from: 'skill_hash_maps', to: 'skill_sliding_window', type: 'RELATED_TO' },
  { from: 'skill_stacks', to: 'skill_queues', type: 'RELATED_TO' },
  { from: 'skill_queues', to: 'skill_graph_algorithms', type: 'PREREQUISITE' },
  { from: 'skill_graphs', to: 'skill_graph_algorithms', type: 'PREREQUISITE' },
  { from: 'skill_recursion', to: 'skill_graph_algorithms', type: 'PREREQUISITE' },
  { from: 'skill_recursion', to: 'skill_dp', type: 'PREREQUISITE' },
  { from: 'skill_searching', to: 'skill_graph_algorithms', type: 'TRANSFER_TO', weight: 0.5 },
  { from: 'skill_python_functions', to: 'skill_python_oop', type: 'PREREQUISITE' },
];

interface ChallengeDef {
  id: string;
  title: string;
  primarySkill: string;
  secondarySkills?: string[];
  difficultyLevel: 'EASY' | 'MEDIUM' | 'HARD' | 'ADVANCED';
  difficultyScore: number;
  conceptDifficulty: number;
  implementationComplexity: number;
  constraintComplexity: number;
  reasoningComplexity: number;
  ambiguity: number;
  contextType: 'STANDARD' | 'NOVEL' | 'BRIDGE';
  harnessType: 'function' | 'stateful_ops';
  languages: ('javascript' | 'python')[];
  functionName: string;
  prompt: string;
  transferOf?: string;
  isVerification?: boolean;
  testCases: {
    id: string;
    language: 'javascript' | 'python';
    input: unknown;
    expected: unknown;
    isHidden?: boolean;
    category?: string;
  }[];
}

export const CHALLENGES: ChallengeDef[] = [
  {
    id: 'challenge_two_sum', title: 'Two Sum', primarySkill: 'skill_arrays', secondarySkills: ['skill_hash_maps'],
    difficultyLevel: 'EASY', difficultyScore: 2, conceptDifficulty: 1, implementationComplexity: 2, constraintComplexity: 1, reasoningComplexity: 2, ambiguity: 1,
    contextType: 'STANDARD', harnessType: 'function', languages: ['javascript'], functionName: 'twoSum',
    prompt: 'Given an array of integers nums and an integer target, return the indices of the two numbers that add up to target.',
    testCases: [
      { id: 'ts_basic1', language: 'javascript', input: [[2, 7, 11, 15], 9], expected: [0, 1], category: 'basic' },
      { id: 'ts_basic2', language: 'javascript', input: [[3, 2, 4], 6], expected: [1, 2], category: 'basic' },
      { id: 'ts_edge_dup', language: 'javascript', input: [[3, 3], 6], expected: [0, 1], category: 'edge' },
      { id: 'ts_basic3', language: 'javascript', input: [[1, 2, 3, 4, 5], 9], expected: [3, 4], category: 'basic', isHidden: true },
    ],
  },
  {
    id: 'challenge_valid_parens', title: 'Valid Parentheses', primarySkill: 'skill_stacks',
    difficultyLevel: 'EASY', difficultyScore: 2, conceptDifficulty: 2, implementationComplexity: 1, constraintComplexity: 1, reasoningComplexity: 1, ambiguity: 1,
    contextType: 'STANDARD', harnessType: 'function', languages: ['javascript'], functionName: 'isValidParentheses',
    prompt: "Given a string s containing '()[]{}', determine if the brackets are validly matched and nested.",
    testCases: [
      { id: 'vp_b1', language: 'javascript', input: ['()'], expected: true, category: 'basic' },
      { id: 'vp_b2', language: 'javascript', input: ['()[]{}'], expected: true, category: 'basic' },
      { id: 'vp_b3', language: 'javascript', input: ['(]'], expected: false, category: 'basic' },
      { id: 'vp_edge_empty', language: 'javascript', input: [''], expected: true, category: 'edge' },
      { id: 'vp_edge_unbalanced', language: 'javascript', input: ['((('], expected: false, category: 'edge' },
    ],
  },
  {
    id: 'challenge_binary_search', title: 'Binary Search', primarySkill: 'skill_searching',
    difficultyLevel: 'EASY', difficultyScore: 3, conceptDifficulty: 2, implementationComplexity: 2, constraintComplexity: 2, reasoningComplexity: 2, ambiguity: 1,
    contextType: 'STANDARD', harnessType: 'function', languages: ['javascript', 'python'], functionName: 'binarySearch',
    prompt: 'Given a sorted array nums and a target, return the index of target, or -1 if not present.',
    testCases: [
      { id: 'bs_basic1', language: 'javascript', input: [[1, 3, 5, 7, 9], 5], expected: 2, category: 'basic' },
      { id: 'bs_first', language: 'javascript', input: [[1, 3, 5, 7, 9], 1], expected: 0, category: 'edge' },
      { id: 'bs_last', language: 'javascript', input: [[1, 3, 5, 7, 9], 9], expected: 4, category: 'edge' },
      { id: 'bs_missing', language: 'javascript', input: [[1, 3, 5, 7, 9], 4], expected: -1, category: 'basic' },
      { id: 'bs_empty', language: 'javascript', input: [[], 5], expected: -1, category: 'edge', isHidden: true },
      { id: 'bs_py_basic1', language: 'python', input: [[1, 3, 5, 7, 9], 5], expected: 2, category: 'basic' },
      { id: 'bs_py_first', language: 'python', input: [[1, 3, 5, 7, 9], 1], expected: 0, category: 'edge' },
      { id: 'bs_py_last', language: 'python', input: [[1, 3, 5, 7, 9], 9], expected: 4, category: 'edge' },
      { id: 'bs_py_missing', language: 'python', input: [[1, 3, 5, 7, 9], 4], expected: -1, category: 'basic' },
      { id: 'bs_py_empty', language: 'python', input: [[], 5], expected: -1, category: 'edge' },
    ],
  },
  {
    id: 'challenge_search_rotated', title: 'Search in Rotated Sorted Array', primarySkill: 'skill_searching',
    difficultyLevel: 'MEDIUM', difficultyScore: 5, conceptDifficulty: 4, implementationComplexity: 3, constraintComplexity: 3, reasoningComplexity: 4, ambiguity: 2,
    contextType: 'NOVEL', harnessType: 'function', languages: ['javascript'], functionName: 'searchRotated', transferOf: 'challenge_binary_search',
    prompt: 'Given a rotated sorted array nums (unique values) and a target, return the index of target using O(log n), or -1.',
    testCases: [
      { id: 'sr_basic1', language: 'javascript', input: [[4, 5, 6, 7, 0, 1, 2], 0], expected: 4, category: 'basic' },
      { id: 'sr_basic2', language: 'javascript', input: [[4, 5, 6, 7, 0, 1, 2], 2], expected: 6, category: 'basic' },
      { id: 'sr_wrap', language: 'javascript', input: [[4, 5, 6, 7, 0, 1, 2], 1], expected: 5, category: 'basic' },
      { id: 'sr_not_found', language: 'javascript', input: [[4, 5, 6, 7, 0, 1, 2], 3], expected: -1, category: 'edge' },
    ],
  },
  {
    id: 'challenge_max_profit', title: 'Best Time to Buy and Sell Stock', primarySkill: 'skill_arrays',
    difficultyLevel: 'EASY', difficultyScore: 2, conceptDifficulty: 2, implementationComplexity: 1, constraintComplexity: 1, reasoningComplexity: 2, ambiguity: 1,
    contextType: 'STANDARD', harnessType: 'function', languages: ['javascript'], functionName: 'maxProfit',
    prompt: 'Given daily stock prices, return the maximum profit from a single buy followed by a single sell (0 if none).',
    testCases: [
      { id: 'mp_b1', language: 'javascript', input: [[7, 1, 5, 3, 6, 4]], expected: 5, category: 'basic' },
      { id: 'mp_b2', language: 'javascript', input: [[7, 6, 4, 3, 1]], expected: 0, category: 'basic' },
      { id: 'mp_edge_empty', language: 'javascript', input: [[]], expected: 0, category: 'edge' },
    ],
  },
  {
    id: 'challenge_longest_substring', title: 'Longest Substring Without Repeating Characters', primarySkill: 'skill_sliding_window', secondarySkills: ['skill_hash_maps'],
    difficultyLevel: 'MEDIUM', difficultyScore: 5, conceptDifficulty: 4, implementationComplexity: 3, constraintComplexity: 2, reasoningComplexity: 4, ambiguity: 2,
    contextType: 'STANDARD', harnessType: 'function', languages: ['javascript'], functionName: 'lengthOfLongestSubstring',
    prompt: 'Given a string s, return the length of the longest substring without repeating characters.',
    testCases: [
      { id: 'ls_b1', language: 'javascript', input: ['abcabcbb'], expected: 3, category: 'basic' },
      { id: 'ls_b2', language: 'javascript', input: ['bbbbb'], expected: 1, category: 'basic' },
      { id: 'ls_edge_empty', language: 'javascript', input: [''], expected: 0, category: 'edge' },
      { id: 'ls_b3', language: 'javascript', input: ['pwwkew'], expected: 3, category: 'basic', isHidden: true },
    ],
  },
  {
    id: 'challenge_queue_via_stacks', title: 'Implement Queue Using Two Stacks', primarySkill: 'skill_queues', secondarySkills: ['skill_stacks'],
    difficultyLevel: 'MEDIUM', difficultyScore: 5, conceptDifficulty: 4, implementationComplexity: 4, constraintComplexity: 2, reasoningComplexity: 4, ambiguity: 2,
    contextType: 'STANDARD', harnessType: 'stateful_ops', languages: ['javascript'], functionName: 'MyQueue',
    prompt: 'Implement a FIFO queue using only two stacks. Support push(x), pop(), peek(), isEmpty().',
    testCases: [
      {
        id: 'qs_basic', language: 'javascript', category: 'basic',
        input: { ops: [{ op: 'push', arg: 1 }, { op: 'push', arg: 2 }, { op: 'push', arg: 3 }, { op: 'pop' }, { op: 'pop' }, { op: 'pop' }] },
        expected: [null, null, null, 1, 2, 3],
      },
      {
        id: 'qs_interleaved', language: 'javascript', category: 'interleaved',
        input: { ops: [{ op: 'push', arg: 1 }, { op: 'push', arg: 2 }, { op: 'push', arg: 3 }, { op: 'pop' }, { op: 'push', arg: 4 }, { op: 'pop' }, { op: 'pop' }, { op: 'pop' }] },
        expected: [null, null, null, 1, null, 2, 3, 4],
      },
      { id: 'qs_edge_empty_pop', language: 'javascript', category: 'edge', input: { ops: [{ op: 'pop' }] }, expected: [null], isHidden: true },
    ],
  },
  {
    id: 'challenge_bfs_order', title: 'BFS Traversal Order', primarySkill: 'skill_graph_algorithms', secondarySkills: ['skill_queues'],
    difficultyLevel: 'HARD', difficultyScore: 6, conceptDifficulty: 5, implementationComplexity: 4, constraintComplexity: 3, reasoningComplexity: 5, ambiguity: 2,
    contextType: 'STANDARD', harnessType: 'function', languages: ['javascript'], functionName: 'bfsOrder',
    prompt: 'Given n nodes (0..n-1), an undirected edge list, and a start node, return nodes in breadth-first visit order.',
    testCases: [
      { id: 'bfs_b1', language: 'javascript', input: [6, [[0, 1], [0, 2], [1, 3], [2, 4], [3, 5]], 0], expected: [0, 1, 2, 3, 4, 5], category: 'basic' },
      { id: 'bfs_disc', language: 'javascript', input: [4, [[0, 1]], 0], expected: [0, 1], category: 'edge' },
      { id: 'bfs_single', language: 'javascript', input: [1, [], 0], expected: [0], category: 'edge', isHidden: true },
    ],
  },
  {
    id: 'challenge_climbing_stairs', title: 'Climbing Stairs', primarySkill: 'skill_recursion', secondarySkills: ['skill_dp'],
    difficultyLevel: 'MEDIUM', difficultyScore: 4, conceptDifficulty: 3, implementationComplexity: 2, constraintComplexity: 2, reasoningComplexity: 3, ambiguity: 1,
    contextType: 'STANDARD', harnessType: 'function', languages: ['javascript'], functionName: 'climbingStairs',
    prompt: 'You can climb 1 or 2 steps at a time. Given n steps, return the number of distinct ways to reach the top.',
    testCases: [
      { id: 'cs_b1', language: 'javascript', input: [2], expected: 2, category: 'basic' },
      { id: 'cs_b2', language: 'javascript', input: [3], expected: 3, category: 'basic' },
      { id: 'cs_b3', language: 'javascript', input: [5], expected: 8, category: 'basic' },
      { id: 'cs_edge1', language: 'javascript', input: [1], expected: 1, category: 'edge' },
    ],
  },
  {
    id: 'challenge_word_frequency', title: 'Word Frequency Counter', primarySkill: 'skill_python_collections',
    difficultyLevel: 'EASY', difficultyScore: 2, conceptDifficulty: 1, implementationComplexity: 2, constraintComplexity: 1, reasoningComplexity: 1, ambiguity: 1,
    contextType: 'STANDARD', harnessType: 'function', languages: ['python'], functionName: 'word_frequency',
    prompt: 'Given a text string, return a dict mapping each lowercase word to its number of occurrences.',
    testCases: [
      { id: 'wf_b1', language: 'python', input: ['the quick brown fox the lazy dog the'], expected: { the: 3, quick: 1, brown: 1, fox: 1, lazy: 1, dog: 1 }, category: 'basic' },
      { id: 'wf_edge_empty', language: 'python', input: [''], expected: {}, category: 'edge' },
      { id: 'wf_b2', language: 'python', input: ['Hello hello HELLO'], expected: { hello: 3 }, category: 'basic' },
    ],
  },
];

