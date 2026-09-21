const { extractSkillsFromText } = require('./skillsDictionary');
const aiClient = require('./aiClient');

const SENIORITY_TERMS = [
  ['intern', 'Intern'], ['internship', 'Intern'],
  ['entry level', 'Entry Level'], ['entry-level', 'Entry Level'], ['fresher', 'Entry Level'],
  ['junior', 'Junior'], ['associate', 'Associate'],
  ['mid level', 'Mid Level'], ['mid-level', 'Mid Level'],
  ['senior', 'Senior'], ['sr.', 'Senior'],
  ['lead', 'Lead'], ['staff', 'Staff'], ['principal', 'Principal'], ['manager', 'Manager'],
];

const MUST_SIGNALS = ['must have', 'must-have', 'required', 'requirement', 'minimum qualification', 'you have', 'you should have', 'need to have'];
const PREFERRED_SIGNALS = ['preferred', 'nice to have', 'nice-to-have', 'bonus', 'plus if', 'a plus', 'good to have', 'added advantage'];

const SECTION_HEADERS = {
  requirements: /^(requirements?|qualifications?|must[- ]have|what you.?ll need|skills? required|minimum qualifications?)\s*:?\s*$/i,
  preferred: /^(preferred|nice to have|good to have|bonus|added advantage)\s*(qualifications?|skills?)?\s*:?\s*$/i,
  responsibilities: /^(responsibilities|what you.?ll do|role overview|key responsibilities|about the role)\s*:?\s*$/i,
  benefits: /^(benefits|perks|what we offer|compensation( and benefits)?)\s*:?\s*$/i,
  about: /^(about (the )?(company|us|role)|company overview|who we are)\s*:?\s*$/i,
};

function splitBullets(block) {
  return block
    .split(/\n|(?<=[.;])\s+(?=[A-Z0-9])/)
    .map((l) => l.replace(/^[\s\-•*▪●○\u2022]+/, '').trim())
    .filter((l) => l.length > 3);
}

function classifyCategory(bulletText, currentSection) {
  const lower = bulletText.toLowerCase();
  if (PREFERRED_SIGNALS.some((s) => lower.includes(s))) return 'PREFERRED';
  if (MUST_SIGNALS.some((s) => lower.includes(s))) return 'MUST_HAVE';
  if (currentSection === 'preferred') return 'PREFERRED';
  if (currentSection === 'requirements') return 'MUST_HAVE';
  return 'MUST_HAVE';
}

function guessReqType(text) {
  const lower = text.toLowerCase();
  if (/\b\d+\+?\s*(years?|yrs?)\b/.test(lower)) return 'EXPERIENCE';
  if (/(bachelor|master|b\.?tech|m\.?tech|b\.?sc|m\.?sc|degree|diploma|graduate)/.test(lower)) return 'EDUCATION';
  if (extractSkillsFromText(text).length > 0) return 'SKILL';
  return 'OTHER';
}

function guessPriority(category, reqType) {
  if (category === 'MUST_HAVE' && reqType === 'SKILL') return 'CRITICAL';
  if (category === 'MUST_HAVE') return 'IMPORTANT';
  if (category === 'PREFERRED' && reqType === 'SKILL') return 'SUPPORTING';
  if (category === 'PREFERRED') return 'OPTIONAL';
  return 'UNKNOWN';
}

function explainPriority(priority, category) {
  switch (priority) {
    case 'CRITICAL': return `Listed as a ${category === 'MUST_HAVE' ? 'must-have' : 'requirement'} skill.`;
    case 'IMPORTANT': return 'Listed as a required qualification.';
    case 'SUPPORTING': return 'Listed as a preferred skill -- strengthens an application but is not required.';
    case 'OPTIONAL': return 'Listed as a nice-to-have.';
    default: return 'Priority could not be determined from the posting text.';
  }
}

function guessWorkMode(text) {
  const lower = text.toLowerCase();
  if (/\bhybrid\b/.test(lower)) return 'HYBRID';
  if (/\bremote\b|work from home|\bwfh\b/.test(lower)) return 'REMOTE';
  if (/\bon[- ]?site\b|in[- ]?office/.test(lower)) return 'ONSITE';
  return 'UNKNOWN';
}

