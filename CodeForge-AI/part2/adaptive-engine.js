'use strict';
/**
 * CodeForge AI — Adaptive diagnostic engine
 * ---------------------------------------------------------------
 * Everything here is an interpretable heuristic (spec section 21, 98):
 * NOT item response theory, NOT a calibrated psychometric model. Every
 * task in domain-model.js has calibrationStatus implicitly UNCALIBRATED
 * (no empirical parameters exist yet — see ARCHITECTURE doc section on
 * future IRT/BKT work). Treat the scoring math below as a defensible
 * starting rule, not a validated instrument.
 */

const {
  SKILLS, TASKS, ROLE_TASK_POOL, LEVELS, buildBlueprint, getRoleOrThrow,
} = require('./domain-model');

const ADAPTIVE_POLICY_VERSION = 'heuristic-v1';
const EVALUATION_LOGIC_VERSION = 'eval-logic-v1';

// ---------- deterministic evaluation ----------

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a == null || b == null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === 'object') {
    const ak = Object.keys(a).sort();
    const bk = Object.keys(b).sort();
    if (ak.length !== bk.length || ak.some((k, i) => k !== bk[i])) return false;
    return ak.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}

// Runs untrusted student code in-process via Function(). This is a stand-in
// for a real sandboxed execution service (spec section 29 says not to build
// a second execution engine — this exists only because no execution service
// is reachable from this environment). Fine for a trusted demo; NOT what
// should run production student submissions. See truth table.
function runJsTests(code, testCases, functionName) {
  let fn;
  try {
    // eslint-disable-next-line no-new-func
    fn = new Function(`${code}\nreturn typeof ${functionName} !== 'undefined' ? ${functionName} : null;`)();
  } catch (e) {
    return { passed: 0, total: testCases.length, error: e.message, results: [] };
  }
  if (typeof fn !== 'function') {
    return { passed: 0, total: testCases.length, error: `${functionName} is not defined`, results: [] };
  }
  let passed = 0;
  const results = testCases.map((tc) => {
    try {
      const actual = fn(...tc.args);
      const ok = deepEqual(actual, tc.expected);
      if (ok) passed++;
      return { args: tc.args, expected: tc.expected, actual, ok };
    } catch (e) {
      return { args: tc.args, expected: tc.expected, actual: `threw: ${e.message}`, ok: false };
    }
  });
  return { passed, total: testCases.length, results };
}

function needsOpenEndedEvaluation(task) {
  return ['CONCEPTUAL', 'TECHNICAL_REASONING', 'EXPLANATION'].includes(task.taskType);
}

function evaluateDeterministic(task, response) {
  switch (task.taskType) {
    case 'CODING': {
      if (task.testCases) {
        const r = runJsTests(response.code || '', task.testCases, task.functionName);
        if (r.error) return { performance: 'INCORRECT', detail: `Code did not run: ${r.error}` };
        if (r.passed === r.total) return { performance: 'CORRECT', detail: `${r.passed}/${r.total} tests passed` };
        if (r.passed > 0) return { performance: 'PARTIAL', detail: `${r.passed}/${r.total} tests passed` };
        return { performance: 'INCORRECT', detail: `${r.passed}/${r.total} tests passed` };
      }
      if (task.sqlChecks) {
        const text = response.text || '';
        const matched = task.sqlChecks.filter((c) => c.pattern.test(text));
        const passed = matched.length;
        const total = task.sqlChecks.length;
        if (passed === total) return { performance: 'CORRECT', detail: 'All required clauses present' };
        if (passed >= total - 1) return { performance: 'PARTIAL', detail: `${passed}/${total} required clauses present` };
        return { performance: 'INCORRECT', detail: `${passed}/${total} required clauses present` };
      }
      return { performance: 'UNSCORED', detail: 'No deterministic check configured for this task' };
    }
    case 'DEBUGGING':
    case 'CODE_READING':
    case 'COMPLEXITY_REASONING': {
      if (response.optionIdx === task.correctIndex) {
        return { performance: 'CORRECT', detail: 'Correct option selected' };
      }
      return { performance: 'INCORRECT', detail: `Selected option ${response.optionIdx}, correct was ${task.correctIndex}` };
    }
    default:
      return { performance: 'UNSCORED', detail: `Unrecognized deterministic task type: ${task.taskType}` };
  }
}

