const aiClient = require('./aiClient');

const QUESTION_TYPES = [
  { key: 'why_company', label: 'Why this company?' },
  { key: 'why_role', label: 'Why this role?' },
  { key: 'why_suitable', label: 'Why are you suitable?' },
  { key: 'tell_me_about_yourself', label: 'Tell me about yourself' },
  { key: 'relevant_project', label: 'Relevant project' },
  { key: 'technical_experience', label: 'Technical experience' },
  { key: 'career_goals', label: 'Career goals' },
];

const TEMPLATES = {
  why_company: (c) => `I'm interested in ${c.company || 'this company'} because of the chance to work on ${c.role ? `${c.role.toLowerCase()} problems` : 'problems I care about'} on a team building products in ${c.industry || 'this space'}. [Add one specific detail you learned about the company here.]`,
  why_role: (c) => `This ${c.role || 'role'} lines up directly with my focus on ${(c.emphasize || []).slice(0, 2).join(' and ') || 'the skills I have been building'}, and it's a natural next step from ${c.bestProjectName ? `the work I did on ${c.bestProjectName}` : 'my recent project work'}.`,
  why_suitable: (c) => [c.positioningStatement, c.bestProjectReason].filter(Boolean).join(' '),
  tell_me_about_yourself: (c) => `I'm a ${c.targetRole || 'student'} focused on ${(c.emphasize || []).slice(0, 3).join(', ') || 'building practical projects'}.${c.bestProjectName ? ` Most recently I worked on ${c.bestProjectName}, where I applied these skills directly.` : ''}`,
  relevant_project: (c) => (c.bestProjectName ? `${c.bestProjectName} is my strongest relevant project -- ${c.bestProjectReason || 'it maps closely to this role\'s core requirements.'}` : 'Add a project to your profile so this answer can reference real work.'),
  technical_experience: (c) => `My technical experience centers on ${(c.emphasize || []).join(', ') || 'the skills in my profile'}, developed mainly through ${c.bestProjectName ? `projects like ${c.bestProjectName}` : 'coursework and independent projects'}.`,
  career_goals: (c) => `I'm working toward ${c.careerDirection || c.targetRole || 'a role where I can keep building on this experience'}, and this position is a strong next step in that direction.`,
};

// Defense-in-depth: even AI-drafted text is scanned for specific numeric /
// scale claims that can't be traced to recorded evidence, per spec section 32.
// This is a heuristic pass, not a guarantee -- flagged text is surfaced to the
// student to verify or edit, never silently published.
const CLAIM_PATTERNS = [
  /\b\d{2,}[,.]?\d*\+?\s?(users|customers|downloads|requests|transactions|clients|people)\b/i,
  /\b\d+%\s?(increase|improvement|reduction|growth|faster|more efficient)\b/i,
  /\b(built|led|managed|scaled|shipped|launched)\b.{0,40}\b(production|enterprise|company[- ]wide|nationwide)\b/i,
  /[$₹]\s?\d[\d,]*\s?(revenue|savings|budget|funding|k\b)/i,
];

function checkClaimSafety(text, evidenceList) {
  if (!text) return [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  const evidenceText = evidenceList.map((e) => `${e.skill} ${e.description || ''}`).join(' ').toLowerCase();
  const flagged = [];

  for (const s of sentences) {
    for (const pattern of CLAIM_PATTERNS) {
      const match = s.match(pattern);
      if (!match) continue;

      const claimNumbers = (match[0].match(/\d[\d,]*/g) || []).map((n) => n.replace(/,/g, ''));
      let grounded;
      if (claimNumbers.length > 0) {
        // Ground on the specific number itself -- a generic shared verb like
        // "built" isn't enough to clear a fabricated statistic.
        grounded = claimNumbers.some((n) => evidenceText.includes(n));
      } else {
        // No number in this claim (e.g. "shipped a production system") --
        // ground on the scale keyword actually appearing in evidence text.
        const scaleWord = (match[0].match(/production|enterprise|company[- ]wide|nationwide/i) || [])[0];
        grounded = scaleWord ? evidenceText.includes(scaleWord.toLowerCase()) : false;
      }

      if (!grounded) {
        flagged.push({
          sentence: s.trim(),
          reason: "This includes a specific number or scale claim that isn't traceable to your recorded evidence. Verify it's accurate, or edit it, before using it.",
        });
      }
      break;
    }
  }
  return flagged;
}

async function draftAnswer({ questionType, ctx, evidenceList }) {
  const templateFn = TEMPLATES[questionType];
  if (!templateFn) throw new Error(`Unknown question type: ${questionType}`);

  let text = templateFn(ctx).trim();
  let method = 'DETERMINISTIC';

  if (aiClient.isAvailable()) {
    try {
      const facts = evidenceList.map((e) => `${e.skill}: ${e.description || e.evidence_type} (${e.strength})`);
      const system = [
        'Draft a concise, natural first-person answer (3-5 sentences) to a student job-application question.',
        'Only reference the facts and context provided. Never invent numbers, employers, outcomes, or achievements not present in them.',
        'If the facts are thin, write a shorter, honest answer rather than padding it with invented detail.',
        'Return JSON: {"answer": string}',
      ].join(' ');
      const user = `Question: ${QUESTION_TYPES.find((q) => q.key === questionType)?.label}\nFacts on file: ${JSON.stringify(facts)}\nContext: ${JSON.stringify(ctx)}`;
      const ai = await aiClient.completeJSON({ system, user, maxTokens: 400 });
      if (ai.answer && typeof ai.answer === 'string') {
        text = ai.answer.trim();
        method = 'AI_ENHANCED';
      }
    } catch {
      // keep deterministic draft
    }
  }

  return { text, method, flagged_claims: checkClaimSafety(text, evidenceList) };
}

async function draftRecruiterMessage({ ctx, evidenceList }) {
  let text = `Hi, I'm ${ctx.studentName || 'a candidate'} -- I just applied for the ${ctx.role || 'open role'} at ${ctx.company || 'your team'}. My background is in ${(ctx.emphasize || []).slice(0, 3).join(', ') || 'related coursework and projects'}${ctx.bestProjectName ? `, most recently through ${ctx.bestProjectName}` : ''}. Happy to share more detail whenever useful -- thank you for considering my application.`;
  let method = 'DETERMINISTIC';

  if (aiClient.isAvailable()) {
    try {
      const facts = evidenceList.map((e) => `${e.skill}: ${e.description || e.evidence_type} (${e.strength})`);
      const system = [
        'Draft a short (3-4 sentence), specific, non-generic message a student can send to a recruiter after applying.',
        'Avoid generic AI-sounding filler ("I am excited to leverage my skills..."). Be direct and concrete.',
        'Only reference the facts and context provided. Never invent achievements or numbers.',
        'Return JSON: {"message": string}',
      ].join(' ');
      const user = `Facts on file: ${JSON.stringify(facts)}\nContext: ${JSON.stringify(ctx)}`;
      const ai = await aiClient.completeJSON({ system, user, maxTokens: 250 });
      if (ai.message && typeof ai.message === 'string') {
        text = ai.message.trim();
        method = 'AI_ENHANCED';
      }
    } catch {
      // keep deterministic draft
    }
  }

  return { text, method, flagged_claims: checkClaimSafety(text, evidenceList) };
}

module.exports = { QUESTION_TYPES, draftAnswer, draftRecruiterMessage, checkClaimSafety };
