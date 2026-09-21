import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft, ArrowRight, ChevronRight, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, Sparkles, TrendingUp, Brain, Target,
  Lightbulb, RefreshCw, AlertCircle, Trophy, Loader2, Zap,
  BookOpen, Layers, Users, GraduationCap, Link2, Minus,
  Percent, Clock, Shuffle, Hash, Dices, Divide, Settings2,
  Info, PlayCircle, Building2,
} from 'lucide-react';

/* ============================================================================
   ACEAPT TRANSFER
   Intelligent Concept-to-Application & Novel Problem Adaptation Engine
   ----------------------------------------------------------------------------
   PROTOTYPE / INTEGRATION NOTES

   No existing PrepVista / ACEAPT repository was available to inspect in this
   environment, so this ships as a self-contained module with clear seams for
   wiring into the real system (search "INTEGRATION:" below).

   - Topic, mastery and retention data is MOCKED (see SEED_PROFILES). Replace
     `loadAllProfiles` with real calls to the existing ACEAPT student/skill
     services.
   - Transfer evidence + profile state persist to this artifact's built-in
     window.storage key-value API as a stand-in for a real database. In
     production this must be computed and validated SERVER-SIDE — never trust
     transferState/mastery/confidence written by the client. Swap the
     `safeGetJSON` / `safeSetJSON` calls for real API calls against
     CONFIG.PREPVISTA_API_BASE_URL.
   - Novel question generation, the diagnostic micro-bridge, and guided
     practice are generated live by Claude so the transfer loop is genuinely
     adaptive rather than scripted or hard-coded. Every AI response is
     schema-validated (see validateGeneratedQuestion / validateBridge) before
     it is trusted; invalid output silently falls back to a small
     hand-checked question bank so a bad generation never blocks or
     penalizes a student.
   - Diagnosis itself (concept / method / calculation) is fully deterministic
     and rule-based, not AI-judged — the AI only writes the creative content
     (question text, explanations); the scoring logic is auditable.
   ============================================================================ */

// ---------------------------------------------------------------------------
// CONFIG — fill in when wiring into the real PrepVista / ACEAPT backend.
// Nothing below is required for this prototype to run: it uses the
// environment's built-in AI bridge (no key needed here) and local storage.
// ---------------------------------------------------------------------------
const CONFIG = {
  PREPVISTA_API_BASE_URL: '',   // e.g. https://api.prepvista.com
  AUTH_TOKEN: '',               // existing PrepVista session / JWT
  PATHFINDER_ENDPOINT: '',      // POST transfer signal -> Pathfinder
  PROOF_ENDPOINT: '',           // POST transfer evidence -> Proof
  STUDENT_ID: '',               // resolved from existing auth/session
};

const AI_MODEL = 'claude-sonnet-4-6';

// ---------------------------------------------------------------------------
// DOMAIN CONSTANTS
// ---------------------------------------------------------------------------
const TOPICS = [
  { id: 'percentages', name: 'Percentages' },
  { id: 'ratios', name: 'Ratios & Proportions' },
  { id: 'probability', name: 'Probability' },
  { id: 'timeAndWork', name: 'Time & Work' },
  { id: 'permutation', name: 'Permutation & Combination' },
  { id: 'numberSystems', name: 'Number Systems' },
];
const TOPIC_NAME = Object.fromEntries(TOPICS.map((t) => [t.id, t.name]));
const TOPIC_ICON = {
  percentages: Percent,
  ratios: Divide,
  probability: Dices,
  timeAndWork: Clock,
  permutation: Shuffle,
  numberSystems: Hash,
};
const TOPIC_METHODS = {
  percentages: ['Percentage Change Formula', 'Percentage of a Quantity', 'Successive Percentage Change', 'Reverse Percentage'],
  ratios: ['Simple Ratio Comparison', 'Proportion Scaling', 'Compound Ratio', 'Ratio-to-Fraction Conversion'],
  probability: ['Classical Probability', 'Complementary Event', 'Combined / Independent Events', 'Conditional Probability'],
  timeAndWork: ['Work Rate Addition', 'LCM (Total Work) Method', 'Efficiency Ratio', 'Combined Work-Time'],
  permutation: ['Permutation Formula (nPr)', 'Combination Formula (nCr)', 'Fundamental Counting Principle', 'Circular Arrangement'],
  numberSystems: ['Divisibility Rule', 'HCF-LCM Method', 'Remainder Theorem', 'Base Conversion'],
};
const TOPIC_AVOID_KEYWORDS = {
  percentages: ['percent', 'percentage', '%'],
  ratios: ['ratio', 'proportion'],
  probability: ['probability', 'chance', 'odds', 'likely'],
  timeAndWork: ['work rate', 'man-days', 'workers complete'],
  permutation: ['permutation', 'combination', 'arrange in ways', 'ways to'],
  numberSystems: ['remainder', 'divisible', 'hcf', 'lcm', 'factor'],
};
const TRANSFER_LEVEL_DESC = {
  1: 'same concept, different numbers only',
  2: 'same concept, meaningfully different wording',
  3: 'same concept, a genuinely different real-world domain',
  4: 'same concept, different domain, with obvious trigger words removed',
  5: 'same concept combined with a second concept to untangle first',
  6: 'same concept inside an unfamiliar problem structure',
};

const CAPABILITY_SNAPSHOT = [
  { key: 'mastery', label: 'Mastery', value: 87, note: 'Avg. across active topics' },
  { key: 'retention', label: 'Retention', value: 91, note: 'Stable across last review cycle' },
  { key: 'transfer', label: 'Transfer', value: null, note: 'Never a single score — see below' },
  { key: 'accuracy', label: 'Accuracy', value: 82, note: 'Correct on first attempt' },
  { key: 'speed', label: 'Speed', value: 76, note: 'Within target time' },
  { key: 'consistency', label: 'Consistency', value: 88, note: 'Score variance, last 10 sessions' },
];

// Pre-existing ACEAPT evidence, mocked — represents usage prior to this session.
const SEED_PROFILES = {
  percentages: { transferState: 'Developing', confidence: 'Medium', familiarPct: 92, novelPct: 58, evidenceCount: 4, contexts: ['Retail Discount', 'Exam Scoring', 'Population Growth'], currentLevel: 4 },
  ratios: { transferState: 'Strong', confidence: 'High', familiarPct: 90, novelPct: 84, evidenceCount: 7, contexts: ['Paint Mixing', 'Map Scale', 'Recipe Scaling', 'Class Ratio'], currentLevel: 4 },
  probability: { transferState: 'Developing', confidence: 'Low', familiarPct: 78, novelPct: 55, evidenceCount: 2, contexts: ['Card Draw'], currentLevel: 3 },
  timeAndWork: { transferState: 'Weak', confidence: 'Medium', familiarPct: 85, novelPct: 38, evidenceCount: 5, contexts: ['Pipe Filling', 'Assembly Line'], currentLevel: 3 },
  permutation: { transferState: 'Weak', confidence: 'Medium', familiarPct: 79, novelPct: 41, evidenceCount: 5, contexts: ['Seating Plan'], currentLevel: 3 },
  numberSystems: { transferState: 'Strong familiar, weak novel', confidence: 'High', familiarPct: 94, novelPct: 47, evidenceCount: 8, contexts: ['Packing Boxes', 'Bell Schedule', 'Tile Grid'], currentLevel: 4 },
};

const FAMILIAR_QUESTIONS = {
  percentages: { questionText: 'What is a 20% increase on 150?', correctAnswer: 180, tolerance: 0.5, answerUnit: '' },
  ratios: { questionText: 'Divide 240 in the ratio 3:5. What is the larger share?', correctAnswer: 150, tolerance: 0.5, answerUnit: '' },
  probability: { questionText: 'A bag has 4 red and 6 blue balls. What is the probability of drawing a red ball, as a percentage?', correctAnswer: 40, tolerance: 0.5, answerUnit: '%' },
  timeAndWork: { questionText: 'A can finish a job in 10 days, B in 15 days. Working together, how many days will they take?', correctAnswer: 6, tolerance: 0.2, answerUnit: 'days' },
  permutation: { questionText: 'In how many ways can 4 distinct books be arranged on a shelf?', correctAnswer: 24, tolerance: 0, answerUnit: '' },
  numberSystems: { questionText: 'What is the remainder when 47 is divided by 6?', correctAnswer: 5, tolerance: 0, answerUnit: '' },
};

