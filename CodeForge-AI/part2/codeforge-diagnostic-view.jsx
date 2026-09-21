import { useState, useMemo, useRef } from "react";
import {
  CheckCircle2, XCircle, Circle, ChevronRight, Lightbulb, Loader2,
  RotateCcw, Info, AlertTriangle, Play, ArrowRight,
} from "lucide-react";

/* =========================================================================
   DESIGN TOKENS
   Inspired by a calibration certificate / lab evidence sheet rather than a
   generic dev-tool dark theme: paper surface, ink text, a single amber
   "evidence" accent. The signature element is the Evidence Tape running
   across the top of the diagnostic screen — a literal, chronological record
   of what the engine asked and what it learned, because that's the whole
   thesis of this product (evidence over a single fake score).
   ========================================================================= */
const C = {
  bg: "#EEF0E4", surface: "#FBFBF5", surfaceAlt: "#F4F1E4",
  ink: "#20291F", inkMuted: "#5C6B58", border: "#D9DBC6", borderStrong: "#B7BBA0",
  amber: "#B87220", amberDeep: "#7A4B12", amberBg: "#F1E1C6",
  correct: "#2F6E4B", correctBg: "#DEEBDF",
  incorrect: "#AE3B2C", incorrectBg: "#F3DFD9",
  partial: "#A9791A", partialBg: "#F1E5C4",
  low: "#8C6A4E", lowBg: "#EFE4D3",
  insufficient: "#8B8B76", insufficientBg: "#E8E8D9",
};
const FONT_DISPLAY = "'IBM Plex Sans Condensed', sans-serif";
const FONT_BODY = "'IBM Plex Sans', sans-serif";
const FONT_MONO = "'IBM Plex Mono', monospace";

const LEVELS = ["FOUNDATION", "DEVELOPING", "COMPETENT", "STRONG", "ADVANCED"];
const LEVEL_RANK = LEVELS.reduce((a, l, i) => ({ ...a, [l]: i }), {});
const CONFIDENCE_STYLE = {
  INSUFFICIENT_EVIDENCE: { fg: C.insufficient, bg: C.insufficientBg, label: "Insufficient evidence" },
  LOW: { fg: C.low, bg: C.lowBg, label: "Low confidence" },
  MEDIUM: { fg: C.partial, bg: C.partialBg, label: "Medium confidence" },
  HIGH: { fg: C.correct, bg: C.correctBg, label: "High confidence" },
};
const PERFORMANCE_STYLE = {
  CORRECT: { fg: C.correct, bg: C.correctBg, Icon: CheckCircle2 },
  PARTIAL: { fg: C.partial, bg: C.partialBg, Icon: Circle },
  INCORRECT: { fg: C.incorrect, bg: C.incorrectBg, Icon: XCircle },
  UNSCORED: { fg: C.insufficient, bg: C.insufficientBg, Icon: Info },
};

/* =========================================================================
   DOMAIN MODEL — ported from domain-model.js. Kept behaviorally identical
   to the tested Node engine on purpose; a single-file browser artifact
   cannot require() the server files, so this is a deliberate duplication,
   not an independent reimplementation. See the truth table for this
   tradeoff.
   ========================================================================= */
const SKILLS = {
  prog_fund: { id: "prog_fund", name: "Programming fundamentals" },
  data_handling: { id: "data_handling", name: "Data handling" },
  algorithms: { id: "algorithms", name: "Algorithms & DSA" },
  complexity: { id: "complexity", name: "Complexity reasoning" },
  recursion: { id: "recursion", name: "Recursion" },
  debugging: { id: "debugging", name: "Debugging" },
  ml_fund: { id: "ml_fund", name: "ML fundamentals" },
  tech_reasoning: { id: "tech_reasoning", name: "Technical reasoning" },
  apis: { id: "apis", name: "APIs" },
  sql: { id: "sql", name: "SQL" },
  databases: { id: "databases", name: "Databases" },
};

const ROLES = {
  ai_ml: { id: "ai_ml", name: "AI / ML Engineer", requiredSkills: ["prog_fund", "algorithms", "complexity", "debugging", "ml_fund", "tech_reasoning"] },
  backend: { id: "backend", name: "Backend Engineer", requiredSkills: ["prog_fund", "apis", "sql", "debugging", "databases"] },
};

const CORRECT_WORD_FREQ_CODE = `function wordFrequency(text) {
  const words = text.toLowerCase().match(/[a-z']+/g) || [];
  const freq = {};
  for (const w of words) freq[w] = (freq[w] || 0) + 1;
  return freq;
}`;
const CORRECT_TWO_SUM_CODE = `function twoSum(nums, target) {
  const seen = {};
  for (let i = 0; i < nums.length; i++) {
    const need = target - nums[i];
    if (need in seen) return [seen[need], i];
    seen[nums[i]] = i;
  }
  return [];
}`;