function guessSeniority(text) {
  const lower = text.toLowerCase();
  for (const [term, label] of SENIORITY_TERMS) {
    if (lower.includes(term)) return label;
  }
  return 'UNKNOWN';
}

function guessLocation(text) {
  const line = text.split('\n').find((l) => /location\s*:/i.test(l));
  if (line) return line.split(/location\s*:/i)[1].trim().slice(0, 120);
  return null;
}

function guessCompensation(text) {
  const patterns = [
    /(?:₹|rs\.?|inr)\s?[\d,.]+\s?(?:-|to)\s?(?:₹|rs\.?|inr)?\s?[\d,.]+\s?(?:lpa|lakhs?|per annum|\/yr|\/year)?/i,
    /[\d.]+\s?-\s?[\d.]+\s?lpa/i,
    /\$\s?[\d,.]+\s?(?:k)?\s?(?:-|to)\s?\$?\s?[\d,.]+\s?(?:k)?(?:\s?\/?\s?(?:yr|year|month))?/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[0].trim();
  }
  return null;
}

function guessDeadline(text) {
  const line = text.split('\n').find((l) => /(deadline|apply by|closing date)\s*:?/i.test(l));
  if (line) {
    const m = line.match(/deadline|apply by|closing date\s*:?\s*(.+)/i);
    return line.split(/:/).slice(1).join(':').trim().slice(0, 60) || null;
  }
  return null;
}

function detectSection(line) {
  for (const [key, regex] of Object.entries(SECTION_HEADERS)) {
    if (regex.test(line.trim())) return key;
  }
  return null;
}

// Deterministic parser -- always available, always used unless AI enhancement
// succeeds. This is the fallback of record and is what makes matching
// explainable (see matchingEngine.js): no keyword is ever silently upgraded
// to "capability" by an opaque model.
function parseDeterministic(rawText) {
  const text = String(rawText || '').replace(/\r\n/g, '\n');
  const lines = text.split('\n').map((l) => l.trim());

  let currentSection = null;
  const sectionBlocks = { requirements: [], preferred: [], responsibilities: [], other: [] };

  for (const line of lines) {
    if (!line) continue;
    const detected = detectSection(line);
    if (detected) {
      currentSection = detected;
      continue;
    }
    const bucket = currentSection === 'preferred' ? 'preferred'
      : currentSection === 'requirements' ? 'requirements'
      : currentSection === 'responsibilities' ? 'responsibilities'
      : 'other';
    sectionBlocks[bucket].push(line);
  }

  const requirementLines = [
    ...sectionBlocks.requirements.map((l) => ({ text: l, section: 'requirements' })),
    ...sectionBlocks.preferred.map((l) => ({ text: l, section: 'preferred' })),
  ];

  // If the JD had no recognizable "Requirements" header at all, fall back to
  // scanning every line for skill mentions so we still extract something,
  // clearly marked lower-confidence via req extraction count downstream.
  if (requirementLines.length === 0) {
    for (const l of lines) {
      if (l && extractSkillsFromText(l).length > 0) {
        requirementLines.push({ text: l, section: 'requirements' });
      }
    }
  }

  const requirements = [];
  const seenText = new Set();
  let order = 0;
  for (const { text: blockText, section } of requirementLines) {
    for (const bullet of splitBullets(blockText)) {
      const key = bullet.toLowerCase();
      if (seenText.has(key) || bullet.length < 4) continue;
      seenText.add(key);

      const category = classifyCategory(bullet, section);
      const reqType = guessReqType(bullet);
      const priority = guessPriority(category, reqType);
      const skills = reqType === 'SKILL' ? extractSkillsFromText(bullet) : [];

      if (skills.length > 0) {
        for (const skill of skills) {
          requirements.push({
            requirement_text: bullet,
            category,
            priority,
            req_type: 'SKILL',
            skill_key: skill,
            explanation: explainPriority(priority, category),
            sort_order: order++,
          });
        }
      } else {
        requirements.push({
          requirement_text: bullet,
          category,
          priority,
          req_type: reqType,
          skill_key: null,
          explanation: explainPriority(priority, category),
          sort_order: order++,
        });
      }
    }
  }

  return {
    role_guess: lines.find((l) => l.length > 0 && l.length < 90) || null,
    seniority_guess: guessSeniority(text),
    work_mode_guess: guessWorkMode(text),
    location_guess: guessLocation(text),
    compensation_guess: guessCompensation(text),
    deadline_guess: guessDeadline(text),
    responsibilities: splitBullets(sectionBlocks.responsibilities.join('\n')).slice(0, 8),
    requirements,
    sections_detected: Object.entries(sectionBlocks).filter(([, v]) => v.length > 0).map(([k]) => k),
    method: 'DETERMINISTIC',
  };
}