// Hand-checked fallback bank — used only if a live AI generation fails validation.
const FALLBACK_QUESTIONS = {
  percentages: [
    {
      context: 'Water Tank Reading',
      scenarioText: "A water tank's level sensor read 180 cm on Monday. After a slow leak over the week, Friday's reading was 144 cm.",
      askText: "Express Friday's reading as a percentage decrease from Monday's, rounded to the nearest whole percent.",
      method: 'Percentage Change Formula', correctAnswer: 20, tolerance: 0.5, answerUnit: '%',
      solutionSteps: ['Decrease = 180 − 144 = 36 cm', 'Percentage decrease = (36 / 180) × 100', '= 20%'],
      noveltyDimensions: ['context change', 'reduced keyword dependency'],
    },
    {
      context: 'Library Collection Growth',
      scenarioText: "A community library's book collection grew from 8,400 titles to 9,660 titles after a donation drive.",
      askText: 'By what percentage did the collection grow, rounded to the nearest whole percent?',
      method: 'Percentage Change Formula', correctAnswer: 15, tolerance: 0.5, answerUnit: '%',
      solutionSteps: ['Increase = 9660 − 8400 = 1260', 'Percentage increase = (1260 / 8400) × 100', '= 15%'],
      noveltyDimensions: ['context change'],
    },
  ],
  ratios: [
    {
      context: 'Bakery Flour Blend',
      scenarioText: "A bakery's flour-to-sugar blend totals 450 g. For every 5 parts flour, the recipe uses 4 parts sugar.",
      askText: 'How many grams of sugar are in the blend?',
      method: 'Simple Ratio Comparison', correctAnswer: 200, tolerance: 1, answerUnit: 'g',
      solutionSteps: ['Total parts = 5 + 4 = 9', 'Each part = 450 / 9 = 50 g', 'Sugar = 4 × 50 = 200 g'],
      noveltyDimensions: ['context change', 'reduced keyword dependency'],
    },
    {
      context: 'Charity Ticket Sales',
      scenarioText: 'A charity event sold adult and child tickets. For every 7 adult tickets sold, 3 child tickets were sold. In total, 210 adult tickets were sold.',
      askText: 'How many child tickets were sold?',
      method: 'Proportion Scaling', correctAnswer: 90, tolerance: 1, answerUnit: '',
      solutionSteps: ['Scale factor = 210 / 7 = 30', 'Child tickets = 3 × 30 = 90'],
      noveltyDimensions: ['context change'],
    },
  ],
  probability: [
    {
      context: 'Quality Control Bin',
      scenarioText: 'A quality-control bin holds 25 identical-looking bolts pulled from a batch; 4 of them are undersized.',
      askText: 'If one bolt is picked at random for inspection, what is the chance it is undersized, as a percentage?',
      method: 'Classical Probability', correctAnswer: 16, tolerance: 0.5, answerUnit: '%',
      solutionSteps: ['P(undersized) = 4 / 25', '= 0.16', '= 16%'],
      noveltyDimensions: ['context change', 'reduced keyword dependency'],
    },
    {
      context: 'Raffle Box',
      scenarioText: 'A raffle box holds 90 tickets. 18 of them are marked as winning tickets.',
      askText: 'What is the chance of NOT drawing a winning ticket on the first draw, as a percentage?',
      method: 'Complementary Event', correctAnswer: 80, tolerance: 0.5, answerUnit: '%',
      solutionSteps: ['P(winning) = 18 / 90 = 0.2', 'P(not winning) = 1 − 0.2 = 0.8', '= 80%'],
      noveltyDimensions: ['context change', 'hidden cue'],
    },
  ],
  timeAndWork: [
    {
      context: 'Print Shop Machines',
      scenarioText: 'A print shop has two printers. Printer P produces 150 flyers per hour and Printer Q produces 100 flyers per hour, running at the same time.',
      askText: 'How many hours will they take together to print 2,000 flyers?',
      method: 'Work Rate Addition', correctAnswer: 8, tolerance: 0.2, answerUnit: 'hours',
      solutionSteps: ['Combined rate = 150 + 100 = 250 flyers/hour', 'Time = 2000 / 250 = 8 hours'],
      noveltyDimensions: ['context change', 'representation change'],
    },
    {
      context: 'Warehouse Sorting Bots',
      scenarioText: 'Two sorting robots load a container. Robot 1 alone would take 9 hours; Robot 2 alone would take 6 hours.',
      askText: 'Working together, how many hours will the robots take to load one container? Round to one decimal place.',
      method: 'LCM (Total Work) Method', correctAnswer: 3.6, tolerance: 0.1, answerUnit: 'hours',
      solutionSteps: ['Combined rate = 1/9 + 1/6 = 2/18 + 3/18 = 5/18', 'Time = 18 / 5 = 3.6 hours'],
      noveltyDimensions: ['context change'],
    },
  ],
  permutation: [
    {
      context: 'Committee Roles',
      scenarioText: 'A school committee must fill a president, a secretary, and a treasurer role from 6 candidates. Each candidate can hold at most one role.',
      askText: 'In how many different ways can the three roles be filled?',
      method: 'Permutation Formula (nPr)', correctAnswer: 120, tolerance: 0, answerUnit: '',
      solutionSteps: ['P(6,3) = 6 × 5 × 4', '= 120'],
      noveltyDimensions: ['context change', 'reduced keyword dependency'],
    },
    {
      context: 'Signal Flags',
      scenarioText: 'A signal officer arranges 6 differently colored flags in a vertical row to send a message.',
      askText: 'How many distinct flag orderings are possible?',
      method: 'Permutation Formula (nPr)', correctAnswer: 720, tolerance: 0, answerUnit: '',
      solutionSteps: ['All 6 flags arranged in a row = 6!', '6! = 720'],
      noveltyDimensions: ['context change'],
    },
  ],
  numberSystems: [
    {
      context: 'Warehouse Packing',
      scenarioText: 'A warehouse packs items into boxes of 8. A batch of 259 items is packed into as many full boxes as possible.',
      askText: 'How many items are left over once no more full boxes can be packed?',
      method: 'Remainder Theorem', correctAnswer: 3, tolerance: 0, answerUnit: '',
      solutionSteps: ['259 ÷ 8 = 32 remainder 3', '8 × 32 = 256', '259 − 256 = 3'],
      noveltyDimensions: ['context change', 'reduced keyword dependency'],
    },
    {
      context: 'Garden Row Planning',
      scenarioText: 'A gardener wants rows that each hold the same number of flowers, one type per row. There are 84 tulip bulbs and 126 daffodil bulbs.',
      askText: 'What is the greatest number of flowers that can be planted in each row?',
      method: 'HCF-LCM Method', correctAnswer: 42, tolerance: 0, answerUnit: '',
      solutionSteps: ['84 = 2² × 3 × 7', '126 = 2 × 3² × 7', 'HCF = 2 × 3 × 7 = 42'],
      noveltyDimensions: ['context change', 'unfamiliar structure'],
    },
  ],
};

function fallbackBridge(topicName, method) {
  return {
    bridgeTitle: 'Spot the structure, not the words',
    bridgeExplanation: `Look past the setting and find the two changing quantities the question gives you, plus the relationship between them. That relationship is what tells you ${topicName} — specifically ${method} — applies, no matter how the scenario is dressed up.`,
    hints: [
      'Underline every number in the question and label what each one represents.',
      'Ask what changed between two states, and what stayed fixed.',
      `That before/after relationship is exactly what ${method} is built to handle.`,
    ],
    guided: null,
  };
}