const TASKS = {
  pf_1: {
    id: "pf_1", version: 1, title: "Word frequency counter", taskType: "CODING", difficulty: "FOUNDATION",
    prompt: "Write a function wordFrequency(text) that returns an object mapping each lowercase word to how many times it appears. Ignore punctuation.",
    starterCode: "function wordFrequency(text) {\n  // return an object like { the: 2, cat: 1 }\n}",
    functionName: "wordFrequency",
    testCases: [
      { args: ["the cat sat on the mat"], expected: { the: 2, cat: 1, sat: 1, on: 1, mat: 1 } },
      { args: ["a a a b b c"], expected: { a: 3, b: 2, c: 1 } },
      { args: ["Hello, hello world!"], expected: { hello: 2, world: 1 }, hidden: true },
    ],
    skills: [{ skillId: "prog_fund", relationship: "PRIMARY", weight: 1 }, { skillId: "data_handling", relationship: "SECONDARY", weight: 0.5 }],
  },
  algo_1: {
    id: "algo_1", version: 1, title: "Two sum (indices)", taskType: "CODING", difficulty: "INTERMEDIATE",
    prompt: "Write twoSum(nums, target) returning indices [i, j] with i < j of the two numbers that add to target. Exactly one solution exists.",
    starterCode: "function twoSum(nums, target) {\n  // return [i, j] with i < j\n}",
    functionName: "twoSum",
    testCases: [
      { args: [[2, 7, 11, 15], 9], expected: [0, 1] },
      { args: [[3, 2, 4], 6], expected: [1, 2] },
      { args: [[1, 5, 3, 7, 9], 16], expected: [3, 4], hidden: true },
    ],
    skills: [{ skillId: "algorithms", relationship: "PRIMARY", weight: 1 }, { skillId: "prog_fund", relationship: "SECONDARY", weight: 0.5 }, { skillId: "complexity", relationship: "CONTEXTUAL", weight: 0.25 }],
    prerequisiteCheckTaskId: "recursion_1",
  },
  complexity_1: {
    id: "complexity_1", version: 1, title: "Time complexity of a nested search", taskType: "COMPLEXITY_REASONING", difficulty: "INTERMEDIATE",
    prompt: "function hasDuplicatePair(arr) {\n  for (let i = 0; i < arr.length; i++) {\n    for (let j = i + 1; j < arr.length; j++) {\n      if (arr[i] === arr[j]) return true;\n    }\n  }\n  return false;\n}\n\nWhat is the time complexity of hasDuplicatePair, for an array of length n?",
    options: ["O(n)", "O(n log n)", "O(n^2)", "O(2^n)"], correctIndex: 2,
    skills: [{ skillId: "complexity", relationship: "PRIMARY", weight: 1 }, { skillId: "algorithms", relationship: "PREREQUISITE", weight: 0.5 }],
    prerequisiteCheckTaskId: "recursion_1",
  },
  recursion_1: {
    id: "recursion_1", version: 1, title: "Tracing a recursive function", taskType: "CODE_READING", difficulty: "FOUNDATION",
    prompt: "function countDown(n) {\n  if (n <= 0) return [];\n  return [n, ...countDown(n - 1)];\n}\n\nWhat does countDown(3) return?",
    options: ["[3, 2, 1]", "[1, 2, 3]", "[3, 2, 1, 0]", "An infinite loop"], correctIndex: 0,
    skills: [{ skillId: "recursion", relationship: "PRIMARY", weight: 1 }],
  },
  debug_1: {
    id: "debug_1", version: 1, title: "Off-by-one in a running total", taskType: "DEBUGGING", difficulty: "INTERMEDIATE",
    prompt: "function sumAll(arr) {\n  let total = 0;\n  for (let i = 0; i <= arr.length; i++) {\n    total += arr[i];\n  }\n  return total;\n}\n\nsumAll([1, 2, 3]) returns NaN instead of 6. What is wrong?",
    options: ["The loop condition should be i < arr.length, not i <= arr.length", "total should start at 1, not 0", "The loop should start at i = 1", "total += arr[i] should be total = arr[i]"], correctIndex: 0,
    skills: [{ skillId: "debugging", relationship: "PRIMARY", weight: 1 }, { skillId: "prog_fund", relationship: "SECONDARY", weight: 0.5 }],
  },
  ml_1: {
    id: "ml_1", version: 1, title: "Bias-variance tradeoff", taskType: "CONCEPTUAL", difficulty: "EASY",
    prompt: "In 2-3 sentences: explain the bias-variance tradeoff and why it matters when choosing a model.",
    skills: [{ skillId: "ml_fund", relationship: "PRIMARY", weight: 1 }],
    aiRubric: "A correct answer explains bias as error from overly simple assumptions (underfitting) and variance as error from sensitivity to the training data (overfitting), and notes total error is minimized somewhere between the two extremes.",
    keyTerms: ["bias", "variance", "underfitting", "overfitting", "tradeoff", "balance"],
  },
  ml_2: {
    id: "ml_2", version: 1, title: "Diagnosing a generalization gap", taskType: "TECHNICAL_REASONING", difficulty: "INTERMEDIATE",
    prompt: "A model reaches 99% accuracy on the training set but 60% on the test set. What is most likely happening, and what would you try first?",
    skills: [{ skillId: "ml_fund", relationship: "PRIMARY", weight: 1 }, { skillId: "tech_reasoning", relationship: "SECONDARY", weight: 0.5 }],
    aiRubric: 'Correctly identifies overfitting, and proposes a reasonable next step: regularization, more data, a simpler model, cross-validation, or a data-leakage check. A misdiagnosis as underfitting, or "just train longer", is a miss.',
    keyTerms: ["overfit", "regulariz", "data", "cross-validation", "leakage", "simpler"],
  },
  api_1: {
    id: "api_1", version: 1, title: "Reading an Express handler", taskType: "CODE_READING", difficulty: "EASY",
    prompt: 'app.get("/users/:id", (req, res) => {\n  const user = findUser(req.params.id);\n  if (!user) {\n    return res.status(404).json({ error: "not found" });\n  }\n  res.json(user);\n});\n\nWhat status code is sent when the user is not found?',
    options: ["200", "400", "404", "500"], correctIndex: 2,
    skills: [{ skillId: "apis", relationship: "PRIMARY", weight: 1 }],
  },
  sql_1: {
    id: "sql_1", version: 1, title: "Query: students above a threshold", taskType: "CODING", difficulty: "INTERMEDIATE",
    prompt: "Table students(id, name, cgpa). Write a SQL query returning name and cgpa for every student with cgpa greater than 8, ordered by cgpa descending.",
    skills: [{ skillId: "sql", relationship: "PRIMARY", weight: 1 }, { skillId: "databases", relationship: "SECONDARY", weight: 0.5 }],
    sqlChecks: [{ pattern: /select/i, label: "SELECT clause" }, { pattern: /from\s+students/i, label: "FROM students" }, { pattern: /cgpa\s*>\s*8/i, label: "cgpa > 8 filter" }, { pattern: /order\s+by\s+cgpa\s+desc/i, label: "ORDER BY cgpa DESC" }],
  },
  debug_2: {
    id: "debug_2", version: 1, title: "Missing await in an async handler", taskType: "DEBUGGING", difficulty: "INTERMEDIATE",
    prompt: 'app.post("/orders", async (req, res) => {\n  saveOrder(req.body);\n  res.status(201).json({ ok: true });\n});\n// saveOrder is: async function saveOrder(data) { await db.insert(data); }\n\nThe response sometimes returns before the write finishes. What is the bug?',
    options: ["saveOrder(req.body) is missing an await", "res.status(201) should be res.status(200)", "req.body should be req.params", "saveOrder should not be async"], correctIndex: 0,
    skills: [{ skillId: "debugging", relationship: "PRIMARY", weight: 1 }, { skillId: "apis", relationship: "SECONDARY", weight: 0.5 }],
  },
  db_1: {
    id: "db_1", version: 1, title: "When to add an index", taskType: "TECHNICAL_REASONING", difficulty: "INTERMEDIATE",
    prompt: "A students table has 200,000 rows. A query filtering by email is slow. Would you add an index on email? What would you check first, and is there any downside?",
    skills: [{ skillId: "databases", relationship: "PRIMARY", weight: 1 }],
    aiRubric: "Recognizes an index on email would likely help a filter/lookup, mentions checking selectivity or the query plan first, and names a real downside (write/insert overhead, storage, index maintenance).",
    keyTerms: ["index", "select", "plan", "cost", "storage", "maintenance", "overhead"],
  },
};
const ROLE_TASK_POOL = {
  ai_ml: ["pf_1", "algo_1", "complexity_1", "debug_1", "ml_1", "ml_2", "recursion_1"],
  backend: ["pf_1", "api_1", "sql_1", "debug_2", "db_1"],
};
function buildBlueprint(role) {
  return { taskBudget: role.id === "ai_ml" ? 7 : 5, requiredSkills: role.requiredSkills, minEvidencePerSkill: 1 };
}