async function enhanceWithAI(rawText, deterministicResult) {
  const system = [
    'You extract structured hiring requirements from a job posting for a student career platform.',
    'Only extract what is actually stated in the posting. Never invent requirements, numbers, or company facts.',
    'Classify each requirement as MUST_HAVE, PREFERRED, or NICE_TO_HAVE based on the posting\'s own language.',
    'For each requirement give req_type (SKILL, EXPERIENCE, EDUCATION, or OTHER) and, if SKILL, a short canonical skill_key.',
    'Return JSON: {"role_guess":string|null,"seniority_guess":string|null,"work_mode_guess":"REMOTE"|"HYBRID"|"ONSITE"|"UNKNOWN","location_guess":string|null,"compensation_guess":string|null,"deadline_guess":string|null,"responsibilities":string[],"requirements":[{"requirement_text":string,"category":"MUST_HAVE"|"PREFERRED"|"NICE_TO_HAVE","req_type":"SKILL"|"EXPERIENCE"|"EDUCATION"|"OTHER","skill_key":string|null}]}',
  ].join(' ');

  const user = `${aiClient.wrapUntrusted('job_description', rawText)}\n\nExtract the structured requirements as instructed.`;

  const ai = await aiClient.completeJSON({ system, user, maxTokens: 1500 });

  const requirements = (ai.requirements || []).map((r, i) => {
    const category = ['MUST_HAVE', 'PREFERRED', 'NICE_TO_HAVE'].includes(r.category) ? r.category : 'MUST_HAVE';
    const reqType = ['SKILL', 'EXPERIENCE', 'EDUCATION', 'OTHER'].includes(r.req_type) ? r.req_type : 'OTHER';
    const priority = guessPriority(category === 'NICE_TO_HAVE' ? 'PREFERRED' : category, reqType);
    return {
      requirement_text: String(r.requirement_text || '').slice(0, 300),
      category,
      priority,
      req_type: reqType,
      skill_key: reqType === 'SKILL' ? (r.skill_key || null) : null,
      explanation: explainPriority(priority, category === 'NICE_TO_HAVE' ? 'PREFERRED' : category),
      sort_order: i,
    };
  }).filter((r) => r.requirement_text.length > 3);

  return {
    role_guess: ai.role_guess || deterministicResult.role_guess,
    seniority_guess: ai.seniority_guess || deterministicResult.seniority_guess,
    work_mode_guess: ai.work_mode_guess || deterministicResult.work_mode_guess,
    location_guess: ai.location_guess || deterministicResult.location_guess,
    compensation_guess: ai.compensation_guess || deterministicResult.compensation_guess,
    deadline_guess: ai.deadline_guess || deterministicResult.deadline_guess,
    responsibilities: (ai.responsibilities && ai.responsibilities.length > 0) ? ai.responsibilities.slice(0, 8) : deterministicResult.responsibilities,
    requirements: requirements.length > 0 ? requirements : deterministicResult.requirements,
    sections_detected: deterministicResult.sections_detected,
    method: 'AI_ENHANCED',
  };
}

async function parseJD(rawText) {
  const deterministic = parseDeterministic(rawText);
  if (!aiClient.isAvailable()) return deterministic;

  try {
    return await enhanceWithAI(rawText, deterministic);
  } catch (err) {
    // Never fabricate: on any AI failure, silently and safely fall back.
    return { ...deterministic, ai_error: err.message };
  }
}

module.exports = { parseJD, parseDeterministic, guessWorkMode, guessSeniority };
