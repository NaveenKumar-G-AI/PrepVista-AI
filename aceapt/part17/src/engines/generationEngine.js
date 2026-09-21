// Generation Engine (Section 9, 10, 45).
//
// Section 9 is explicit: build the specification FIRST, generate second.
// NEVER generate-then-invent-metadata-afterward. buildSpec() below is that
// specification step; generate() and its helpers only ever fill in a spec
// that already exists.
//
// Section 45 draws the AI/deterministic boundary: the LLM may write stems,
// options, explanations and variants. It is never the source of truth for
// structured student state — this file only ever returns question content,
// never touches skillState/journey/mastery directly.
//
// Section 57 failure handling: if the LLM is unavailable or fails, this
// engine has a deterministic template path so generation degrades instead
// of breaking. If ANTHROPIC_API_KEY is unset (the default — see
// .env.example), GENERATION_MODE=auto transparently runs template-only.

const { randomUUID } = require('crypto');
const { humanizeTopic } = require('../utils/text');

function buildSpec({ skillId, purpose, difficultyTarget, skillState }) {
  return {
    id: `spec-${randomUUID()}`,
    skillId,
    purpose,
    difficultyTarget,
    targetMisconception: pickTargetMisconception(skillState),
    expectedTimeSeconds: difficultyTarget.maxExpectedTimeSeconds || 75,
    questionType: 'MCQ',
    requireExplanation: true,
    createdAt: Date.now(),
  };
}

function pickTargetMisconception(skillState) {
  const entries = Object.entries(skillState?.misconceptions || {});
  if (entries.length === 0) return null;
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

async function generate(spec) {
  const mode = (process.env.GENERATION_MODE || 'auto').toLowerCase();

  if (mode === 'bank_only') return null;

  if (mode !== 'template' && process.env.ANTHROPIC_API_KEY) {
    try {
      return await generateWithLLM(spec);
    } catch (e) {
      console.warn('[generationEngine] LLM generation failed, falling back to template:', e.message);
    }
  }

  return generateFromTemplate(spec);
}

async function generateWithLLM(spec) {
  const prompt = buildPrompt(spec);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.LLM_MODEL || 'claude-sonnet-4-6',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(`LLM request failed: ${res.status}`);
  const data = await res.json();
  const text = (data.content || []).map((b) => b.text || '').join('');
  const jsonStr = text.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(jsonStr);
  return normalizeGenerated(parsed, spec, 'llm');
}

function buildPrompt(spec) {
  return `You are a strict aptitude-question generator for an Indian placement-exam prep platform.
Return ONLY valid JSON (no markdown fences, no commentary) matching this shape:
{
 "stem": string,
 "options": [{"id":"A","text":string,"correct":boolean,"misconceptionTag":string|null}, ... exactly 4],
 "explanation": string
}
Requirements:
- Skill: ${spec.skillId}
- Purpose: ${spec.purpose}
- Target difficulty profile: ${JSON.stringify(spec.difficultyTarget)}
- Target misconception to embed in a distractor (if applicable): ${spec.targetMisconception || 'none specified'}
- Exactly one option must have "correct": true.
- Each distractor must map to a plausible, realistic misconception, not a random wrong number.
- The question should be solvable without a calculator in about ${spec.expectedTimeSeconds} seconds.`;
}

// ---------------------------------------------------------------------------
// Deterministic template path. Only one micro-skill has a template today —
// this is intentionally narrow rather than pretending to cover the whole
// bank; anything else falls through to selectRelaxed() in the orchestrator,
// which is the honest behavior per Section 57.
// ---------------------------------------------------------------------------

function generateFromTemplate(spec) {
  if (spec.skillId === 'successive-percentage-change') {
    return templateSuccessivePercentage(spec);
  }
  return null;
}

function templateSuccessivePercentage(spec) {
  const choices = [10, 15, 20, 25, 30];
  const upPct = choices[Math.floor(Math.random() * choices.length)];
  const downPct = choices[Math.floor(Math.random() * choices.length)];

  const multiplier = (1 + upPct / 100) * (1 - downPct / 100);
  const netPct = Math.round((multiplier - 1) * 1000) / 10;
  const correctText = netPct === 0 ? 'No change (0%)' : netPct > 0 ? `${netPct}% increase` : `${Math.abs(netPct)}% decrease`;

  const naive = upPct - downPct;
  const naiveText = naive === 0 ? 'No change (0%)' : naive > 0 ? `${naive}% increase` : `${Math.abs(naive)}% decrease`;
  const added = upPct + downPct;

  const options = [
    { id: 'A', text: correctText, correct: true, misconceptionTag: null },
    { id: 'B', text: naiveText, correct: false, misconceptionTag: 'naive_percentage_subtraction' },
    { id: 'C', text: `${added}% increase`, correct: false, misconceptionTag: 'added_percentages_instead_of_multiplying' },
    { id: 'D', text: `${Math.round(upPct * 0.9)}% increase`, correct: false, misconceptionTag: 'arithmetic_error' },
  ];

  // Guarantee textual uniqueness even if a random draw collides.
  const seen = new Set();
  options.forEach((o) => {
    while (seen.has(o.text)) o.text += ' (approx)';
    seen.add(o.text);
  });

  return normalizeGenerated(
    {
      stem: `A price is increased by ${upPct}%, then decreased by ${downPct}% on the new price. What is the overall percentage change from the original price?`,
      options,
      explanation: `Multiply the successive factors: (1 + ${upPct}/100) × (1 − ${downPct}/100) = ${multiplier.toFixed(3)}, a net change of ${correctText}. Adding or subtracting the percentages directly ignores that the second change applies to a different base.`,
    },
    spec,
    'template'
  );
}

function normalizeGenerated(parsed, spec, mode) {
  return {
    id: `gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    subject: 'Quantitative Aptitude',
    topic: humanizeTopic(spec.skillId),
    microSkill: spec.skillId,
    prerequisites: [],
    questionType: spec.questionType || 'MCQ',
    cognitiveDemand: 'application',
    strategyRequired: spec.skillId,
    difficulty: {
      concept: spec.difficultyTarget.concept || 'medium',
      strategy: spec.difficultyTarget.strategy || 'medium',
      calculation: spec.difficultyTarget.calculation || 'medium',
      reading: spec.difficultyTarget.reading || 'medium',
      expectedTimeSeconds: spec.expectedTimeSeconds,
      transferDistance: spec.difficultyTarget.transferDistance || 'near',
    },
    commonMisconceptions: (parsed.options || []).filter((o) => o.misconceptionTag).map((o) => o.misconceptionTag),
    primaryPurpose: spec.purpose,
    purposeTags: [spec.purpose],
    transferLevel: spec.difficultyTarget.transferDistance || 'near',
    examRelevance: ['placement'],
    validationState: mode === 'template' ? 'auto_verified' : 'auto_generated_unverified',
    quality: { flags: [], usageCount: 0 },
    stem: parsed.stem,
    options: parsed.options,
    explanation: parsed.explanation,
    generation: { mode, specId: spec.id },
  };
}

module.exports = { buildSpec, generate };