/* =========================================================================
   ENGINE — ported 1:1 from adaptive-engine.js (post-fix). See
   demo-verify.js in the delivered files for this exact logic verified
   against six fixture students with real assertions, not just review.
   ========================================================================= */
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a == null || b == null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === "object") {
    const ak = Object.keys(a).sort(), bk = Object.keys(b).sort();
    if (ak.length !== bk.length || ak.some((k, i) => k !== bk[i])) return false;
    return ak.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}
function runJsTests(code, testCases, functionName) {
  let fn;
  try {
    // eslint-disable-next-line no-new-func
    fn = new Function(`${code}\nreturn typeof ${functionName} !== 'undefined' ? ${functionName} : null;`)();
  } catch (e) {
    return { passed: 0, total: testCases.length, error: e.message, results: [] };
  }
  if (typeof fn !== "function") return { passed: 0, total: testCases.length, error: `${functionName} is not defined`, results: [] };
  let passed = 0;
  const results = testCases.map((tc) => {
    try {
      const actual = fn(...tc.args);
      const ok = deepEqual(actual, tc.expected);
      if (ok) passed++;
      return { ...tc, actual, ok };
    } catch (e) {
      return { ...tc, actual: `threw: ${e.message}`, ok: false };
    }
  });
  return { passed, total: testCases.length, results };
}
function needsOpenEndedEvaluation(task) {
  return ["CONCEPTUAL", "TECHNICAL_REASONING", "EXPLANATION"].includes(task.taskType);
}
function evaluateDeterministic(task, response) {
  if (task.taskType === "CODING") {
    if (task.testCases) {
      const r = runJsTests(response.code || "", task.testCases, task.functionName);
      if (r.error) return { performance: "INCORRECT", detail: `Code did not run: ${r.error}`, testResults: r };
      if (r.passed === r.total) return { performance: "CORRECT", detail: `${r.passed}/${r.total} tests passed`, testResults: r };
      if (r.passed > 0) return { performance: "PARTIAL", detail: `${r.passed}/${r.total} tests passed`, testResults: r };
      return { performance: "INCORRECT", detail: `${r.passed}/${r.total} tests passed`, testResults: r };
    }
    if (task.sqlChecks) {
      const text = response.text || "";
      const matched = task.sqlChecks.filter((c) => c.pattern.test(text));
      const passed = matched.length, total = task.sqlChecks.length;
      const detail = `${passed}/${total} required clauses present`;
      if (passed === total) return { performance: "CORRECT", detail };
      if (passed >= total - 1) return { performance: "PARTIAL", detail };
      return { performance: "INCORRECT", detail };
    }
  }
  if (["DEBUGGING", "CODE_READING", "COMPLEXITY_REASONING"].includes(task.taskType)) {
    if (response.optionIdx === task.correctIndex) return { performance: "CORRECT", detail: "Correct option selected" };
    return { performance: "INCORRECT", detail: `Selected option ${response.optionIdx}, correct was ${task.correctIndex}` };
  }
  return { performance: "UNSCORED", detail: "No deterministic check configured" };
}
function recordEvidence(evidenceBySkill, task, evalResult, response) {
  const independence = (response.hints || 0) > 0 ? "ASSISTED" : "INDEPENDENT";
  const next = { ...evidenceBySkill };
  task.skills.forEach((ts) => {
    const entry = {
      taskId: task.id, taskVersion: task.version, relationship: ts.relationship, weight: ts.weight,
      performance: evalResult.performance, independence, hints: response.hints || 0, difficulty: task.difficulty,
      selectedOption: response.optionIdx !== undefined ? response.optionIdx : null,
      aiEvaluation: evalResult.aiEvaluation || null, observedAt: Date.now(),
    };
    next[ts.skillId] = [...(next[ts.skillId] || []), entry];
  });
  return next;
}
function computeSkillConfidence(evidenceList) {
  if (!evidenceList || evidenceList.length === 0) return "INSUFFICIENT_EVIDENCE";
  const n = evidenceList.length;
  if (n === 1) return "LOW";
  const outcomes = evidenceList.map((e) => e.performance);
  const allSame = outcomes.every((o) => o === outcomes[0]);
  if (!allSame) return "LOW";
  return n >= 3 ? "HIGH" : "MEDIUM";
}
function computeSkillLevel(evidenceList) {
  if (!evidenceList || evidenceList.length === 0) return null;
  const difficultyBonus = { FOUNDATION: 0, EASY: 0.15, INTERMEDIATE: 0.3, ADVANCED: 0.45 };
  let weightedScore = 0, weightSum = 0;
  evidenceList.forEach((e) => {
    const base = e.performance === "CORRECT" ? 1 : e.performance === "PARTIAL" ? 0.5 : 0;
    const bonus = base > 0 ? (difficultyBonus[e.difficulty] || 0) : 0;
    const penalty = e.independence === "ASSISTED" ? 0.25 : 0;
    weightedScore += Math.max(0, base + bonus - penalty) * e.weight;
    weightSum += e.weight;
  });
  const score = weightSum > 0 ? weightedScore / weightSum : 0;
  let level;
  if (score <= 0.15) level = "FOUNDATION";
  else if (score <= 0.5) level = "DEVELOPING";
  else if (score <= 0.85) level = "COMPETENT";
  else if (score <= 1.15) level = "STRONG";
  else level = "ADVANCED";
  if (evidenceList.length === 1 && LEVEL_RANK[level] > LEVEL_RANK.COMPETENT) level = "COMPETENT";
  return level;
}
function buildWhyText(skillId, evidenceList) {
  const name = SKILLS[skillId].name.toLowerCase();
  if (!evidenceList || evidenceList.length === 0) return `No tasks targeting ${name} were reached in this session.`;
  const total = evidenceList.length;
  const correct = evidenceList.filter((e) => e.performance === "CORRECT").length;
  const partial = evidenceList.filter((e) => e.performance === "PARTIAL").length;
  const hinted = evidenceList.filter((e) => e.hints > 0).length;
  const hasPrimary = evidenceList.some((e) => e.relationship === "PRIMARY");
  let text = `${correct} of ${total} ${name} task${total === 1 ? "" : "s"} correct`;
  if (partial > 0) text += `, ${partial} partially correct`;
  if (hinted > 0) text += `, ${hinted} required a hint`;
  if (!hasPrimary) text += " — indirect evidence only, from tasks primarily targeting a different skill";
  return text + ".";
}
function selectNextTask(role, blueprint, state) {
  const pool = ROLE_TASK_POOL[role.id];
  const remainingIds = pool.filter((id) => !state.presentedTaskIds.includes(id));
  if (state.presentedTaskIds.length >= blueprint.taskBudget) return { taskId: null, reason: "Task budget reached." };
  if (remainingIds.length === 0) return { taskId: null, reason: "No further validated tasks remain in the pool for this role." };
  if (state.pendingPrerequisiteTaskId && remainingIds.includes(state.pendingPrerequisiteTaskId)) {
    const t = TASKS[state.pendingPrerequisiteTaskId];
    const primarySkill = t.skills.find((s) => s.relationship === "PRIMARY").skillId;
    return { taskId: t.id, reason: `Checking prerequisite skill "${SKILLS[primarySkill].name}" after a weak signal on a dependent skill — one failure isn't enough to call the dependent skill weak.` };
  }
  const evidenceCounts = {};
  blueprint.requiredSkills.forEach((s) => { evidenceCounts[s] = (state.evidenceBySkill[s] || []).length; });
  const candidates = remainingIds.map((id) => TASKS[id]).filter((t) => {
    const primary = t.skills.find((s) => s.relationship === "PRIMARY");
    return primary && blueprint.requiredSkills.includes(primary.skillId);
  });
  if (candidates.length === 0) return { taskId: null, reason: "Every required skill already has at least one piece of evidence." };
  candidates.sort((a, b) => {
    const aSkill = a.skills.find((s) => s.relationship === "PRIMARY").skillId;
    const bSkill = b.skills.find((s) => s.relationship === "PRIMARY").skillId;
    return evidenceCounts[aSkill] - evidenceCounts[bSkill];
  });
  const chosen = candidates[0];
  const chosenSkill = chosen.skills.find((s) => s.relationship === "PRIMARY").skillId;
  const evCount = evidenceCounts[chosenSkill];
  const reason = evCount === 0
    ? `No evidence yet for ${SKILLS[chosenSkill].name}, which this role requires.`
    : `${SKILLS[chosenSkill].name} has limited evidence so far (${evCount} data point${evCount === 1 ? "" : "s"}) — this adds an independent check rather than repeating what we already know.`;
  return { taskId: chosen.id, reason };
}
function shouldStop(role, blueprint, state) {
  if (state.presentedTaskIds.length >= blueprint.taskBudget) return "TASK_BUDGET_REACHED";
  const pool = ROLE_TASK_POOL[role.id];
  const remaining = pool.filter((id) => !state.presentedTaskIds.includes(id));
  if (state.pendingPrerequisiteTaskId && remaining.includes(state.pendingPrerequisiteTaskId)) return null;
  const uncovered = blueprint.requiredSkills.filter((s) => (state.evidenceBySkill[s] || []).length < blueprint.minEvidencePerSkill);
  if (uncovered.length > 0) {
    const canStillCover = uncovered.some((s) => remaining.some((id) => TASKS[id].skills.some((sk) => sk.skillId === s)));
    return canStillCover ? null : "TASK_BANK_EXHAUSTED";
  }
  return "EVIDENCE_SUFFICIENT";
}
function generateBaseline(role, state) {
  const allSkillIds = new Set([...role.requiredSkills, ...Object.keys(state.evidenceBySkill)]);
  const rows = [...allSkillIds].map((skillId) => {
    const ev = state.evidenceBySkill[skillId] || [];
    return { skillId, skillName: SKILLS[skillId].name, required: role.requiredSkills.includes(skillId), level: computeSkillLevel(ev), confidence: computeSkillConfidence(ev), evidenceCount: ev.length, why: buildWhyText(skillId, ev), evidence: ev };
  });
  rows.sort((a, b) => (b.required - a.required) || a.skillName.localeCompare(b.skillName));
  return rows;
}
function pickRecommendation(baseline) {
  const candidates = baseline.filter((b) => b.required && b.confidence !== "INSUFFICIENT_EVIDENCE" && b.level);
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level]);
  const weakest = sorted[0];
  if (LEVEL_RANK[weakest.level] >= LEVEL_RANK.COMPETENT) return null;
  return { skillId: weakest.skillId, skillName: weakest.skillName, reason: `${weakest.why} This is the lowest-confidence required skill with real evidence behind it.` };
}

