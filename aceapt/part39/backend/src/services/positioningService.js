// Stand-in for Feature 38 ("how should the student present themselves?").
// Real Feature 38 should supply `positioningProfile` and differentiators;
// everything below is written to accept that shape so swapping in the real
// service later just means replacing getPositioningProfile() in routes/students.js
// with a call into Feature 38's actual API/service.

const aiClient = require('./aiClient');

function scoreProject(project, requirements) {
  const skills = project.skills_json ? JSON.parse(project.skills_json) : [];
  const skillSet = new Set(skills);
  let score = 0;
  const matchedSkills = [];
  for (const r of requirements) {
    if (r.skill_key && skillSet.has(r.skill_key)) {
      score += r.priority === 'CRITICAL' ? 3 : r.priority === 'IMPORTANT' ? 2 : 1;
      matchedSkills.push(r.skill_key);
    }
  }
  if (project.completeness === 'COMPLETE') score += 1;
  return { project, score, matchedSkills: [...new Set(matchedSkills)] };
}

function selectBestProject(projects, requirements) {
  if (!projects || projects.length === 0) return { best: null, secondary: [] };
  const scored = projects.map((p) => scoreProject(p, requirements)).sort((a, b) => b.score - a.score);
  const top = scored[0];
  if (!top || top.score === 0) return { best: null, secondary: [] };

  const reason = top.matchedSkills.length > 0
    ? `Directly demonstrates ${top.matchedSkills.slice(0, 3).join(', ')}, matching key requirements for this role.`
    : 'Most complete project on file for this direction.';

  const secondary = scored.slice(1, 3).filter((s) => s.score > 0).map((s) => ({
    project_id: s.project.id,
    name: s.project.name,
    matched_skills: s.matchedSkills,
  }));

  return {
    best: { project_id: top.project.id, name: top.project.name, matched_skills: top.matchedSkills, reason },
    secondary,
  };
}

function buildEmphasis(requirements, matches) {
  const matchByReq = new Map(matches.map((m) => [m.requirement_id, m]));
  const emphasize = [];
  for (const r of requirements) {
    if (!r.skill_key) continue;
    const m = matchByReq.get(r.id);
    // Only strong, confident evidence belongs in "emphasize" -- a skill with
    // limited/partial evidence is a gap to prepare for, not a selling point.
    if (m && m.match_status === 'STRONG_MATCH' && (r.priority === 'CRITICAL' || r.priority === 'IMPORTANT' || r.priority === 'SUPPORTING')) {
      emphasize.push(r.skill_key);
    }
  }
  return [...new Set(emphasize)].slice(0, 6);
}

function buildDeEmphasis(evidenceList, emphasizeList) {
  const emphasizeSet = new Set(emphasizeList);
  const validated = evidenceList.filter((e) => (e.strength === 'STRONG' || e.strength === 'VERIFIED'));
  const skills = [...new Set(validated.map((e) => e.skill))];
  return skills.filter((s) => !emphasizeSet.has(s)).slice(0, 4);
}

function buildStatementDeterministic({ roleDirection, emphasize, differentiators }) {
  const skillsPart = emphasize.slice(0, 4).join(', ') || 'their core coursework and project work';
  const base = roleDirection
    ? `${roleDirection} with hands-on experience in ${skillsPart}.`
    : `A candidate with hands-on experience in ${skillsPart}.`;
  const diff = differentiators && differentiators.length ? ` ${differentiators[0]}` : '';
  return (base + diff).trim();
}

async function buildPositioning({ student, positioningProfile, requirements, matches, evidenceList, opportunity }) {
  const emphasize = buildEmphasis(requirements, matches);
  const deEmphasize = buildDeEmphasis(evidenceList, emphasize);
  const roleDirection = positioningProfile?.role_direction || student.target_role;
  const differentiators = positioningProfile?.differentiators_json ? JSON.parse(positioningProfile.differentiators_json) : [];

  let statement = buildStatementDeterministic({ roleDirection, emphasize, differentiators });
  let method = 'DETERMINISTIC';

  if (aiClient.isAvailable() && emphasize.length > 0) {
    try {
      const facts = evidenceList
        .filter((e) => emphasize.includes(e.skill))
        .map((e) => `${e.skill}: ${e.description || e.evidence_type} (${e.strength})`);
      const system = [
        'Write ONE professional positioning sentence (max 30 words) for a student\'s job application, in third person is not needed -- write it as a direct statement e.g. "Backend-focused developer with...".',
        'Only reference the facts provided. Never invent achievements, employers, numbers, or outcomes that are not in the facts.',
        'Return JSON: {"statement": string}',
      ].join(' ');
      const user = `Facts on file: ${JSON.stringify(facts)}\nRole direction: ${roleDirection || 'unspecified'}\nTarget opportunity: ${opportunity?.role || ''} at ${opportunity?.company || ''}\nSkills to emphasize: ${emphasize.join(', ')}`;
      const ai = await aiClient.completeJSON({ system, user, maxTokens: 200 });
      if (ai.statement && typeof ai.statement === 'string') {
        statement = ai.statement.trim();
        method = 'AI_ENHANCED';
      }
    } catch {
      // keep deterministic statement
    }
  }

  return { statement, emphasize, de_emphasize: deEmphasize, method };
}

// Ranks the student's resumes by overlap with this opportunity's requirements
// (spec section 29). Never auto-overwrites a master resume -- this only
// suggests an order; the student picks.
function rankResumes(resumes, requirements) {
  if (!resumes || resumes.length === 0) return [];
  const reqPriorityBySkill = new Map(requirements.filter((r) => r.skill_key).map((r) => [r.skill_key, r.priority]));
  const weight = (p) => (p === 'CRITICAL' ? 3 : p === 'IMPORTANT' ? 2 : p === 'SUPPORTING' ? 1 : 0.5);

  return resumes.map((r) => {
    const tags = r.emphasis_tags_json ? JSON.parse(r.emphasis_tags_json) : [];
    let score = 0;
    const matchedTags = [];
    for (const t of tags) {
      if (reqPriorityBySkill.has(t)) {
        score += weight(reqPriorityBySkill.get(t));
        matchedTags.push(t);
      }
    }
    return { resume_id: r.id, title: r.title, score, matched_tags: matchedTags, is_master: Boolean(r.is_master) };
  }).sort((a, b) => b.score - a.score);
}

module.exports = {
  selectBestProject, buildPositioning, buildEmphasis, buildDeEmphasis, rankResumes, buildStatementDeterministic,
};
