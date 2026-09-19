import { assessmentTasks } from '@/modules/coding/data/assessment-tasks';
import { assessmentSolutions } from '@/modules/coding/data/assessment-solutions';
import { assessmentChallenges } from './assessments';
import { CHALLENGES } from '@/modules/coding/data/adaptive-challenges';
import { diagnosticTasks } from '@/modules/coding/data/diagnostics';
import { TestCategory, type TestCase } from '@/modules/coding/engines/challenges/domain/types';
import { adaptiveChallenges } from './adaptive';
import { SEED_CHALLENGES } from '@/modules/coding/engines/challenges/data/seedChallenges';
import { SupportedLanguage } from '@/modules/coding/engines/challenges/domain/types';
const implementations: Record<string, { starter: string; solution: string }> = {
  dedupe_vectors: {
    starter: 'function dedupe_vectors(vectors) {\n  const result = [];\n  for (let i = 0; i < vectors.length - 1; i++) {\n    if (!result.some(v => JSON.stringify(v) === JSON.stringify(vectors[i]))) {\n      result.push(vectors[i]);\n    }\n  }\n  result.push(vectors[vectors.length - 1]);\n  return result;\n}\n',
    solution: 'function dedupe_vectors(vectors) {\n  const seen = new Set();\n  return vectors.filter(vector => {\n    const key = JSON.stringify(vector);\n    if (seen.has(key)) return false;\n    seen.add(key);\n    return true;\n  });\n}',
  },
  merge_by_email: {
    starter: 'function merge_by_email(list_a, list_b) {\n  // Normalize email addresses, keep the first record, then join.\n  return [];\n}\n',
    solution: 'function merge_by_email(list_a, list_b) {\n  const index = rows => {\n    const map = new Map();\n    for (const row of rows) {\n      const email = row.email.trim().toLowerCase();\n      if (!map.has(email)) map.set(email, row);\n    }\n    return map;\n  };\n  const a = index(list_a), b = index(list_b);\n  return [...a.keys()].filter(email => b.has(email)).sort().map(email => ({ email, features: a.get(email).features, label: b.get(email).label }));\n}',
  },
  validate_signup: {
    starter: 'function validate_signup(payload) {\n  // Report each validation error in the specified order.\n  return { valid: true, errors: [] };\n}\n',
    solution: 'function validate_signup(payload) {\n  const errors = [];\n  const email = payload.email;\n  if (typeof email !== "string" || !email.includes("@") || !email.slice(email.indexOf("@") + 1).includes(".")) errors.push("invalid_email");\n  if (typeof payload.password !== "string" || payload.password.length < 8) errors.push("weak_password");\n  if (!Number.isInteger(payload.age) || payload.age < 13) errors.push("invalid_age");\n  return { valid: errors.length === 0, errors };\n}',
  },
  word_frequencies: {
    starter: 'function word_frequencies(text) {\n  // Count lowercase alphanumeric words.\n  return {};\n}\n',
    solution: 'function word_frequencies(text) {\n  const counts = Object.create(null);\n  for (const word of text.toLowerCase().match(/[a-z0-9\']+/g) || []) {\n    counts[word] = (counts[word] || 0) + 1;\n  }\n  return counts;\n}',
  },
  search_insert_position: {
    starter: 'function search_insert_position(nums, target) {\n  // Find the first index whose value is at least target.\n  return 0;\n}\n',
    solution: 'function search_insert_position(nums, target) {\n  let lo = 0, hi = nums.length;\n  while (lo < hi) {\n    const mid = lo + Math.floor((hi - lo) / 2);\n    if (nums[mid] < target) lo = mid + 1;\n    else hi = mid;\n  }\n  return lo;\n}',
  },
};
export const challenges = [...SEED_CHALLENGES.map(c => ({ ...c,
  supportedLanguages: [SupportedLanguage.JAVASCRIPT, ...c.supportedLanguages],
  starterCode: { ...c.starterCode, javascript: implementations[c.evaluationMetadata.entryFunction].starter },
  solutionMetadata: { ...c.solutionMetadata, referenceSolution: { ...c.solutionMetadata.referenceSolution, javascript: implementations[c.evaluationMetadata.entryFunction].solution } },
})), ...adaptiveChallenges, ...assessmentChallenges];

// Merge useful test cases from overlapping prototypes into the canonical exercises.
for (const challenge of challenges) {
  const additional: TestCase[] = [];
  if (challenge.challengeId === 'count-word-frequencies') {
    for (const [i, t] of diagnosticTasks.pf_1.testCases.entries()) additional.push({ id: 'diagnostic-word-' + i, input: t.args, expectedOutput: t.expected, hidden: true, category: TestCategory.NORMAL, points: 1 });
    for (const t of CHALLENGES.find(c => c.functionName === 'word_frequency')!.testCases) additional.push({ id: 'adaptive-' + t.id, input: t.input as unknown[], expectedOutput: t.expected, hidden: true, category: TestCategory.NORMAL, points: 1 });
  }
  if (challenge.challengeId === 'challenge_two_sum') {
    challenge.description += '\nThe original Python, Java and C++ programs use stdin/stdout: first line contains space-separated numbers; second line contains the target. Print the two indices separated by a space. JavaScript uses the function contract shown in the examples.';
    for (const key of ['two_sum', 'two_sum_java', 'two_sum_cpp'] as const) {
      const original = assessmentTasks.find(t => t.sourceKey === key)!;
      const language = original.language as SupportedLanguage;
      challenge.supportedLanguages.push(language);
      challenge.starterCode[language] = original.starter_code;
      challenge.solutionMetadata.referenceSolution[language] = assessmentSolutions[key].code;
    }
    for (const [i, t] of diagnosticTasks.algo_1.testCases.entries()) additional.push({ id: 'diagnostic-two-sum-' + i, input: t.args, expectedOutput: t.expected, hidden: true, category: TestCategory.NORMAL, points: 1 });
  }
  const seen = new Set([...challenge.publicTests, ...challenge.hiddenTests].map(t => JSON.stringify(t.input)));
  for (const test of additional) if (!seen.has(JSON.stringify(test.input))) { challenge.hiddenTests.push(test); seen.add(JSON.stringify(test.input)); }
}