/* =========================================================================
   AI EVALUATION — real Claude call (Sonnet 4.6, no key needed in artifacts)
   as the stand-in for Groq/Gemini, sharing the exact same prompt/schema
   contract as ai-evaluation-contract.js. Falls back to the same local
   keyword heuristic used in demo-verify.js if the call fails, so a
   network hiccup never reads as "you got this wrong."
   ========================================================================= */
function buildEvaluationPrompt(task, responseText) {
  return [
    "You are grading one open-ended technical diagnostic response.",
    'Return ONLY a JSON object, no prose, no markdown fences, matching exactly: {"conceptual_understanding":"FOUNDATION|DEVELOPING|COMPETENT|STRONG","reasoning_quality":"<one short sentence>","misconceptions":["<short phrase>"],"evidence":["<short phrase>"],"confidence":"LOW|MEDIUM|HIGH"}',
    "", `Task: ${task.title}`, `Prompt given to the student: ${task.prompt}`,
    task.aiRubric ? `Grading rubric: ${task.aiRubric}` : "",
    "", `Student response: ${responseText || "(empty)"}`,
  ].filter(Boolean).join("\n");
}
function validateAiEvaluation(raw) {
  const understanding = ["FOUNDATION", "DEVELOPING", "COMPETENT", "STRONG"];
  const confidence = ["LOW", "MEDIUM", "HIGH"];
  if (!raw || typeof raw !== "object") return { valid: false };
  if (!understanding.includes(raw.conceptual_understanding)) return { valid: false };
  if (!confidence.includes(raw.confidence)) return { valid: false };
  if (typeof raw.reasoning_quality !== "string") return { valid: false };
  if (!Array.isArray(raw.misconceptions) || !Array.isArray(raw.evidence)) return { valid: false };
  return { valid: true, value: raw };
}
function understandingToPerformance(u) {
  if (u === "STRONG" || u === "COMPETENT") return "CORRECT";
  if (u === "DEVELOPING") return "PARTIAL";
  return "INCORRECT";
}
function localHeuristicEvaluate(task, responseText) {
  const text = (responseText || "").toLowerCase().trim();
  if (text.length < 8) {
    return { performance: "INCORRECT", detail: "Response too short to evaluate", aiEvaluation: { conceptual_understanding: "FOUNDATION", reasoning_quality: "Response too short to assess.", misconceptions: [], evidence: [], confidence: "LOW" } };
  }
  const terms = task.keyTerms || [];
  const hits = terms.filter((t) => text.includes(t));
  const ratio = terms.length ? hits.length / terms.length : 0.5;
  const understanding = ratio > 0.22 ? "COMPETENT" : ratio > 0.1 ? "DEVELOPING" : "FOUNDATION";
  return {
    performance: understandingToPerformance(understanding),
    detail: `Local heuristic: matched ${hits.length}/${terms.length} key terms`,
    aiEvaluation: { conceptual_understanding: understanding, reasoning_quality: ratio > 0.22 ? "Touches the key mechanism." : "Missing part of the key mechanism.", misconceptions: [], evidence: hits, confidence: ratio > 0.22 ? "MEDIUM" : "LOW" },
  };
}
async function claudeEvaluate(task, responseText) {
  const prompt = buildEvaluationPrompt(task, responseText);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
    });
    const data = await res.json();
    const textBlock = (data.content || []).map((b) => (b.type === "text" ? b.text : "")).join("");
    const cleaned = textBlock.replace(/```json|```/g, "").trim();
    const parsed = validateAiEvaluation(JSON.parse(cleaned));
    if (!parsed.valid) throw new Error("model returned an invalid shape");
    return { performance: understandingToPerformance(parsed.value.conceptual_understanding), detail: "Scored live by Claude", aiEvaluation: parsed.value, providerUsed: "claude-live" };
  } catch (e) {
    const fallback = localHeuristicEvaluate(task, responseText);
    return { ...fallback, detail: `Live AI scoring unavailable — showing a local estimate instead (${e.message})`, providerUsed: "local-fallback" };
  }
}