// ---------------------------------------------------------------------------
// UTILITIES
// ---------------------------------------------------------------------------
let uidCounter = 0;
function uid(prefix) {
  uidCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${uidCounter}`;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

function isNumericCorrect(input, correctAnswer, tolerance) {
  if (input === '' || input === null || input === undefined) return false;
  const val = parseFloat(String(input).replace(/,/g, '').trim());
  if (!Number.isFinite(val)) return false;
  const tol = typeof tolerance === 'number' && tolerance >= 0 ? tolerance : 0.5;
  return Math.abs(val - correctAnswer) <= tol;
}

function pickConceptOptions(topicId) {
  const others = TOPICS.filter((t) => t.id !== topicId);
  const distractors = shuffle(others).slice(0, 3);
  return shuffle([
    { label: TOPIC_NAME[topicId], correct: true },
    ...distractors.map((t) => ({ label: t.name, correct: false })),
  ]);
}

function pickMethodOptions(topicId, correctMethod) {
  const pool = TOPIC_METHODS[topicId] || [];
  const safeCorrect = pool.includes(correctMethod) ? correctMethod : pool[0];
  const distractorPool = pool.filter((m) => m !== safeCorrect);
  const distractors = shuffle(distractorPool).slice(0, 2);
  return shuffle([
    { label: safeCorrect, correct: true },
    ...distractors.map((m) => ({ label: m, correct: false })),
  ]);
}

function emptySession() {
  return {
    topicId: null,
    level: 4,
    familiar: null,
    novel1: null,
    novel1Answers: null,
    classification1: null,
    bridge: null,
    guidedAnswers: null,
    novel2: null,
    novel2Answers: null,
    classification2: null,
  };
}

// ---------------------------------------------------------------------------
// STORAGE — INTEGRATION: replace with real API calls against
// CONFIG.PREPVISTA_API_BASE_URL in production; critical state (transferState,
// mastery, confidence) must be computed and validated server-side.
// ---------------------------------------------------------------------------
const hasStorage = typeof window !== 'undefined' && !!window.storage;

async function safeGetJSON(key, fallback) {
  if (!hasStorage) return fallback;
  try {
    const res = await window.storage.get(key, false);
    if (!res || res.value === undefined || res.value === null) return fallback;
    return JSON.parse(res.value);
  } catch (e) {
    return fallback;
  }
}

async function safeSetJSON(key, value) {
  if (!hasStorage) return false;
  try {
    await window.storage.set(key, JSON.stringify(value), false);
    return true;
  } catch (e) {
    console.error('ACEAPT Transfer: storage write failed', key, e);
    return false;
  }
}

async function loadAllProfiles() {
  const seeded = await safeGetJSON('aceapt_transfer_seeded_v1', false);
  const result = {};
  if (!seeded) {
    for (const topicId of Object.keys(SEED_PROFILES)) {
      const profile = { ...SEED_PROFILES[topicId], lastUpdated: new Date().toISOString() };
      await safeSetJSON(`aceapt_transfer_profile_${topicId}`, profile);
      result[topicId] = profile;
    }
    await safeSetJSON('aceapt_transfer_seeded_v1', true);
  } else {
    for (const topicId of Object.keys(SEED_PROFILES)) {
      const stored = await safeGetJSON(`aceapt_transfer_profile_${topicId}`, null);
      result[topicId] = stored || { ...SEED_PROFILES[topicId], lastUpdated: new Date().toISOString() };
    }
  }
  return result;
}

async function saveProfile(topicId, profile) {
  await safeSetJSON(`aceapt_transfer_profile_${topicId}`, profile);
}

function buildEvidenceRecords(curSession) {
  const records = [];
  if (curSession.novel1 && curSession.novel1Answers) {
    records.push({
      id: uid('ev'), timestamp: new Date().toISOString(), level: curSession.level,
      context: curSession.novel1.context, classification: curSession.classification1,
      conceptCorrect: curSession.novel1Answers.conceptCorrect,
      methodCorrect: curSession.novel1Answers.methodCorrect,
      numericCorrect: curSession.novel1Answers.numericCorrect,
      source: curSession.novel1.source,
    });
  }
  if (curSession.novel2 && curSession.novel2Answers) {
    records.push({
      id: uid('ev'), timestamp: new Date().toISOString(), level: curSession.level,
      context: curSession.novel2.context, classification: curSession.classification2,
      conceptCorrect: curSession.novel2Answers.conceptCorrect,
      methodCorrect: curSession.novel2Answers.methodCorrect,
      numericCorrect: curSession.novel2Answers.numericCorrect,
      source: curSession.novel2.source,
    });
  }
  return records;
}

async function appendEvidence(topicId, records) {
  if (!records.length) return;
  const key = `aceapt_transfer_evidence_${topicId}`;
  const existing = await safeGetJSON(key, []);
  const merged = [...existing, ...records].slice(-50);
  await safeSetJSON(key, merged);
}

// ---------------------------------------------------------------------------
// AI GENERATION — live calls to Claude, schema-validated, with graceful
// fallback to the hand-checked question bank above.
// ---------------------------------------------------------------------------
const NOVEL_QUESTION_SYSTEM = 'You write short, rigorous quantitative-aptitude word problems for an exam-prep product. You always answer with a single raw JSON object and nothing else: no markdown fences, no preamble, no trailing commentary.';
const BRIDGE_SYSTEM = 'You are a sharp, concise aptitude tutor. You repair one specific gap at a time rather than re-teaching a whole topic. You always answer with a single raw JSON object and nothing else.';

function buildNovelQuestionPrompt({ topicId, level, avoidContexts, avoidKeywords }) {
  const topicName = TOPIC_NAME[topicId];
  const methodList = (TOPIC_METHODS[topicId] || []).join(', ');
  const levelLine = TRANSFER_LEVEL_DESC[level] || TRANSFER_LEVEL_DESC[4];
  const avoidCtxLine = avoidContexts.length ? avoidContexts.join('; ') : 'none yet';
  const avoidKwLine = avoidKeywords.length ? avoidKeywords.join(', ') : 'none';
  return [
    `Concept to test: ${topicName}.`,
    `Novelty goal: ${levelLine}.`,
    `Pick exactly one method from this list and copy it verbatim into "method": ${methodList}.`,
    `The real-world setting must differ from all of these already used: ${avoidCtxLine}.`,
    `In "scenarioText" only (not "askText"), do not use any of these words: ${avoidKwLine}.`,
    `Write "scenarioText": 25-55 words, sets up the situation and gives every number needed, reads naturally, names no topic or method, and does not ask a question yet.`,
    `Write "askText": one short sentence that asks for the single numeric answer and states the exact expected format (rounding, decimal places, or unit) so grading is unambiguous.`,
    `Give 2-4 short "solutionSteps" strings showing correct working to "correctAnswer".`,
    `Give 1-3 "noveltyDimensions" from: context change, wording change, representation change, information-order change, reduced keyword dependency, hidden cue, unfamiliar structure.`,
    `Reply with only this JSON shape, no other text:`,
    `{"context":"3-5 word scenario label","scenarioText":"...","askText":"...","method":"...","correctAnswer":0,"tolerance":0,"answerUnit":"","solutionSteps":["...","..."],"noveltyDimensions":["..."]}`,
  ].join('\n');
}

function buildBridgePrompt({ topicId, gapType, scenarioText, askText, correctMethod, chosenMethodLabel, correctAnswer }) {
  const topicName = TOPIC_NAME[topicId];
  const gapLine = gapType === 'concept_identification'
    ? `The student could not tell that "${topicName}" was the relevant concept for this kind of scenario.`
    : `The student correctly identified "${topicName}" as the concept, but chose the method "${chosenMethodLabel}" instead of the correct method "${correctMethod}".`;
  return [
    `A student just struggled on this transfer question:`,
    `Scenario: ${scenarioText}`,
    `Question: ${askText}`,
    `Correct method: ${correctMethod}`,
    `Correct answer: ${correctAnswer}`,
    `Diagnosed gap: ${gapLine}`,
    `Write a short, targeted repair for exactly this gap (not a full re-teach of ${topicName}), plus one new guided practice question: same concept (${topicName}), a different everyday setting, with the concept already given to the student so they focus on ${gapType === 'method_selection' ? 'choosing the right method and solving it' : 'recognizing the concept and solving it'}.`,
    `Reply with only this JSON shape, no other text:`,
    `{"bridgeTitle":"3-6 word title","bridgeExplanation":"2-3 plain sentences, specific to this gap","hints":["nudge to inspect the changing quantities","point at the relevant relationship without naming the method","name the conceptual direction plainly"],"guided":{"context":"3-5 word label","scenarioText":"...","askText":"...","method":"${correctMethod}","correctAnswer":0,"tolerance":0,"answerUnit":"","solutionSteps":["...","..."]}}`,
  ].join('\n');
}

async function callClaudeJSON(systemPrompt, userPrompt) {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1 || end < start) return null;
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch (err) {
    console.error('ACEAPT Transfer: AI call failed', err);
    return null;
  }
}

function validateGeneratedQuestion(raw, topicId) {
  if (!raw || typeof raw !== 'object') return null;
  const { context, scenarioText, askText, method, correctAnswer, tolerance, answerUnit, solutionSteps, noveltyDimensions } = raw;
  if (typeof scenarioText !== 'string' || scenarioText.trim().length < 15) return null;
  if (typeof askText !== 'string' || askText.trim().length < 5) return null;
  if (typeof correctAnswer !== 'number' || !Number.isFinite(correctAnswer)) return null;
  const pool = TOPIC_METHODS[topicId] || [];
  const chosenMethod = pool.includes(method) ? method : pool[0];
  if (!chosenMethod) return null;
  return {
    topicId,
    context: (typeof context === 'string' && context.trim()) ? context.trim().slice(0, 40) : TOPIC_NAME[topicId],
    scenarioText: scenarioText.trim(),
    askText: askText.trim(),
    method: chosenMethod,
    correctAnswer,
    tolerance: (typeof tolerance === 'number' && tolerance >= 0) ? tolerance : 0.5,
    answerUnit: typeof answerUnit === 'string' ? answerUnit.trim() : '',
    solutionSteps: (Array.isArray(solutionSteps) && solutionSteps.length) ? solutionSteps.slice(0, 5).map(String) : ['Step-by-step solution unavailable.'],
    noveltyDimensions: Array.isArray(noveltyDimensions) ? noveltyDimensions.slice(0, 4).map(String) : [],
  };
}

function validateBridge(raw, topicId, correctMethod) {
  if (!raw || typeof raw !== 'object') return null;
  const { bridgeTitle, bridgeExplanation, hints, guided } = raw;
  if (typeof bridgeExplanation !== 'string' || bridgeExplanation.trim().length < 10) return null;
  const safeHints = Array.isArray(hints) ? hints.slice(0, 3).map(String) : [];
  while (safeHints.length < 3) safeHints.push('Re-read the scenario and label what each number represents.');
  let safeGuided = null;
  if (guided && typeof guided === 'object') {
    safeGuided = validateGeneratedQuestion({ ...guided, method: guided.method || correctMethod }, topicId);
  }
  return {
    bridgeTitle: (typeof bridgeTitle === 'string' && bridgeTitle.trim()) ? bridgeTitle.trim().slice(0, 60) : 'Closing the gap',
    bridgeExplanation: bridgeExplanation.trim(),
    hints: safeHints,
    guided: safeGuided,
  };
}

async function generateNovelQuestion({ topicId, level, avoidContexts, avoidKeywords }) {
  const prompt = buildNovelQuestionPrompt({ topicId, level, avoidContexts, avoidKeywords });
  const raw = await callClaudeJSON(NOVEL_QUESTION_SYSTEM, prompt);
  const validated = validateGeneratedQuestion(raw, topicId);
  if (validated) return { ...validated, source: 'ai' };
  const bank = FALLBACK_QUESTIONS[topicId] || [];
  const unused = bank.filter((q) => !avoidContexts.includes(q.context));
  const pool = unused.length ? unused : bank;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  return { ...pick, topicId, source: 'fallback' };
}

async function generateBridge({ topicId, gapType, scenarioText, askText, correctMethod, chosenMethodLabel, correctAnswer }) {
  const prompt = buildBridgePrompt({ topicId, gapType, scenarioText, askText, correctMethod, chosenMethodLabel, correctAnswer });
  const raw = await callClaudeJSON(BRIDGE_SYSTEM, prompt);
  const validated = validateBridge(raw, topicId, correctMethod);
  if (validated) return { ...validated, source: 'ai' };
  return { ...fallbackBridge(TOPIC_NAME[topicId], correctMethod), source: 'fallback' };
}

// ---------------------------------------------------------------------------
// DIAGNOSTIC ENGINE — deterministic, auditable. AI never grades a student.
// ---------------------------------------------------------------------------
function classifyAttempt(conceptCorrect, methodCorrect, numericCorrect) {
  if (conceptCorrect && methodCorrect && numericCorrect) return 'transfer_success';
  if (!conceptCorrect) return 'concept_identification';
  if (!methodCorrect) return 'method_selection';
  return 'calc_only';
}

function diagnosisRows(conceptCorrect, methodCorrect, numericCorrect) {
  return [
    { label: 'Concept identification', state: conceptCorrect ? 'correct' : 'incorrect' },
    { label: 'Method selection', state: methodCorrect ? 'correct' : 'incorrect' },
    { label: 'Calculation', state: conceptCorrect && methodCorrect ? (numericCorrect ? 'correct' : 'incorrect') : 'na' },
  ];
}

const DIAGNOSIS_COPY = {
  transfer_success: {
    label: 'Transferred',
    headline: (topic) => `Your transfer ability on ${topic} looks strong here.`,
    body: () => `You recognized the concept, picked the right method, and solved it correctly — even though the question was deliberately unfamiliar. That's real evidence of application, not just recall.`,
  },
  concept_identification: {
    label: 'Concept gap',
    headline: (topic) => `You know ${topic} — the gap is recognizing it here.`,
    body: (topic) => `When the surface details changed, it got harder to see that ${topic} was even the relevant concept. That's a recognition gap, not a knowledge gap — the underlying understanding is still there.`,
  },
  method_selection: {
    label: 'Method gap',
    headline: (topic) => `You spotted ${topic} correctly — the gap is choosing how to apply it.`,
    body: () => `You identified the right concept but reached for the wrong approach. That's a narrower, more fixable gap than not recognizing the concept at all.`,
  },
  calc_only: {
    label: 'Execution only',
    headline: (topic) => `Your transfer ability on ${topic} appears strong.`,
    body: () => `You correctly identified the concept and the method — the only slip was in the arithmetic. That's not a transfer weakness; it's worth a quick accuracy check, not more topic practice.`,
  },
};