// ---------- evidence, confidence, level ----------

function recordEvidence(evidenceBySkill, task, evalResult, response) {
  const independence = (response.hints || 0) > 0 ? 'ASSISTED' : 'INDEPENDENT';
  const next = { ...evidenceBySkill };
  task.skills.forEach((ts) => {
    const entry = {
      taskId: task.id,
      taskVersion: task.version,
      relationship: ts.relationship,
      weight: ts.weight,
      performance: evalResult.performance,
      independence,
      hints: response.hints || 0,
      difficulty: task.difficulty,
      selectedOption: response.optionIdx !== undefined ? response.optionIdx : null,
      aiEvaluation: evalResult.aiEvaluation || null,
      observedAt: Date.now(),
    };
    next[ts.skillId] = [...(next[ts.skillId] || []), entry];
  });
  return next;
}

// One data point never earns HIGH confidence (spec sections 24-25).
// Inconsistent outcomes cap confidence at LOW even with several data points —
// noisy evidence is not the same as strong evidence.
function computeSkillConfidence(evidenceList) {
  if (!evidenceList || evidenceList.length === 0) return 'INSUFFICIENT_EVIDENCE';
  const n = evidenceList.length;
  if (n === 1) return 'LOW';
  const outcomes = evidenceList.map((e) => e.performance);
  const allSame = outcomes.every((o) => o === outcomes[0]);
  if (!allSame) return 'LOW';
  return n >= 3 ? 'HIGH' : 'MEDIUM';
}

function computeSkillLevel(evidenceList) {
  if (!evidenceList || evidenceList.length === 0) return null;
  const difficultyBonus = { FOUNDATION: 0, EASY: 0.15, INTERMEDIATE: 0.3, ADVANCED: 0.45 };
  let weightedScore = 0;
  let weightSum = 0;
  evidenceList.forEach((e) => {
    const base = e.performance === 'CORRECT' ? 1 : e.performance === 'PARTIAL' ? 0.5 : 0;
    const bonus = base > 0 ? (difficultyBonus[e.difficulty] || 0) : 0;
    const penalty = e.independence === 'ASSISTED' ? 0.25 : 0;
    weightedScore += Math.max(0, base + bonus - penalty) * e.weight;
    weightSum += e.weight;
  });
  const score = weightSum > 0 ? weightedScore / weightSum : 0;
  let level;
  if (score <= 0.15) level = 'FOUNDATION';
  else if (score <= 0.5) level = 'DEVELOPING';
  else if (score <= 0.85) level = 'COMPETENT';
  else if (score <= 1.15) level = 'STRONG';
  else level = 'ADVANCED';
  // Mirrors the confidence rule: one success is not sufficient for STRONG
  // (spec section 25). A single data point cannot earn the top two levels,
  // no matter how clean that one result was.
  if (evidenceList.length === 1 && LEVELS.indexOf(level) > LEVELS.indexOf('COMPETENT')) {
    level = 'COMPETENT';
  }
  return level;
}

function buildWhyText(skillId, evidenceList) {
  const name = SKILLS[skillId].name.toLowerCase();
  if (!evidenceList || evidenceList.length === 0) {
    return `No tasks targeting ${name} were reached in this session.`;
  }
  const total = evidenceList.length;
  const correct = evidenceList.filter((e) => e.performance === 'CORRECT').length;
  const partial = evidenceList.filter((e) => e.performance === 'PARTIAL').length;
  const hinted = evidenceList.filter((e) => e.hints > 0).length;
  const hasPrimary = evidenceList.some((e) => e.relationship === 'PRIMARY');
  let text = `${correct} of ${total} ${name} task${total === 1 ? '' : 's'} correct`;
  if (partial > 0) text += `, ${partial} partially correct`;
  if (hinted > 0) text += `, ${hinted} required a hint`;
  if (!hasPrimary) text += ' — indirect evidence only, from tasks primarily targeting a different skill';
  return text + '.';
}

// ---------- adaptive selection ----------