/* =========================================================================
   PERSONAS — ported from demo-verify.js. In simulation mode the student's
   INPUT is scripted; the scoring (real JS execution, real/live grading)
   is not.
   ========================================================================= */
const PERSONAS = {
  STRONG_ENGINEERING_STUDENT: {
    label: "Strong engineering student",
    responses: {
      pf_1: { code: CORRECT_WORD_FREQ_CODE, hints: 0 }, algo_1: { code: CORRECT_TWO_SUM_CODE, hints: 0 },
      complexity_1: { optionIdx: 2, hints: 0 }, debug_1: { optionIdx: 0, hints: 0 },
      ml_1: { text: "Bias is error from a model too simple to capture the pattern, causing underfitting. Variance is error from a model too sensitive to the training data, causing overfitting. Total error is minimized by balancing the two.", hints: 0 },
      ml_2: { text: "That gap between 99% train and 60% test accuracy is classic overfitting. I would first check for data leakage, then try regularization, more training data, or a simpler model, validated with cross-validation.", hints: 0 },
      recursion_1: { optionIdx: 0, hints: 0 }, api_1: { optionIdx: 2, hints: 0 },
      sql_1: { text: "SELECT name, cgpa FROM students WHERE cgpa > 8 ORDER BY cgpa DESC;", hints: 0 },
      debug_2: { optionIdx: 0, hints: 0 },
      db_1: { text: "Yes, an index on email would likely help. I would check the query plan and selectivity first. The downside is maintenance cost on every insert or update, plus storage.", hints: 0 },
    },
  },
  BEGINNER_STUDENT: {
    label: "Beginner student",
    responses: {
      pf_1: { code: 'function wordFrequency(text) {\n  return text.split(" ");\n}', hints: 2 },
      algo_1: { code: "function twoSum(nums, target) {\n  return [0, 1];\n}", hints: 2 },
      complexity_1: { optionIdx: 0, hints: 1 }, debug_1: { optionIdx: 2, hints: 1 },
      ml_1: { text: "idk maybe its about models", hints: 0 },
      ml_2: { text: "the model is very good because train accuracy is high", hints: 0 },
      recursion_1: { optionIdx: 1, hints: 2 }, api_1: { optionIdx: 0, hints: 1 },
      sql_1: { text: "SELECT * FROM students;", hints: 2 }, debug_2: { optionIdx: 1, hints: 1 },
      db_1: { text: "yes indexes are always good to add", hints: 0 },
    },
  },
  UNEVEN_STUDENT: {
    label: "Uneven student",
    responses: {
      pf_1: { code: CORRECT_WORD_FREQ_CODE, hints: 0 }, algo_1: { code: CORRECT_TWO_SUM_CODE, hints: 0 },
      complexity_1: { optionIdx: 0, hints: 0 }, recursion_1: { optionIdx: 0, hints: 0 },
      debug_1: { optionIdx: 0, hints: 0 },
      ml_1: { text: "Bias is underfitting, variance is overfitting, balance them for best generalization.", hints: 0 },
      ml_2: { text: "This is overfitting. I would add regularization or collect more data.", hints: 0 },
      api_1: { optionIdx: 2, hints: 0 }, sql_1: { text: "SELECT name, cgpa FROM students WHERE cgpa > 8 ORDER BY cgpa DESC;", hints: 0 },
      debug_2: { optionIdx: 0, hints: 0 }, db_1: { text: "Check selectivity and the query plan first; downside is write overhead and storage.", hints: 0 },
    },
  },
  NOISY_PERFORMANCE_STUDENT: {
    label: "Noisy / inconsistent student",
    responses: {
      pf_1: { code: CORRECT_WORD_FREQ_CODE, hints: 0 }, algo_1: { code: "function twoSum(nums, target) {\n  return [1, 0];\n}", hints: 0 },
      complexity_1: { optionIdx: 2, hints: 0 }, recursion_1: { optionIdx: 2, hints: 0 },
      debug_1: { optionIdx: 1, hints: 0 }, ml_1: { text: "Bias is underfitting, variance is overfitting.", hints: 0 },
      ml_2: { text: "it is doing great, no issues here", hints: 0 },
    },
  },
  HIGH_HINT_DEPENDENCY_STUDENT: {
    label: "High hint-dependency student",
    responses: {
      pf_1: { code: CORRECT_WORD_FREQ_CODE, hints: 3 }, algo_1: { code: CORRECT_TWO_SUM_CODE, hints: 2 },
      complexity_1: { optionIdx: 2, hints: 2 }, debug_1: { optionIdx: 0, hints: 1 },
      ml_1: { text: "Bias is underfitting and variance is overfitting, you balance them.", hints: 1 },
      ml_2: { text: "Overfitting, try regularization or more data.", hints: 1 },
    },
  },
  INCOMPLETE_DIAGNOSTIC_STUDENT: {
    label: "Incomplete session (leaves early)",
    responses: { pf_1: { code: CORRECT_WORD_FREQ_CODE, hints: 0 }, algo_1: { code: CORRECT_TWO_SUM_CODE, hints: 0 } },
  },
};

/* =========================================================================
   SMALL UI PRIMITIVES
   ========================================================================= */
function Nameplate({ children }) {
  return <span style={{ fontFamily: FONT_MONO, fontSize: 11, letterSpacing: "0.08em", color: C.inkMuted, textTransform: "uppercase" }}>{children}</span>;
}
function LevelBar({ level }) {
  const rank = level ? LEVEL_RANK[level] : -1;
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1">
        {LEVELS.map((l, i) => (
          <div key={l} style={{ width: 14, height: 6, borderRadius: 1, background: i <= rank ? C.amber : C.border }} />
        ))}
      </div>
      <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: C.ink }}>{level || "—"}</span>
    </div>
  );
}
function ConfidenceBadge({ confidence }) {
  const s = CONFIDENCE_STYLE[confidence];
  return (
    <span className="px-2 py-0.5 rounded" style={{ background: s.bg, color: s.fg, fontFamily: FONT_MONO, fontSize: 11, letterSpacing: "0.02em" }}>
      {s.label}
    </span>
  );
}
function TapeEntry({ entry }) {
  const s = PERFORMANCE_STYLE[entry.performance] || PERFORMANCE_STYLE.UNSCORED;
  const Icon = s.Icon;
  return (
    <div className="flex flex-col items-center shrink-0" style={{ width: 92 }} title={entry.title}>
      <div className="flex items-center justify-center rounded-full" style={{ width: 26, height: 26, background: s.bg, border: `1px solid ${s.fg}` }}>
        <Icon size={14} color={s.fg} />
      </div>
      <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: C.inkMuted, marginTop: 4, textAlign: "center", lineHeight: 1.2 }}>{entry.taskId}</div>
      {entry.hints > 0 && <Lightbulb size={11} color={C.partial} style={{ marginTop: 2 }} />}
    </div>
  );
}