function categoryForState(state) {
  if (state === 'Strong') return 'strong';
  if (state === 'Weak') return 'weak';
  if (state === 'Strong familiar, weak novel') return 'split';
  return 'developing';
}

function computeUpdatedProfile(prev, { novel1Classification, novel2Classification, context1, context2, level }) {
  let novelPct = prev.novelPct;
  if (novel2Classification === 'transfer_success') novelPct = Math.min(100, novelPct + 14);
  else if (novel2Classification === 'calc_only') novelPct = Math.min(100, novelPct + 6);
  else novelPct = Math.max(0, novelPct - 2);

  const evidenceCount = prev.evidenceCount + 2;
  const confidence = evidenceCount >= 6 ? 'High' : evidenceCount >= 3 ? 'Medium' : 'Low';
  const contexts = Array.from(new Set([...(prev.contexts || []), context1, context2].filter(Boolean)));

  let transferState = prev.transferState;
  if (novel2Classification === 'transfer_success') {
    transferState = novel1Classification === 'transfer_success'
      ? (novelPct >= 75 && evidenceCount >= 6 ? 'Strong' : 'Developing')
      : 'Improving';
  } else if (prev.transferState !== 'Weak' && prev.transferState !== 'Strong familiar, weak novel') {
    transferState = 'Developing';
  }

  return { ...prev, novelPct, evidenceCount, confidence, contexts, transferState, currentLevel: level, lastUpdated: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// GLOBAL STYLE / DESIGN SYSTEM
// "Paper" = surface form of a problem. "Structure" = the revealed underlying
// concept. The light/dark duality is the product's thesis, used as a device.
// ---------------------------------------------------------------------------
function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&display=swap');

      .at-root {
        --paper: #EEF0EA;
        --paper-line: #D7DACF;
        --ink: #1C2230;
        --ink-soft: #545C6C;
        --structure: #141A24;
        --structure-line: #2B3241;
        --chalk: #ECE7DA;
        --chalk-soft: #98A0AF;
        --marigold: #C7962A;
        --marigold-deep: #8C6A1C;
        --marigold-soft: #F3E4BE;
        --pine: #2F6E5C;
        --pine-soft: #DCEAE4;
        --brick: #AF4B3C;
        --brick-soft: #F3DAD3;
        background: var(--paper);
        color: var(--ink);
      }
      .at-font-display { font-family: 'Space Mono', 'Courier New', monospace; }
      .at-font-body { font-family: 'Source Serif 4', Georgia, serif; }

      .at-root ::selection { background: var(--marigold-soft); color: var(--ink); }
      .at-root *:focus-visible { outline: 2px solid var(--marigold); outline-offset: 2px; border-radius: 2px; }

      .at-paper-card {
        background: var(--paper);
        border: 1px solid var(--paper-line);
        background-image: linear-gradient(var(--paper-line) 1px, transparent 1px);
        background-size: 100% 28px;
      }
      .at-structure-panel {
        background: var(--structure);
        border: 1px solid var(--structure-line);
        color: var(--chalk);
        background-image: radial-gradient(var(--structure-line) 1px, transparent 1px);
        background-size: 14px 14px;
      }

      .at-pin { animation: at-pin-in 420ms ease both; }
      .at-pin:nth-child(1) { animation-delay: 60ms; }
      .at-pin:nth-child(2) { animation-delay: 200ms; }
      .at-pin:nth-child(3) { animation-delay: 340ms; }
      @keyframes at-pin-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }

      .at-screen-enter { animation: at-screen-in 320ms ease both; }
      @keyframes at-screen-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

      .at-pulse { animation: at-pulse-op 1.6s ease-in-out infinite; }
      @keyframes at-pulse-op { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }

      @media (prefers-reduced-motion: reduce) {
        .at-root, .at-root * { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
      }
    `}</style>
  );
}

// ---------------------------------------------------------------------------
// UI ATOMS
// ---------------------------------------------------------------------------
function Eyebrow({ children }) {
  return (
    <div className="at-font-display text-xs font-bold uppercase" style={{ color: 'var(--marigold-deep)', letterSpacing: '0.14em' }}>
      {children}
    </div>
  );
}

function PrimaryButton({ children, onClick, disabled, icon: Icon }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="at-font-display inline-flex items-center gap-2 rounded-md px-5 py-3 text-sm font-bold uppercase transition-transform duration-150 hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
      style={{ background: 'var(--marigold)', color: '#1C1404', letterSpacing: '0.05em' }}
    >
      {children}
      {Icon ? <Icon size={16} /> : null}
    </button>
  );
}

function PillBadge({ tone, children, icon: Icon }) {
  const styles = {
    neutral: { background: 'var(--paper)', border: '1px solid var(--paper-line)', color: 'var(--ink-soft)' },
    marigold: { background: 'var(--marigold-soft)', border: '1px solid var(--marigold)', color: 'var(--marigold-deep)' },
    pine: { background: 'var(--pine-soft)', border: '1px solid var(--pine)', color: 'var(--pine)' },
    brick: { background: 'var(--brick-soft)', border: '1px solid var(--brick)', color: 'var(--brick)' },
    structure: { background: 'var(--structure)', border: '1px solid var(--structure-line)', color: 'var(--chalk)' },
  };
  const s = styles[tone] || styles.neutral;
  return (
    <span className="at-font-display inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase" style={{ ...s, letterSpacing: '0.04em' }}>
      {Icon ? <Icon size={12} /> : null}
      {children}
    </span>
  );
}

function RulerBar({ label, value, tone }) {
  const barColor = tone === 'marigold' ? 'var(--marigold)' : tone === 'pine' ? 'var(--pine)' : 'var(--ink)';
  return (
    <div className="flex items-center gap-3">
      <div className="at-font-display w-24 shrink-0 text-xs" style={{ color: 'var(--ink-soft)' }}>{label}</div>
      <div className="relative h-6 flex-1 overflow-hidden rounded-sm" style={{ background: 'var(--paper-line)' }}>
        <div className="h-full transition-all duration-700 ease-out" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: barColor }} />
        {[20, 40, 60, 80].map((tick) => (
          <div key={tick} className="absolute top-0 h-full w-px" style={{ left: `${tick}%`, background: 'rgba(28,34,48,0.15)' }} />
        ))}
      </div>
      <div className="at-font-display w-12 shrink-0 text-right text-sm font-bold" style={{ color: 'var(--ink)' }}>{Math.round(value)}%</div>
    </div>
  );
}

function MCQGroup({ options, selectedIndex, onSelect, disabled }) {
  return (
    <div className="grid gap-2">
      {options.map((opt, i) => {
        const isSelected = selectedIndex === i;
        return (
          <button
            key={i}
            disabled={disabled}
            onClick={() => onSelect(i)}
            className="at-font-body flex items-center gap-3 rounded-md border px-4 py-3 text-left text-base transition-colors duration-150 disabled:opacity-60"
            style={{ borderColor: isSelected ? 'var(--marigold)' : 'var(--paper-line)', background: isSelected ? 'var(--marigold-soft)' : '#fff', color: 'var(--ink)' }}
          >
            <span
              className="at-font-display flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
              style={{ border: `1.5px solid ${isSelected ? 'var(--marigold)' : 'var(--ink-soft)'}`, color: isSelected ? 'var(--marigold-deep)' : 'var(--ink-soft)' }}
            >
              {String.fromCharCode(65 + i)}
            </span>
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function NumericField({ value, onChange, unit, onSubmit, autoFocus }) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="text"
        inputMode="decimal"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(); }}
        placeholder="Your answer"
        className="at-font-display w-40 rounded-md border px-4 py-3 text-lg"
        style={{ borderColor: 'var(--ink-soft)', background: '#fff', color: 'var(--ink)' }}
      />
      {unit ? <span className="at-font-display text-sm" style={{ color: 'var(--ink-soft)' }}>{unit}</span> : null}
    </div>
  );
}

const FLOW_STEPS = ['familiar', 'novel1', 'bridge', 'novel2', 'result'];
function ProgressDots({ current }) {
  const idx = Math.max(0, FLOW_STEPS.indexOf(current));
  return (
    <div className="flex items-center gap-1.5">
      {FLOW_STEPS.map((s, i) => (
        <div key={s} className="h-1.5 rounded-full transition-all duration-300" style={{ width: i === idx ? '20px' : '8px', background: i <= idx ? 'var(--marigold)' : 'var(--paper-line)' }} />
      ))}
    </div>
  );
}

function AILiveBadge() {
  return (
    <div className="at-font-display inline-flex items-center gap-1 text-xs font-bold uppercase" style={{ color: 'var(--marigold-deep)', letterSpacing: '0.04em' }}>
      <Zap size={12} className="at-pulse" />
      Generated live
    </div>
  );
}

function LoadingOverlay({ message }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20">
      <Loader2 className="animate-spin" size={28} style={{ color: 'var(--marigold)' }} />
      <div className="at-font-display text-sm" style={{ color: 'var(--ink-soft)' }}>{message}</div>
    </div>
  );
}

function BackLink({ onClick, label }) {
  return (
    <button onClick={onClick} className="at-font-display inline-flex items-center gap-1.5 text-xs font-bold uppercase" style={{ color: 'var(--ink-soft)', letterSpacing: '0.04em' }}>
      <ArrowLeft size={14} /> {label}
    </button>
  );
}

function TopBar({ screen, onDashboard, onInstitution }) {
  return (
    <div className="flex items-center justify-between border-b px-6 py-4" style={{ borderColor: 'var(--paper-line)' }}>
      <button onClick={onDashboard} className="at-font-display flex items-center gap-2 text-sm font-bold">
        <span style={{ color: 'var(--marigold-deep)' }}>ACEAPT</span>
        <span style={{ color: 'var(--ink-soft)' }}>·</span>
        <span style={{ color: 'var(--ink)' }}>TRANSFER</span>
      </button>
      <button
        onClick={onInstitution}
        className="at-font-display inline-flex items-center gap-1.5 text-xs font-bold uppercase"
        style={{ color: screen === 'institution' ? 'var(--marigold-deep)' : 'var(--ink-soft)', letterSpacing: '0.04em' }}
      >
        <Building2 size={14} /> Institution view
      </button>
    </div>
  );
}

function ChallengeShell({ step, eyebrow, children }) {
  return (
    <div className="at-screen-enter mx-auto max-w-2xl px-6 py-10">
      <ProgressDots current={step} />
      <div className="mt-4"><Eyebrow>{eyebrow}</Eyebrow></div>
      <div className="at-paper-card mt-4 rounded-lg p-6">{children}</div>
    </div>
  );
}

function DiagnosisMark({ state }) {
  if (state === 'correct') return <span className="at-font-display inline-flex items-center gap-1.5 text-sm font-bold" style={{ color: '#7FD9BC' }}><CheckCircle2 size={16} /> Correct</span>;
  if (state === 'incorrect') return <span className="at-font-display inline-flex items-center gap-1.5 text-sm font-bold" style={{ color: '#E4948A' }}><XCircle size={16} /> Off</span>;
  return <span className="at-font-display inline-flex items-center gap-1.5 text-sm font-bold" style={{ color: 'var(--chalk-soft)' }}><Minus size={16} /> Not scored</span>;
}

function IntegrationNotes() {
  return (
    <div className="at-structure-panel mt-3 rounded-lg p-5">
      <div className="flex items-center gap-2">
        <Info size={14} style={{ color: 'var(--chalk)' }} />
        <div className="at-font-display text-xs font-bold uppercase" style={{ color: 'var(--chalk)', letterSpacing: '0.05em' }}>For engineering</div>
      </div>
      <ul className="at-font-body mt-3 space-y-2 text-sm" style={{ color: 'var(--chalk-soft)' }}>
        <li>No existing PrepVista repository was available to inspect, so this runs standalone with mocked profile data and this artifact's built-in storage.</li>
        <li><code>CONFIG</code> at the top of the source has blank placeholders for the real API base URL, auth token, and the Pathfinder / Proof webhook endpoints — fill those in to replace the mocked calls.</li>
        <li>Novel questions, diagnosis narration copy, and micro-bridges are generated live by Claude and schema-validated before use; invalid output falls back to a hand-checked question bank so a bad generation never blocks or penalizes a student.</li>
        <li>Transfer profile and evidence currently persist to this artifact's storage as a stand-in for a real database — in production, compute and validate these server-side; never trust transfer state written by the client.</li>
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SCREENS
// ---------------------------------------------------------------------------
function Dashboard({ profiles, onSelectTopic, onOpenNotes, notesOpen, onInstitution }) {
  const categories = { strong: [], developing: [], weak: [], split: [] };
  Object.entries(profiles).forEach(([id, p]) => {
    const cat = categoryForState(p.transferState);
    (categories[cat] || categories.developing).push({ id, ...p });
  });
  const transferCounts = {
    strong: categories.strong.length,
    developing: categories.developing.length,
    watching: categories.weak.length + categories.split.length,
  };
  const featuredId = (profiles.percentages && profiles.percentages.transferState !== 'Strong')
    ? 'percentages'
    : (Object.keys(profiles).find((id) => profiles[id].transferState !== 'Strong') || 'percentages');
  const featured = profiles[featuredId];

  return (
    <div className="at-screen-enter mx-auto max-w-4xl px-6 py-10">
      <Eyebrow>PrepVista · ACEAPT</Eyebrow>
      <h1 className="at-font-display mt-2 text-3xl font-bold" style={{ color: 'var(--ink)' }}>Transfer profile</h1>
      <p className="at-font-body mt-2 max-w-xl text-base" style={{ color: 'var(--ink-soft)' }}>
        Solving familiar questions isn't the same as applying a concept somewhere new. This is where ACEAPT checks the difference.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {CAPABILITY_SNAPSHOT.map((c) => (
          <div key={c.key} className="at-paper-card rounded-lg p-4">
            <div className="at-font-display text-xs font-bold uppercase" style={{ color: 'var(--ink-soft)', letterSpacing: '0.04em' }}>{c.label}</div>
            {c.key === 'transfer' ? (
              <div className="mt-1.5 flex flex-wrap items-baseline gap-1">
                <span className="at-font-display text-sm font-bold" style={{ color: 'var(--pine)' }}>{transferCounts.strong} strong</span>
                <span className="at-font-display text-xs" style={{ color: 'var(--ink-soft)' }}>·</span>
                <span className="at-font-display text-sm font-bold" style={{ color: 'var(--marigold-deep)' }}>{transferCounts.developing} developing</span>
                <span className="at-font-display text-xs" style={{ color: 'var(--ink-soft)' }}>·</span>
                <span className="at-font-display text-sm font-bold" style={{ color: 'var(--brick)' }}>{transferCounts.watching} watching</span>
              </div>
            ) : (
              <div className="at-font-display mt-1 text-2xl font-bold" style={{ color: 'var(--ink)' }}>{c.value}%</div>
            )}
            <div className="at-font-body mt-1 text-xs" style={{ color: 'var(--ink-soft)' }}>{c.note}</div>
          </div>
        ))}
      </div>

      {featured ? (
        <div className="at-structure-panel mt-8 rounded-lg p-6">
          <div className="flex items-center gap-2">
            <Sparkles size={14} style={{ color: 'var(--marigold)' }} />
            <Eyebrow>Today's transfer challenge</Eyebrow>
          </div>
          <h2 className="at-font-display mt-1 text-xl font-bold" style={{ color: 'var(--chalk)' }}>{TOPIC_NAME[featuredId]}</h2>
          <p className="at-font-body mt-2 text-sm" style={{ color: 'var(--chalk-soft)' }}>
            You've handled familiar {TOPIC_NAME[featuredId].toLowerCase()} questions at {featured.familiarPct}%. Today checks whether that holds up when the problem looks nothing like practice.
          </p>
          <div className="mt-4 flex items-center gap-3">
            <PrimaryButton onClick={() => onSelectTopic(featuredId)} icon={PlayCircle}>Start challenge</PrimaryButton>
            <span className="at-font-display text-xs" style={{ color: 'var(--chalk-soft)' }}>3 steps · ~6 min</span>
          </div>
        </div>
      ) : null}

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <ProfileColumn title="Strong transfer" tone="pine" topics={categories.strong} onSelect={onSelectTopic} />
        <ProfileColumn title="Developing transfer" tone="marigold" topics={categories.developing} onSelect={onSelectTopic} />
        <ProfileColumn title="Weak transfer" tone="brick" topics={categories.weak} onSelect={onSelectTopic} />
        <ProfileColumn title="Strong familiar, weak novel" tone="brick" topics={categories.split} onSelect={onSelectTopic} note="High familiar score, but the concept isn't holding up in new contexts yet." />
      </div>

      <button onClick={onOpenNotes} className="at-font-display mt-10 inline-flex items-center gap-2 text-xs font-bold uppercase" style={{ color: 'var(--ink-soft)', letterSpacing: '0.04em' }}>
        <Settings2 size={14} /> Integration notes {notesOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {notesOpen ? <IntegrationNotes /> : null}
    </div>
  );
}

function ProfileColumn({ title, tone, topics, onSelect, note }) {
  if (!topics.length) return null;
  const toneColor = tone === 'pine' ? 'var(--pine)' : tone === 'brick' ? 'var(--brick)' : 'var(--marigold-deep)';
  return (
    <div className="at-paper-card rounded-lg p-4">
      <div className="at-font-display text-xs font-bold uppercase" style={{ color: toneColor, letterSpacing: '0.04em' }}>{title}</div>
      {note ? <div className="at-font-body mt-1 text-xs" style={{ color: 'var(--ink-soft)' }}>{note}</div> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {topics.map((t) => {
          const Icon = TOPIC_ICON[t.id];
          return (
            <button key={t.id} onClick={() => onSelect(t.id)} className="at-font-display inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold" style={{ borderColor: 'var(--paper-line)', color: 'var(--ink)', background: '#fff' }}>
              <Icon size={12} /> {TOPIC_NAME[t.id]} <ChevronRight size={12} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

const INSTITUTION_SAMPLE = {
  studentsTested: 342,
  strongPct: 37,
  developingPct: 43,
  weakPct: 20,
  topicGaps: [
    { topic: 'Time & Work', gapPct: 47 },
    { topic: 'Number Systems', gapPct: 47 },
    { topic: 'Permutation & Combination', gapPct: 44 },
    { topic: 'Probability', gapPct: 23 },
  ],
};

function StatCard({ label, value, tone, icon: Icon }) {
  const color = tone === 'pine' ? 'var(--pine)' : tone === 'brick' ? 'var(--brick)' : tone === 'marigold' ? 'var(--marigold-deep)' : 'var(--ink)';
  return (
    <div className="at-paper-card rounded-lg p-4">
      <div className="flex items-center gap-1.5">
        {Icon ? <Icon size={12} style={{ color: 'var(--ink-soft)' }} /> : null}
        <div className="at-font-display text-xs font-bold uppercase" style={{ color: 'var(--ink-soft)', letterSpacing: '0.04em' }}>{label}</div>
      </div>
      <div className="at-font-display mt-1 text-2xl font-bold" style={{ color }}>{value}</div>
    </div>
  );
}

function InstitutionView({ onBack }) {
  return (
    <div className="at-screen-enter mx-auto max-w-3xl px-6 py-10">
      <BackLink onClick={onBack} label="Student view" />
      <Eyebrow>For placement / institution teams</Eyebrow>
      <h1 className="at-font-display mt-2 text-2xl font-bold" style={{ color: 'var(--ink)' }}>Did training create capability?</h1>
      <p className="at-font-body mt-2 max-w-xl text-sm" style={{ color: 'var(--ink-soft)' }}>
        Illustrative sample data. Completion tells you students showed up. Transfer tells you they can actually use what they learned.
      </p>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Students tested" value={INSTITUTION_SAMPLE.studentsTested} icon={Users} />
        <StatCard label="Strong transfer" value={`${INSTITUTION_SAMPLE.strongPct}%`} tone="pine" icon={CheckCircle2} />
        <StatCard label="Developing" value={`${INSTITUTION_SAMPLE.developingPct}%`} tone="marigold" icon={TrendingUp} />
        <StatCard label="Weak transfer" value={`${INSTITUTION_SAMPLE.weakPct}%`} tone="brick" icon={AlertCircle} />
      </div>
      <div className="at-paper-card mt-6 rounded-lg p-5">
        <Eyebrow>Topic-level transfer gaps</Eyebrow>
        <div className="mt-4 space-y-3">
          {INSTITUTION_SAMPLE.topicGaps.map((g) => <RulerBar key={g.topic} label={g.topic} value={g.gapPct} tone="marigold" />)}
        </div>
      </div>
    </div>
  );
}

function TopicDetail({ topicId, profile, onBack, onBegin }) {
  const Icon = TOPIC_ICON[topicId];
  return (
    <div className="at-screen-enter mx-auto max-w-2xl px-6 py-10">
      <BackLink onClick={onBack} label="All topics" />
      <div className="mt-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: 'var(--marigold-soft)' }}>
          <Icon size={18} style={{ color: 'var(--marigold-deep)' }} />
        </div>
        <h1 className="at-font-display text-2xl font-bold" style={{ color: 'var(--ink)' }}>{TOPIC_NAME[topicId]}</h1>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <PillBadge tone="pine" icon={CheckCircle2}>Mastery {profile.familiarPct >= 85 ? 'high' : 'developing'}</PillBadge>
        <PillBadge tone="pine" icon={CheckCircle2}>Retention stable</PillBadge>
        <PillBadge tone="marigold" icon={TrendingUp}>Transfer {profile.transferState.toLowerCase()}</PillBadge>
      </div>

      <div className="at-paper-card mt-6 rounded-lg p-5">
        <Eyebrow>Familiar vs. novel</Eyebrow>
        <div className="mt-4 space-y-3">
          <RulerBar label="Familiar" value={profile.familiarPct} tone="ink" />
          <RulerBar label="Novel" value={profile.novelPct} tone="marigold" />
        </div>
      </div>

      <p className="at-font-body mt-6 text-base leading-relaxed" style={{ color: 'var(--ink)' }}>
        You already appear to understand {TOPIC_NAME[topicId].toLowerCase()}. Your current difficulty is applying it when the problem is represented differently — {profile.evidenceCount} novel {profile.evidenceCount === 1 ? 'challenge' : 'challenges'} across {profile.contexts.length} {profile.contexts.length === 1 ? 'context' : 'contexts'} so far, confidence: {profile.confidence.toLowerCase()}.
      </p>

      <div className="mt-6"><PrimaryButton onClick={onBegin} icon={ArrowRight}>Let's train that specific gap</PrimaryButton></div>
    </div>
  );
}

function ChallengeIntro({ topicId, onStart, onBack }) {
  return (
    <div className="at-screen-enter mx-auto max-w-xl px-6 py-16 text-center">
      <div className="text-left"><BackLink onClick={onBack} label="Back" /></div>
      <Eyebrow>Transfer challenge</Eyebrow>
      <h1 className="at-font-display mt-3 text-3xl font-bold" style={{ color: 'var(--ink)' }}>You've already learned this.</h1>
      <p className="at-font-body mx-auto mt-4 max-w-md text-lg" style={{ color: 'var(--ink-soft)' }}>
        This next problem is intentionally different from anything you've practiced in {TOPIC_NAME[topicId].toLowerCase()}. Don't look for a familiar pattern — find the underlying idea.
      </p>
      <div className="mt-8 flex justify-center"><PrimaryButton onClick={onStart} icon={PlayCircle}>Start challenge</PrimaryButton></div>
    </div>
  );
}

function FamiliarQuestionScreen({ topicId, onComplete }) {
  const q = FAMILIAR_QUESTIONS[topicId];
  const [answer, setAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const correct = isNumericCorrect(answer, q.correctAnswer, q.tolerance);

  function submit() {
    if (submitted || !answer) return;
    setSubmitted(true);
    setTimeout(() => onComplete({ correct, answer, question: q }), 800);
  }

  return (
    <ChallengeShell step="familiar" eyebrow="Warm-up · familiar pattern">
      <p className="at-font-body text-lg leading-relaxed" style={{ color: 'var(--ink)' }}>{q.questionText}</p>
      <div className="mt-6"><NumericField value={answer} onChange={setAnswer} unit={q.answerUnit} onSubmit={submit} autoFocus /></div>
      <div className="mt-6 flex items-center gap-3">
        <PrimaryButton onClick={submit} disabled={!answer || submitted} icon={ArrowRight}>Check answer</PrimaryButton>
        {submitted ? (
          <PillBadge tone={correct ? 'pine' : 'brick'} icon={correct ? CheckCircle2 : XCircle}>
            {correct ? 'Correct' : `Answer: ${q.correctAnswer}${q.answerUnit || ''}`}
          </PillBadge>
        ) : null}
      </div>
    </ChallengeShell>
  );
}

function NovelQuestionScreen({ questionNumber, topicId, question, onComplete }) {
  const [step, setStep] = useState('scenario');
  const [conceptIdx, setConceptIdx] = useState(null);
  const [methodIdx, setMethodIdx] = useState(null);
  const [answer, setAnswer] = useState('');
  const conceptOptions = useMemo(() => pickConceptOptions(topicId), [question, topicId]);
  const methodOptions = useMemo(() => pickMethodOptions(topicId, question.method), [question, topicId]);

  function submitFinal() {
    if (!answer) return;
    const conceptChoice = conceptIdx !== null ? conceptOptions[conceptIdx] : null;
    const methodChoice = methodIdx !== null ? methodOptions[methodIdx] : null;
    onComplete({
      conceptChoice, methodChoice,
      conceptCorrect: !!(conceptChoice && conceptChoice.correct),
      methodCorrect: !!(methodChoice && methodChoice.correct),
      numericAnswer: answer,
      numericCorrect: isNumericCorrect(answer, question.correctAnswer, question.tolerance),
    });
  }

  return (
    <ChallengeShell step={questionNumber === 1 ? 'novel1' : 'novel2'} eyebrow={`Transfer challenge · question ${questionNumber} of 2`}>
      <div className="flex items-center justify-between">
        <PillBadge tone="structure">{question.context}</PillBadge>
        {question.source === 'ai' ? <AILiveBadge /> : null}
      </div>

      <p className="at-font-body mt-4 text-lg leading-relaxed" style={{ color: 'var(--ink)' }}>{question.scenarioText}</p>

      {step === 'scenario' ? (
        <div className="mt-6"><PrimaryButton onClick={() => setStep('concept')} icon={ArrowRight}>I've read it — continue</PrimaryButton></div>
      ) : null}

      {step !== 'scenario' ? (
        <div className="mt-6">
          <div className="at-font-display inline-flex items-center gap-1.5 text-sm font-bold" style={{ color: 'var(--ink)' }}><Brain size={14} /> Which concept applies here?</div>
          <div className="mt-3"><MCQGroup options={conceptOptions} selectedIndex={conceptIdx} disabled={step !== 'concept'} onSelect={(i) => { setConceptIdx(i); setStep('method'); }} /></div>
        </div>
      ) : null}

      {step === 'method' || step === 'answer' ? (
        <div className="mt-6">
          <div className="at-font-display inline-flex items-center gap-1.5 text-sm font-bold" style={{ color: 'var(--ink)' }}><Target size={14} /> Which approach fits?</div>
          <div className="mt-3"><MCQGroup options={methodOptions} selectedIndex={methodIdx} disabled={step !== 'method'} onSelect={(i) => { setMethodIdx(i); setStep('answer'); }} /></div>
        </div>
      ) : null}

      {step === 'answer' ? (
        <div className="at-structure-panel at-screen-enter mt-6 rounded-lg p-5">
          <p className="at-font-body text-base" style={{ color: 'var(--chalk)' }}>{question.askText}</p>
          <div className="mt-4"><NumericField value={answer} onChange={setAnswer} unit={question.answerUnit} onSubmit={submitFinal} autoFocus /></div>
          <div className="mt-4"><PrimaryButton onClick={submitFinal} disabled={!answer} icon={ArrowRight}>Submit answer</PrimaryButton></div>
        </div>
      ) : null}
    </ChallengeShell>
  );
}

function DiagnosisScreen({ topicId, answers, classification, onSeeBridge }) {
  const copy = DIAGNOSIS_COPY[classification];
  const rows = diagnosisRows(answers.conceptCorrect, answers.methodCorrect, answers.numericCorrect);
  return (
    <ChallengeShell step="bridge" eyebrow="Diagnosis">
      <div className="flex items-center gap-2">
        <AlertCircle size={18} style={{ color: 'var(--marigold-deep)' }} />
        <h2 className="at-font-display text-lg font-bold" style={{ color: 'var(--ink)' }}>{copy.headline(TOPIC_NAME[topicId])}</h2>
      </div>
      <div className="at-structure-panel mt-5 rounded-lg p-5">
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.label} className="at-pin flex items-center justify-between border-b pb-3 last:border-0 last:pb-0" style={{ borderColor: 'var(--structure-line)' }}>
              <span className="at-font-body text-sm" style={{ color: 'var(--chalk-soft)' }}>{r.label}</span>
              <DiagnosisMark state={r.state} />
            </div>
          ))}
        </div>
      </div>
      <p className="at-font-body mt-5 text-base leading-relaxed" style={{ color: 'var(--ink)' }}>{copy.body(TOPIC_NAME[topicId])}</p>
      <div className="mt-6"><PrimaryButton onClick={onSeeBridge} icon={Lightbulb}>Show me the bridge</PrimaryButton></div>
    </ChallengeShell>
  );
}

function CalcOnlyScreen({ topicId, question, onContinue }) {
  return (
    <ChallengeShell step="bridge" eyebrow="Diagnosis">
      <div className="flex items-center gap-2">
        <CheckCircle2 size={18} style={{ color: 'var(--pine)' }} />
        <h2 className="at-font-display text-lg font-bold" style={{ color: 'var(--ink)' }}>{DIAGNOSIS_COPY.calc_only.headline(TOPIC_NAME[topicId])}</h2>
      </div>
      <p className="at-font-body mt-4 text-base leading-relaxed" style={{ color: 'var(--ink)' }}>{DIAGNOSIS_COPY.calc_only.body()}</p>
      <div className="at-paper-card mt-5 rounded-lg p-4">
        <Eyebrow>Correct working</Eyebrow>
        <ol className="at-font-body mt-2 list-decimal space-y-1 pl-5 text-sm" style={{ color: 'var(--ink-soft)' }}>
          {question.solutionSteps.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
      </div>
      <div className="mt-6"><PrimaryButton onClick={onContinue} icon={ArrowRight}>Try one more, cleanly</PrimaryButton></div>
    </ChallengeShell>
  );
}

function BridgeScreen({ bridge, onContinue }) {
  const [revealed, setRevealed] = useState(-1);
  return (
    <ChallengeShell step="bridge" eyebrow="Micro-bridge">
      <div className="flex items-center gap-2">
        <Lightbulb size={18} style={{ color: 'var(--marigold-deep)' }} />
        <h2 className="at-font-display text-lg font-bold" style={{ color: 'var(--ink)' }}>{bridge.bridgeTitle}</h2>
        {bridge.source === 'ai' ? <AILiveBadge /> : null}
      </div>
      <p className="at-font-body mt-4 text-base leading-relaxed" style={{ color: 'var(--ink)' }}>{bridge.bridgeExplanation}</p>
      <div className="at-structure-panel mt-5 rounded-lg p-5">
        <Eyebrow>Hints, if you want them</Eyebrow>
        <div className="mt-3 space-y-2">
          {bridge.hints.map((h, i) => (
            <div key={i}>
              {i <= revealed ? (
                <p className="at-pin at-font-body text-sm" style={{ color: 'var(--chalk)' }}>Hint {i + 1}. {h}</p>
              ) : (
                <button onClick={() => setRevealed(i)} className="at-font-display text-xs font-bold uppercase" style={{ color: 'var(--chalk-soft)', letterSpacing: '0.04em' }}>
                  Reveal hint {i + 1}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-6"><PrimaryButton onClick={onContinue} icon={ArrowRight}>{bridge.guided ? 'Try a guided question' : 'Try an independent question'}</PrimaryButton></div>
    </ChallengeShell>
  );
}

function GuidedApplicationScreen({ topicId, guided, onComplete }) {
  const [methodIdx, setMethodIdx] = useState(null);
  const [answer, setAnswer] = useState('');
  const methodOptions = useMemo(() => pickMethodOptions(topicId, guided.method), [guided, topicId]);

  function submit() {
    if (!answer) return;
    const methodChoice = methodIdx !== null ? methodOptions[methodIdx] : null;
    onComplete({
      methodChoice,
      methodCorrect: !!(methodChoice && methodChoice.correct),
      numericAnswer: answer,
      numericCorrect: isNumericCorrect(answer, guided.correctAnswer, guided.tolerance),
    });
  }

  return (
    <ChallengeShell step="bridge" eyebrow="Guided application">
      <PillBadge tone="marigold" icon={BookOpen}>Concept given: {TOPIC_NAME[topicId]}</PillBadge>
      <p className="at-font-body mt-4 text-lg leading-relaxed" style={{ color: 'var(--ink)' }}>{guided.scenarioText}</p>
      <div className="mt-6">
        <div className="at-font-display inline-flex items-center gap-1.5 text-sm font-bold" style={{ color: 'var(--ink)' }}><Target size={14} /> Which approach fits?</div>
        <div className="mt-3"><MCQGroup options={methodOptions} selectedIndex={methodIdx} disabled={methodIdx !== null} onSelect={setMethodIdx} /></div>
      </div>
      {methodIdx !== null ? (
        <div className="at-structure-panel at-screen-enter mt-6 rounded-lg p-5">
          <p className="at-font-body text-base" style={{ color: 'var(--chalk)' }}>{guided.askText}</p>
          <div className="mt-4"><NumericField value={answer} onChange={setAnswer} unit={guided.answerUnit} onSubmit={submit} autoFocus /></div>
          <div className="mt-4"><PrimaryButton onClick={submit} disabled={!answer} icon={ArrowRight}>Submit</PrimaryButton></div>
        </div>
      ) : null}
    </ChallengeShell>
  );
}

function CrossContextPromptScreen({ onContinue }) {
  return (
    <ChallengeShell step="bridge" eyebrow="Nice work">
      <div className="flex items-center gap-2">
        <Trophy size={18} style={{ color: 'var(--pine)' }} />
        <h2 className="at-font-display text-lg font-bold" style={{ color: 'var(--ink)' }}>That's one successful transfer.</h2>
      </div>
      <p className="at-font-body mt-4 text-base leading-relaxed" style={{ color: 'var(--ink)' }}>
        One right answer on an unfamiliar question is a good sign, not proof. ACEAPT confirms transfer across more than one context before calling it strong — let's see if it holds in a completely different setting.
      </p>
      <div className="mt-6"><PrimaryButton onClick={onContinue} icon={ArrowRight}>Try a different context</PrimaryButton></div>
    </ChallengeShell>
  );
}

function ContextResultCard({ label, contextName, classification }) {
  const success = classification === 'transfer_success';
  return (
    <div className="at-paper-card rounded-lg p-4">
      <div className="at-font-display text-xs font-bold uppercase" style={{ color: 'var(--ink-soft)', letterSpacing: '0.04em' }}>{label}</div>
      <div className="at-font-body mt-1 text-sm font-semibold" style={{ color: 'var(--ink)' }}>{contextName || '—'}</div>
      <div className="mt-2">
        {success ? <PillBadge tone="pine" icon={CheckCircle2}>Transferred</PillBadge> : <PillBadge tone="brick" icon={XCircle}>{(DIAGNOSIS_COPY[classification] && DIAGNOSIS_COPY[classification].label) || 'Gap found'}</PillBadge>}
      </div>
    </div>
  );
}

function ResultScreen({ session, onSeeProfile }) {
  const overallSuccess = session.classification2 === 'transfer_success';
  return (
    <ChallengeShell step="result" eyebrow="Verification">
      <div className="flex items-center gap-2">
        {overallSuccess ? <Trophy size={20} style={{ color: 'var(--pine)' }} /> : <RefreshCw size={20} style={{ color: 'var(--marigold-deep)' }} />}
        <h2 className="at-font-display text-xl font-bold" style={{ color: 'var(--ink)' }}>
          {overallSuccess ? 'Transfer confirmed in an independent context.' : "Not quite there yet — and now we know exactly why."}
        </h2>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <ContextResultCard label="Context A" contextName={session.novel1 && session.novel1.context} classification={session.classification1} />
        <ContextResultCard label="Context B" contextName={session.novel2 && session.novel2.context} classification={session.classification2} />
      </div>
      <p className="at-font-body mt-5 text-base leading-relaxed" style={{ color: 'var(--ink)' }}>
        {overallSuccess
          ? `You identified the concept, picked the right method, and solved it correctly in a second, unrelated setting. That's the evidence ACEAPT needed to move this topic forward.`
          : `The second attempt still shows the same kind of gap. That's useful — it means the gap is real and specific, not a one-off slip, and ACEAPT will keep targeting it rather than assuming the topic needs a full restart.`}
      </p>
      <div className="mt-6"><PrimaryButton onClick={onSeeProfile} icon={ArrowRight}>See updated profile</PrimaryButton></div>
    </ChallengeShell>
  );
}