function selectNextTask(role, blueprint, state) {
  const pool = ROLE_TASK_POOL[role.id];
  const remainingIds = pool.filter((id) => !state.presentedTaskIds.includes(id));

  if (state.presentedTaskIds.length >= blueprint.taskBudget) {
    return { taskId: null, reason: 'Task budget reached.' };
  }
  if (remainingIds.length === 0) {
    return { taskId: null, reason: 'No further validated tasks remain in the pool for this role.' };
  }
  if (state.pendingPrerequisiteTaskId && remainingIds.includes(state.pendingPrerequisiteTaskId)) {
    const t = TASKS[state.pendingPrerequisiteTaskId];
    const primarySkill = t.skills.find((s) => s.relationship === 'PRIMARY').skillId;
    return {
      taskId: t.id,
      reason: `Checking prerequisite skill "${SKILLS[primarySkill].name}" after a weak signal on a dependent skill — one failure isn't enough to call the dependent skill weak.`,
    };
  }

  const evidenceCounts = {};
  blueprint.requiredSkills.forEach((s) => { evidenceCounts[s] = (state.evidenceBySkill[s] || []).length; });

  const candidates = remainingIds
    .map((id) => TASKS[id])
    .filter((t) => {
      const primary = t.skills.find((s) => s.relationship === 'PRIMARY');
      return primary && blueprint.requiredSkills.includes(primary.skillId);
    });

  if (candidates.length === 0) {
    return { taskId: null, reason: 'Every required skill already has at least one piece of evidence; remaining tasks would not add coverage.' };
  }

  candidates.sort((a, b) => {
    const aSkill = a.skills.find((s) => s.relationship === 'PRIMARY').skillId;
    const bSkill = b.skills.find((s) => s.relationship === 'PRIMARY').skillId;
    return evidenceCounts[aSkill] - evidenceCounts[bSkill];
  });

  const chosen = candidates[0];
  const chosenSkill = chosen.skills.find((s) => s.relationship === 'PRIMARY').skillId;
  const evCount = evidenceCounts[chosenSkill];
  const reason = evCount === 0
    ? `No evidence yet for ${SKILLS[chosenSkill].name}, which this role requires.`
    : `${SKILLS[chosenSkill].name} has limited evidence so far (${evCount} data point${evCount === 1 ? '' : 's'}) — this adds an independent, differently-shaped check rather than repeating what we already know.`;
  return { taskId: chosen.id, reason };
}

function shouldStop(role, blueprint, state) {
  if (state.presentedTaskIds.length >= blueprint.taskBudget) return 'TASK_BUDGET_REACHED';
  const pool = ROLE_TASK_POOL[role.id];
  const remaining = pool.filter((id) => !state.presentedTaskIds.includes(id));
  if (state.pendingPrerequisiteTaskId && remaining.includes(state.pendingPrerequisiteTaskId)) return null;
  const uncovered = blueprint.requiredSkills.filter(
    (s) => (state.evidenceBySkill[s] || []).length < blueprint.minEvidencePerSkill
  );
  if (uncovered.length > 0) {
    // A skill only ever reachable as SECONDARY/CONTEXTUAL (no task PRIMARY-tags
    // it) must still count as coverable, or the engine stops early believing
    // a real gap exists when the remaining pool would have filled it anyway.
    const canStillCover = uncovered.some((s) =>
      remaining.some((id) => TASKS[id].skills.some((sk) => sk.skillId === s))
    );
    return canStillCover ? null : 'TASK_BANK_EXHAUSTED';
  }
  return 'EVIDENCE_SUFFICIENT';
}

// ---------- baseline ----------

function generateBaseline(role, state) {
  const allSkillIds = new Set([...role.requiredSkills, ...Object.keys(state.evidenceBySkill)]);
  const rows = [...allSkillIds].map((skillId) => {
    const ev = state.evidenceBySkill[skillId] || [];
    return {
      skillId,
      skillName: SKILLS[skillId].name,
      required: role.requiredSkills.includes(skillId),
      level: computeSkillLevel(ev),
      confidence: computeSkillConfidence(ev),
      evidenceCount: ev.length,
      why: buildWhyText(skillId, ev),
    };
  });
  rows.sort((a, b) => (b.required - a.required) || a.skillName.localeCompare(b.skillName));
  return rows;
}