/* =========================================================================
   MAIN COMPONENT
   ========================================================================= */
export default function CodeForgeDiagnostic() {
  const [phase, setPhase] = useState("role"); // role | setup | diagnostic | baseline
  const [roleId, setRoleId] = useState(null);
  const [mode, setMode] = useState("interactive"); // 'interactive' | one of the PERSONAS keys
  const [state, setState] = useState({ presentedTaskIds: [], respondedTaskIds: [], evidenceBySkill: {}, pendingPrerequisiteTaskId: null });
  const [log, setLog] = useState([]);
  const [tape, setTape] = useState([]);
  const [completionReason, setCompletionReason] = useState(null);
  const [currentTaskId, setCurrentTaskId] = useState(null);
  const [currentReason, setCurrentReason] = useState("");
  const [draftCode, setDraftCode] = useState("");
  const [draftText, setDraftText] = useState("");
  const [draftOption, setDraftOption] = useState(null);
  const [hints, setHints] = useState(0);
  const [running, setRunning] = useState(false);
  const [runPreview, setRunPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const startedAt = useRef(null);

  const role = roleId ? ROLES[roleId] : null;
  const blueprint = useMemo(() => (role ? buildBlueprint(role) : null), [role]);
  const baseline = phase === "baseline" ? generateBaseline(role, state) : null;
  const recommendation = baseline ? pickRecommendation(baseline) : null;

  function resetDrafts(task) {
    setDraftCode(task.starterCode || "");
    setDraftText("");
    setDraftOption(null);
    setHints(0);
    setRunPreview(null);
    setLastResult(null);
  }

  function beginTask(taskId, reason, activeMode) {
    const task = TASKS[taskId];
    setCurrentTaskId(taskId);
    setCurrentReason(reason);
    resetDrafts(task);
    const m = activeMode !== undefined ? activeMode : mode;
    if (m !== "interactive") {
      const scripted = PERSONAS[m].responses[taskId];
      if (scripted) {
        if (scripted.code !== undefined) setDraftCode(scripted.code);
        if (scripted.text !== undefined) setDraftText(scripted.text);
        if (scripted.optionIdx !== undefined) setDraftOption(scripted.optionIdx);
        setHints(scripted.hints || 0);
      }
    }
  }

  function startDiagnostic(chosenMode) {
    setMode(chosenMode);
    const freshState = { presentedTaskIds: [], respondedTaskIds: [], evidenceBySkill: {}, pendingPrerequisiteTaskId: null };
    const { taskId, reason } = selectNextTask(role, blueprint, freshState);
    setState({ ...freshState, presentedTaskIds: [taskId] });
    setLog([{ type: "PRESENT", taskId, reason }]);
    setTape([]);
    setCompletionReason(null);
    setPhase("diagnostic");
    beginTask(taskId, reason, chosenMode); // pass explicitly — setMode() above hasn't landed yet
    startedAt.current = Date.now();
  }

  function currentResponse() {
    const task = TASKS[currentTaskId];
    if (task.taskType === "CODING" && task.testCases) return { code: draftCode, hints };
    if (task.taskType === "CODING" && task.sqlChecks) return { text: draftText, hints };
    if (["DEBUGGING", "CODE_READING", "COMPLEXITY_REASONING"].includes(task.taskType)) return { optionIdx: draftOption, hints };
    return { text: draftText, hints };
  }

  function handleRunTests() {
    const task = TASKS[currentTaskId];
    const r = runJsTests(draftCode, task.testCases, task.functionName);
    setRunPreview(r);
    setRunning(false);
  }

  async function handleSubmit() {
    const task = TASKS[currentTaskId];
    const response = currentResponse();
    if (task.taskType === "CODING" && task.testCases && !draftCode.trim()) return;
    if (["DEBUGGING", "CODE_READING", "COMPLEXITY_REASONING"].includes(task.taskType) && draftOption === null) return;
    if (needsOpenEndedEvaluation(task) && !draftText.trim()) return;
    if (task.taskType === "CODING" && task.sqlChecks && !draftText.trim()) return;

    setSubmitting(true);
    const evalResult = needsOpenEndedEvaluation(task)
      ? await claudeEvaluate(task, response.text || "")
      : evaluateDeterministic(task, response);
    setSubmitting(false);

    const newEvidence = recordEvidence(state.evidenceBySkill, task, evalResult, response);
    const newPresented = state.presentedTaskIds;
    const newResponded = [...state.respondedTaskIds, currentTaskId];

    let pendingPrereq = state.pendingPrerequisiteTaskId;
    if (evalResult.performance === "INCORRECT" && task.prerequisiteCheckTaskId && !newPresented.includes(task.prerequisiteCheckTaskId) && !pendingPrereq) {
      pendingPrereq = task.prerequisiteCheckTaskId;
    } else if (pendingPrereq === currentTaskId) {
      pendingPrereq = null;
    }

    const nextState = { presentedTaskIds: newPresented, respondedTaskIds: newResponded, evidenceBySkill: newEvidence, pendingPrerequisiteTaskId: pendingPrereq };
    setState(nextState);
    setTape((t) => [...t, { taskId: currentTaskId, performance: evalResult.performance, hints: response.hints || 0, title: `${task.title}: ${evalResult.detail}` }]);
    setLog((l) => [...l, { type: "EVALUATE", taskId: currentTaskId, performance: evalResult.performance, detail: evalResult.detail }]);
    setLastResult({ task, evalResult, response });

    const stop = shouldStop(role, blueprint, nextState);
    if (stop) {
      setCompletionReason(stop);
    }
  }

  function handleContinue() {
    if (completionReason) {
      setPhase("baseline");
      return;
    }
    const { taskId, reason } = selectNextTask(role, blueprint, state);
    if (!taskId) {
      setCompletionReason("TASK_BANK_EXHAUSTED");
      setPhase("baseline");
      return;
    }
    setState((s) => ({ ...s, presentedTaskIds: [...s.presentedTaskIds, taskId] }));
    setLog((l) => [...l, { type: "PRESENT", taskId, reason }]);
    beginTask(taskId, reason);
  }

  function restart() {
    setPhase("role"); setRoleId(null); setMode("interactive");
    setState({ presentedTaskIds: [], respondedTaskIds: [], evidenceBySkill: {}, pendingPrerequisiteTaskId: null });
    setLog([]); setTape([]); setCompletionReason(null); setCurrentTaskId(null); setLastResult(null);
  }

  const shellStyle = { background: C.bg, color: C.ink, fontFamily: FONT_BODY, minHeight: 480, borderRadius: 12, padding: 20 };

  /* ---------------- ROLE SELECT ---------------- */
  if (phase === "role") {
    return (
      <div style={shellStyle}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Condensed:wght@500;600&family=IBM+Plex+Sans:wght@400;500&family=IBM+Plex+Mono:wght@400;500&display=swap');`}</style>
        <Nameplate>CodeForge AI — Technical baseline</Nameplate>
        <h1 style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 26, margin: "6px 0 4px" }}>Let's find your technical starting point</h1>
        <p style={{ color: C.inkMuted, fontSize: 14, maxWidth: 520, lineHeight: 1.6, margin: "0 0 20px" }}>
          A short, adaptive session — not a pass/fail test. What you show us decides where CodeForge starts you, and every conclusion below will trace back to a specific task.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          {Object.values(ROLES).map((r) => (
            <button key={r.id} onClick={() => { setRoleId(r.id); setPhase("setup"); }}
              className="text-left flex-1 rounded-lg p-4"
              style={{ background: C.surface, border: `1px solid ${C.border}`, cursor: "pointer" }}>
              <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 16 }}>{r.name}</div>
              <div style={{ color: C.inkMuted, fontSize: 12, marginTop: 6 }}>{r.requiredSkills.map((s) => SKILLS[s].name).join(" · ")}</div>
              <div style={{ color: C.amberDeep, fontSize: 12, marginTop: 10, display: "flex", alignItems: "center", gap: 4 }}>
                Choose <ArrowRight size={13} />
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  /* ---------------- SETUP (mode select) ---------------- */
  if (phase === "setup") {
    return (
      <div style={shellStyle}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Condensed:wght@500;600&family=IBM+Plex+Sans:wght@400;500&family=IBM+Plex+Mono:wght@400;500&display=swap');`}</style>
        <Nameplate>Target role: {role.name}</Nameplate>
        <h2 style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 20, margin: "6px 0 14px" }}>How do you want to run this?</h2>
        <div className="flex flex-col gap-2 mb-4">
          <button onClick={() => startDiagnostic("interactive")} className="text-left rounded-lg p-3" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 14 }}>Take it yourself</div>
            <div style={{ color: C.inkMuted, fontSize: 12, marginTop: 2 }}>Real tasks, ~{blueprint.taskBudget} steps, real scoring (your code actually runs; open-ended answers are graded live by Claude).</div>
          </button>
          {Object.entries(PERSONAS).map(([key, p]) => (
            <button key={key} onClick={() => startDiagnostic(key)} className="text-left rounded-lg p-3" style={{ background: C.surfaceAlt, border: `1px solid ${C.border}` }}>
              <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 13 }}>Simulate: {p.label}</div>
              <div style={{ color: C.inkMuted, fontSize: 12, marginTop: 2 }}>Pre-filled realistic answers, one step at a time — the scoring and adaptive decisions are exactly as real as interactive mode.</div>
            </button>
          ))}
        </div>
        <button onClick={() => setPhase("role")} style={{ color: C.inkMuted, fontSize: 12 }}>← Back</button>
      </div>
    );
  }

  /* ---------------- DIAGNOSTIC ---------------- */
  if (phase === "diagnostic" && currentTaskId) {
    const task = TASKS[currentTaskId];
    const isMC = ["DEBUGGING", "CODE_READING", "COMPLEXITY_REASONING"].includes(task.taskType);
    const isCode = task.taskType === "CODING" && !!task.testCases;
    const isSql = task.taskType === "CODING" && !!task.sqlChecks;
    const isOpenEnded = needsOpenEndedEvaluation(task);
    const progressN = state.presentedTaskIds.length;

    return (
      <div style={shellStyle}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Condensed:wght@500;600&family=IBM+Plex+Sans:wght@400;500&family=IBM+Plex+Mono:wght@400;500&display=swap');`}</style>
        <div className="flex items-center justify-between mb-1">
          <Nameplate>{role.name} · {mode === "interactive" ? "Interactive" : `Simulating: ${PERSONAS[mode].label}`}</Nameplate>
          <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: C.inkMuted }}>Task {progressN} of ~{blueprint.taskBudget}</span>
        </div>

        {/* Evidence tape */}
        <div className="flex gap-3 overflow-x-auto py-2 mb-3" style={{ borderBottom: `1px solid ${C.border}`, borderTop: `1px solid ${C.border}` }}>
          {tape.length === 0 && <span style={{ color: C.inkMuted, fontSize: 11, fontFamily: FONT_MONO, padding: "4px 2px" }}>Evidence tape — fills in as you go</span>}
          {tape.map((e, i) => <TapeEntry key={i} entry={e} />)}
        </div>

        <div className="flex items-start gap-2 mb-3" style={{ color: C.amberDeep, fontSize: 12, background: C.amberBg, padding: "8px 10px", borderRadius: 8 }}>
          <Info size={14} style={{ marginTop: 1, flexShrink: 0 }} />
          <span>{currentReason}</span>
        </div>

        <div className="rounded-lg p-4" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
          <div className="flex items-center gap-2 mb-2">
            <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: C.inkMuted, background: C.surfaceAlt, padding: "2px 6px", borderRadius: 4 }}>{task.id} · v{task.version}</span>
            <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: C.inkMuted }}>{task.taskType} · {task.difficulty}</span>
          </div>
          <h3 style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 16, marginBottom: 8 }}>{task.title}</h3>
          <pre style={{ fontFamily: FONT_MONO, fontSize: 12.5, whiteSpace: "pre-wrap", background: C.surfaceAlt, padding: 10, borderRadius: 6, color: C.ink, marginBottom: 12, lineHeight: 1.5 }}>{task.prompt}</pre>

          {isCode && (
            <div>
              <textarea value={draftCode} onChange={(e) => setDraftCode(e.target.value)} rows={7}
                style={{ width: "100%", fontFamily: FONT_MONO, fontSize: 13, background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 6, padding: 10, color: C.ink }} />
              <div className="flex items-center gap-2 mt-2">
                <button onClick={handleRunTests} className="flex items-center gap-1 px-3 py-1.5 rounded" style={{ background: C.surfaceAlt, border: `1px solid ${C.borderStrong}`, fontSize: 12 }}>
                  <Play size={12} /> Run visible tests
                </button>
                {runPreview && (
                  <span style={{ fontSize: 12, color: runPreview.error ? C.incorrect : C.inkMuted, fontFamily: FONT_MONO }}>
                    {runPreview.error ? `Error: ${runPreview.error}` : `${runPreview.results.filter((r) => !r.hidden).filter((r) => r.ok).length}/${runPreview.results.filter((r) => !r.hidden).length} visible tests passing`}
                  </span>
                )}
              </div>
              {runPreview && !runPreview.error && (
                <div className="mt-2 flex flex-col gap-1">
                  {runPreview.results.filter((r) => !r.hidden).map((r, i) => (
                    <div key={i} style={{ fontFamily: FONT_MONO, fontSize: 11, color: r.ok ? C.correct : C.incorrect }}>
                      {r.ok ? "✓" : "✗"} f({r.args.map((a) => JSON.stringify(a)).join(", ")}) → {JSON.stringify(r.actual)}{!r.ok && ` (expected ${JSON.stringify(r.expected)})`}
                    </div>
                  ))}
                  <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: C.inkMuted }}>+ 1 held-back test used only at submit time</div>
                </div>
              )}
            </div>
          )}

          {isSql && (
            <textarea value={draftText} onChange={(e) => setDraftText(e.target.value)} rows={3} placeholder="SELECT ..."
              style={{ width: "100%", fontFamily: FONT_MONO, fontSize: 13, background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 6, padding: 10, color: C.ink }} />
          )}

          {isMC && (
            <div className="flex flex-col gap-2">
              {task.options.map((opt, i) => (
                <button key={i} onClick={() => setDraftOption(i)} className="text-left px-3 py-2 rounded"
                  style={{ background: draftOption === i ? C.amberBg : C.surfaceAlt, border: `1px solid ${draftOption === i ? C.amber : C.border}`, fontFamily: FONT_MONO, fontSize: 13 }}>
                  {opt}
                </button>
              ))}
            </div>
          )}

          {isOpenEnded && (
            <textarea value={draftText} onChange={(e) => setDraftText(e.target.value)} rows={4} placeholder="Your answer..."
              style={{ width: "100%", fontFamily: FONT_BODY, fontSize: 13, background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 6, padding: 10, color: C.ink }} />
          )}

          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 11, color: C.inkMuted }}>Hints / lookups used:</span>
              <button onClick={() => setHints((h) => Math.max(0, h - 1))} style={{ width: 22, height: 22, borderRadius: 4, border: `1px solid ${C.border}`, background: C.surfaceAlt }}>−</button>
              <span style={{ fontFamily: FONT_MONO, fontSize: 12, width: 14, textAlign: "center" }}>{hints}</span>
              <button onClick={() => setHints((h) => h + 1)} style={{ width: 22, height: 22, borderRadius: 4, border: `1px solid ${C.border}`, background: C.surfaceAlt }}>+</button>
            </div>
            {!lastResult && (
              <button onClick={handleSubmit} disabled={submitting}
                className="flex items-center gap-1 px-4 py-2 rounded"
                style={{ background: C.amber, color: "#FFF9EF", fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 13, opacity: submitting ? 0.7 : 1 }}>
                {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
                {submitting ? "Scoring…" : "Submit"}
              </button>
            )}
          </div>
        </div>

        {lastResult && (
          <div className="mt-3 rounded-lg p-4" style={{ background: PERFORMANCE_STYLE[lastResult.evalResult.performance].bg, border: `1px solid ${PERFORMANCE_STYLE[lastResult.evalResult.performance].fg}` }}>
            <div className="flex items-center gap-2" style={{ color: PERFORMANCE_STYLE[lastResult.evalResult.performance].fg, fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 13 }}>
              {lastResult.evalResult.performance} — {lastResult.evalResult.detail}
            </div>
            {lastResult.evalResult.aiEvaluation && (
              <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 6 }}>
                {lastResult.evalResult.aiEvaluation.reasoning_quality}
                {lastResult.evalResult.providerUsed === "local-fallback" && (
                  <span className="flex items-center gap-1 mt-1" style={{ color: C.partial }}><AlertTriangle size={11} /> local fallback estimate, not a live model grade</span>
                )}
              </div>
            )}
            <button onClick={handleContinue} className="flex items-center gap-1 mt-3 px-3 py-1.5 rounded" style={{ background: C.ink, color: C.surface, fontSize: 12 }}>
              Continue <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    );
  }

  /* ---------------- BASELINE ---------------- */
  if (phase === "baseline") {
    return (
      <div style={shellStyle}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Condensed:wght@500;600&family=IBM+Plex+Sans:wght@400;500&family=IBM+Plex+Mono:wght@400;500&display=swap');`}</style>
        <Nameplate>Diagnostic complete · {completionReason}</Nameplate>
        <h1 style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 24, margin: "6px 0 4px" }}>Your technical baseline</h1>
        <p style={{ color: C.inkMuted, fontSize: 13, marginBottom: 14 }}>{role.name} · {state.presentedTaskIds.length} tasks presented</p>

        <div className="flex gap-3 overflow-x-auto py-2 mb-4" style={{ borderBottom: `1px solid ${C.border}`, borderTop: `1px solid ${C.border}` }}>
          {tape.map((e, i) => <TapeEntry key={i} entry={e} />)}
        </div>

        <div className="flex flex-col gap-2 mb-4">
          {baseline.map((b) => (
            <div key={b.skillId} className="rounded-lg p-3" style={{ background: b.required ? C.surface : C.surfaceAlt, border: `1px solid ${C.border}`, opacity: b.required ? 1 : 0.85 }}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 14 }}>
                  {b.skillName} {!b.required && <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: C.inkMuted }}>· prerequisite check</span>}
                </div>
                <ConfidenceBadge confidence={b.confidence} />
              </div>
              <div className="mt-2"><LevelBar level={b.level} /></div>
              <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 6 }}>{b.why}</div>
            </div>
          ))}
        </div>

        {recommendation ? (
          <div className="rounded-lg p-4 mb-4" style={{ background: C.amberBg, border: `1px solid ${C.amber}` }}>
            <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 14, color: C.amberDeep }}>Recommended starting point: {recommendation.skillName}</div>
            <div style={{ fontSize: 12, color: C.ink, marginTop: 4 }}>{recommendation.reason}</div>
          </div>
        ) : (
          <div className="rounded-lg p-4 mb-4" style={{ background: C.surfaceAlt, border: `1px solid ${C.border}` }}>
            <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 14 }}>No single priority gap</div>
            <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 4 }}>Every required skill with evidence sits at COMPETENT or above. More diagnostic time would mainly add confidence, not change the picture.</div>
          </div>
        )}

        <details className="mb-4">
          <summary style={{ cursor: "pointer", fontSize: 12, color: C.inkMuted, fontFamily: FONT_MONO }}>Adaptive decision log ({log.filter((l) => l.type === "PRESENT").length} selections)</summary>
          <div className="mt-2 flex flex-col gap-1">
            {log.map((l, i) => (
              <div key={i} style={{ fontFamily: FONT_MONO, fontSize: 11, color: C.inkMuted }}>
                {l.type === "PRESENT" ? `→ ${l.taskId}: ${l.reason}` : `  = ${l.performance} (${l.detail})`}
              </div>
            ))}
          </div>
        </details>

        <button onClick={restart} className="flex items-center gap-1 px-3 py-2 rounded" style={{ background: C.ink, color: C.surface, fontSize: 12 }}>
          <RotateCcw size={13} /> Start a new diagnostic
        </button>
      </div>
    );
  }

  return null;
}