function SignalCard({ icon: Icon, title, body, endpointNote }) {
  return (
    <div className="at-structure-panel rounded-lg p-4">
      <div className="flex items-center gap-2">
        <Icon size={16} style={{ color: 'var(--chalk)' }} />
        <span className="at-font-display text-sm font-bold" style={{ color: 'var(--chalk)' }}>{title}</span>
      </div>
      <p className="at-font-body mt-2 text-sm" style={{ color: 'var(--chalk-soft)' }}>{body}</p>
      <div className="at-font-display mt-2 flex items-center gap-1 text-xs" style={{ color: 'var(--chalk-soft)' }}>
        <Link2 size={11} /> {endpointNote}
      </div>
    </div>
  );
}

function CapabilityUpdateScreen({ topicId, prevProfile, updatedProfile, onDone }) {
  return (
    <div className="at-screen-enter mx-auto max-w-2xl px-6 py-10">
      <Eyebrow>Capability updated</Eyebrow>
      <h1 className="at-font-display mt-2 text-2xl font-bold" style={{ color: 'var(--ink)' }}>{TOPIC_NAME[topicId]}</h1>

      <div className="at-paper-card mt-5 rounded-lg p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="at-font-display text-lg font-bold" style={{ color: 'var(--ink-soft)' }}>{prevProfile.transferState}</span>
          <ArrowRight size={18} style={{ color: 'var(--marigold)' }} />
          <span className="at-font-display text-lg font-bold" style={{ color: 'var(--marigold-deep)' }}>{updatedProfile.transferState}</span>
        </div>
        <div className="mt-4 space-y-3">
          <RulerBar label="Familiar" value={updatedProfile.familiarPct} tone="ink" />
          <RulerBar label="Novel" value={updatedProfile.novelPct} tone="marigold" />
        </div>
        <div className="at-font-body mt-4 text-xs" style={{ color: 'var(--ink-soft)' }}>
          Confidence: {updatedProfile.confidence} · {updatedProfile.evidenceCount} validated challenges · {updatedProfile.contexts.length} contexts
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <SignalCard icon={Layers} title="Pathfinder" body={`Recommendation queued: novel application practice for ${TOPIC_NAME[topicId]}.`} endpointNote={CONFIG.PATHFINDER_ENDPOINT || 'not yet connected — see Integration notes'} />
        <SignalCard icon={GraduationCap} title="Proof" body={`Evidence logged: familiar mastery confirmed, transfer now ${updatedProfile.transferState.toLowerCase()}.`} endpointNote={CONFIG.PROOF_ENDPOINT || 'not yet connected — see Integration notes'} />
      </div>

      <div className="mt-6"><PrimaryButton onClick={onDone} icon={CheckCircle2}>Back to transfer profile</PrimaryButton></div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ERROR BOUNDARY — a broken step never blanks the whole app.
// ---------------------------------------------------------------------------
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error) {
    console.error('ACEAPT Transfer: error boundary caught', error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto max-w-md px-6 py-16 text-center">
          <AlertCircle size={28} style={{ color: 'var(--brick)' }} className="mx-auto" />
          <h2 className="at-font-display mt-3 text-lg font-bold" style={{ color: 'var(--ink)' }}>That step didn't load.</h2>
          <p className="at-font-body mt-2 text-sm" style={{ color: 'var(--ink-soft)' }}>Nothing was lost — go back and pick up from the profile.</p>
          <div className="mt-4 flex justify-center">
            <PrimaryButton onClick={() => { this.setState({ hasError: false }); this.props.onReset(); }} icon={RefreshCw}>Back to profile</PrimaryButton>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// MAIN APP
// ---------------------------------------------------------------------------
export default function ACEAPTTransferApp() {
  const [screen, setScreen] = useState('loading');
  const [profiles, setProfiles] = useState({});
  const [session, setSession] = useState(emptySession());
  const [lastUpdate, setLastUpdate] = useState(null);
  const [busy, setBusy] = useState(false);
  const [busyMessage, setBusyMessage] = useState('');
  const [notesOpen, setNotesOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&display=swap';
    document.head.appendChild(link);
    (async () => {
      const loaded = await loadAllProfiles();
      if (!cancelled) {
        setProfiles(loaded);
        setScreen('dashboard');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function handleSelectTopic(topicId) {
    const profile = profiles[topicId];
    setSession({ ...emptySession(), topicId, level: (profile && profile.currentLevel) || 4 });
    setScreen('topicDetail');
  }

  function handleFamiliarComplete(familiarResult) {
    const next = { ...session, familiar: familiarResult };
    setSession(next);
    runGenerateNovel1(next);
  }

  async function runGenerateNovel1(curSession) {
    setBusy(true);
    setBusyMessage('Designing a novel scenario…');
    try {
      const q = await generateNovelQuestion({ topicId: curSession.topicId, level: curSession.level, avoidContexts: [], avoidKeywords: TOPIC_AVOID_KEYWORDS[curSession.topicId] || [] });
      const next = { ...curSession, novel1: q };
      setSession(next);
      setScreen('novel1');
    } finally {
      setBusy(false);
    }
  }

  function handleNovel1Complete(answers) {
    const classification = classifyAttempt(answers.conceptCorrect, answers.methodCorrect, answers.numericCorrect);
    const next = { ...session, novel1Answers: answers, classification1: classification };
    setSession(next);
    if (classification === 'transfer_success') setScreen('crossContext');
    else if (classification === 'calc_only') setScreen('calcOnly');
    else setScreen('diagnosis');
  }

  function handleProceedToBridge() {
    runGenerateBridge(session);
  }

  async function runGenerateBridge(curSession) {
    setBusy(true);
    setBusyMessage('Building your micro-bridge…');
    try {
      const q = curSession.novel1;
      const a = curSession.novel1Answers;
      const bridge = await generateBridge({
        topicId: curSession.topicId,
        gapType: curSession.classification1,
        scenarioText: q.scenarioText,
        askText: q.askText,
        correctMethod: q.method,
        chosenMethodLabel: (a.methodChoice && a.methodChoice.label) || 'an unlisted approach',
        correctAnswer: q.correctAnswer,
      });
      const next = { ...curSession, bridge };
      setSession(next);
      setScreen('bridge');
    } finally {
      setBusy(false);
    }
  }

  function handleBridgeAcknowledged() {
    if (session.bridge && session.bridge.guided) setScreen('guided');
    else runGenerateNovel2(session);
  }

  function handleGuidedComplete(guidedAnswers) {
    const next = { ...session, guidedAnswers };
    setSession(next);
    runGenerateNovel2(next);
  }

  function handleCalcOnlyContinue() {
    runGenerateNovel2(session);
  }

  function handleCrossContextContinue() {
    runGenerateNovel2(session);
  }

  async function runGenerateNovel2(curSession) {
    setBusy(true);
    setBusyMessage('Finding a second, independent context…');
    try {
      const avoidContexts = [
        curSession.novel1 && curSession.novel1.context,
        curSession.bridge && curSession.bridge.guided && curSession.bridge.guided.context,
      ].filter(Boolean);
      const q = await generateNovelQuestion({ topicId: curSession.topicId, level: curSession.level, avoidContexts, avoidKeywords: TOPIC_AVOID_KEYWORDS[curSession.topicId] || [] });
      const next = { ...curSession, novel2: q };
      setSession(next);
      setScreen('novel2');
    } finally {
      setBusy(false);
    }
  }

  function handleNovel2Complete(answers) {
    const classification = classifyAttempt(answers.conceptCorrect, answers.methodCorrect, answers.numericCorrect);
    const next = { ...session, novel2Answers: answers, classification2: classification };
    setSession(next);
    setScreen('result');
  }

  async function handleSeeUpdatedProfile() {
    const curSession = session;
    const prevProfile = profiles[curSession.topicId];
    const updated = computeUpdatedProfile(prevProfile, {
      novel1Classification: curSession.classification1,
      novel2Classification: curSession.classification2,
      context1: curSession.novel1 && curSession.novel1.context,
      context2: curSession.novel2 && curSession.novel2.context,
      level: curSession.level,
    });
    setProfiles((p) => ({ ...p, [curSession.topicId]: updated }));
    setLastUpdate({ topicId: curSession.topicId, prev: prevProfile, updated });
    await saveProfile(curSession.topicId, updated);
    await appendEvidence(curSession.topicId, buildEvidenceRecords(curSession));
    setScreen('capabilityUpdate');
  }

  function handleReturnToDashboard() {
    setSession(emptySession());
    setLastUpdate(null);
    setScreen('dashboard');
  }

  function renderScreen() {
    if (screen === 'loading') return <LoadingOverlay message="Loading transfer profile…" />;
    if (screen === 'dashboard') return <Dashboard profiles={profiles} onSelectTopic={handleSelectTopic} onOpenNotes={() => setNotesOpen((v) => !v)} notesOpen={notesOpen} />;
    if (screen === 'institution') return <InstitutionView onBack={() => setScreen('dashboard')} />;
    if (screen === 'topicDetail') {
      if (!session.topicId || !profiles[session.topicId]) return <LoadingOverlay message="Loading topic…" />;
      return <TopicDetail topicId={session.topicId} profile={profiles[session.topicId]} onBack={() => setScreen('dashboard')} onBegin={() => setScreen('challengeIntro')} />;
    }
    if (screen === 'challengeIntro') return <ChallengeIntro topicId={session.topicId} onBack={() => setScreen('topicDetail')} onStart={() => setScreen('familiar')} />;
    if (screen === 'familiar') return <FamiliarQuestionScreen topicId={session.topicId} onComplete={handleFamiliarComplete} />;
    if (screen === 'novel1') {
      if (!session.novel1) return <LoadingOverlay message="Designing a novel scenario…" />;
      return <NovelQuestionScreen key="novel1" questionNumber={1} topicId={session.topicId} question={session.novel1} onComplete={handleNovel1Complete} />;
    }
    if (screen === 'diagnosis') {
      if (!session.novel1Answers) return <LoadingOverlay message="Loading diagnosis…" />;
      return <DiagnosisScreen topicId={session.topicId} answers={session.novel1Answers} classification={session.classification1} onSeeBridge={handleProceedToBridge} />;
    }
    if (screen === 'calcOnly') return <CalcOnlyScreen topicId={session.topicId} question={session.novel1} onContinue={handleCalcOnlyContinue} />;
    if (screen === 'crossContext') return <CrossContextPromptScreen onContinue={handleCrossContextContinue} />;
    if (screen === 'bridge') {
      if (!session.bridge) return <LoadingOverlay message="Building your micro-bridge…" />;
      return <BridgeScreen bridge={session.bridge} onContinue={handleBridgeAcknowledged} />;
    }
    if (screen === 'guided') {
      if (!session.bridge || !session.bridge.guided) return <LoadingOverlay message="Preparing guided practice…" />;
      return <GuidedApplicationScreen topicId={session.topicId} guided={session.bridge.guided} onComplete={handleGuidedComplete} />;
    }
    if (screen === 'novel2') {
      if (!session.novel2) return <LoadingOverlay message="Finding a second context…" />;
      return <NovelQuestionScreen key="novel2" questionNumber={2} topicId={session.topicId} question={session.novel2} onComplete={handleNovel2Complete} />;
    }
    if (screen === 'result') return <ResultScreen session={session} onSeeProfile={handleSeeUpdatedProfile} />;
    if (screen === 'capabilityUpdate') {
      if (!lastUpdate) return <LoadingOverlay message="Updating profile…" />;
      return <CapabilityUpdateScreen topicId={lastUpdate.topicId} prevProfile={lastUpdate.prev} updatedProfile={lastUpdate.updated} onDone={handleReturnToDashboard} />;
    }
    return <Dashboard profiles={profiles} onSelectTopic={handleSelectTopic} onOpenNotes={() => setNotesOpen((v) => !v)} notesOpen={notesOpen} />;
  }

  return (
    <div className="at-root min-h-screen">
      <GlobalStyles />
      <TopBar screen={screen} onDashboard={handleReturnToDashboard} onInstitution={() => setScreen('institution')} />
      <ErrorBoundary onReset={handleReturnToDashboard}>
        {busy ? <LoadingOverlay message={busyMessage} /> : renderScreen()}
      </ErrorBoundary>
    </div>
  );
}