function pickRecommendation(baseline) {
  const rank = LEVELS.reduce((acc, l, i) => ({ ...acc, [l]: i }), {});
  const candidates = baseline.filter((b) => b.required && b.confidence !== 'INSUFFICIENT_EVIDENCE' && b.level);
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => rank[a.level] - rank[b.level]);
  const weakest = sorted[0];
  // Don't manufacture a "priority gap" out of a thinly-evidenced but
  // otherwise fine (COMPETENT+) skill on an excellent baseline — only
  // surface a recommendation when the weakest required skill is genuinely
  // still developing. "Least evidence" is not the same claim as "needs work".
  if (rank[weakest.level] >= rank.COMPETENT) return null;
  return {
    skillId: weakest.skillId,
    skillName: weakest.skillName,
    reason: `${weakest.why} This is the lowest-confidence required skill with real evidence behind it.`,
  };
}

// ---------- session orchestration ----------

function createSession(roleId) {
  const role = getRoleOrThrow(roleId);
  const blueprint = buildBlueprint(role);
  return {
    role,
    blueprint,
    state: {
      presentedTaskIds: [],
      respondedTaskIds: [],
      evidenceBySkill: {},
      pendingPrerequisiteTaskId: null,
    },
    log: [],
    completionReason: null,
    baseline: null,
    recommendation: null,
    adaptivePolicyVersion: ADAPTIVE_POLICY_VERSION,
    evaluationLogicVersion: EVALUATION_LOGIC_VERSION,
    startedAt: Date.now(),
  };
}

function presentNextTask(session) {
  const { taskId, reason } = selectNextTask(session.role, session.blueprint, session.state);
  if (!taskId) return null;
  session.state.presentedTaskIds.push(taskId);
  session.log.push({ type: 'PRESENT', taskId, reason, at: Date.now() });
  return { task: TASKS[taskId], reason };
}

async function submitResponse(session, taskId, response, openEndedEvaluator) {
  // idempotent replay: resubmitting the same task never double-counts evidence
  if (session.state.respondedTaskIds.includes(taskId)) {
    return session._resultsByTask ? session._resultsByTask[taskId] : undefined;
  }
  const task = TASKS[taskId];
  const evalResult = needsOpenEndedEvaluation(task)
    ? await openEndedEvaluator(task, response.text || '')
    : evaluateDeterministic(task, response);

  session.state.evidenceBySkill = recordEvidence(session.state.evidenceBySkill, task, evalResult, response);
  session.state.respondedTaskIds.push(taskId);
  session._resultsByTask = session._resultsByTask || {};
  session._resultsByTask[taskId] = evalResult;
  session.log.push({ type: 'EVALUATE', taskId, performance: evalResult.performance, detail: evalResult.detail, at: Date.now() });

  const primarySkill = task.skills.find((s) => s.relationship === 'PRIMARY');
  if (evalResult.performance === 'INCORRECT' && task.prerequisiteCheckTaskId
      && !session.state.presentedTaskIds.includes(task.prerequisiteCheckTaskId)
      && !session.state.pendingPrerequisiteTaskId) {
    session.state.pendingPrerequisiteTaskId = task.prerequisiteCheckTaskId;
  } else if (session.state.pendingPrerequisiteTaskId === taskId) {
    session.state.pendingPrerequisiteTaskId = null;
  }
  void primarySkill;

  const stop = shouldStop(session.role, session.blueprint, session.state);
  if (stop) {
    session.completionReason = stop;
    session.baseline = generateBaseline(session.role, session.state);
    session.recommendation = pickRecommendation(session.baseline);
    session.log.push({ type: 'COMPLETE', reason: stop, at: Date.now() });
  }
  return evalResult;
}

module.exports = {
  ADAPTIVE_POLICY_VERSION,
  EVALUATION_LOGIC_VERSION,
  deepEqual,
  runJsTests,
  needsOpenEndedEvaluation,
  evaluateDeterministic,
  recordEvidence,
  computeSkillConfidence,
  computeSkillLevel,
  buildWhyText,
  selectNextTask,
  shouldStop,
  generateBaseline,
  pickRecommendation,
  createSession,
  presentNextTask,
  submitResponse,
};
