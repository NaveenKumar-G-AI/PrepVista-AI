const { normalizeSkill, extractSkillsFromText } = require('./skillsDictionary');

const STRENGTH_RANK = { VERIFIED: 5, STRONG: 4, MODERATE: 3, LIMITED: 2, UNSUPPORTED: 1 };

// Never equate a keyword appearing in a profile with proven capability
// (spec section 16). Self-declared evidence is capped below STRONG_MATCH
// no matter what strength value is stored on it.
function matchOneRequirement(requirement, evidenceForSkill) {
  if (requirement.req_type !== 'SKILL') {
    return {
      requirement_id: requirement.id,
      skill_key: null,
      match_status: 'UNKNOWN',
      evidence_strength: 'UNKNOWN',
      explanation: requirement.req_type === 'EXPERIENCE'
        ? 'Experience requirements are not automatically verifiable from your profile yet.'
        : requirement.req_type === 'EDUCATION'
          ? 'Add your education details to your profile to check this automatically.'
          : 'Not enough information to evaluate this requirement automatically.',
    };
  }

  if (!evidenceForSkill || evidenceForSkill.length === 0) {
    return {
      requirement_id: requirement.id,
      skill_key: requirement.skill_key,
      match_status: 'GAP',
      evidence_strength: 'UNSUPPORTED',
      explanation: `No evidence of ${requirement.skill_key} found in your profile.`,
    };
  }

  const best = [...evidenceForSkill].sort(
    (a, b) => (STRENGTH_RANK[b.strength] || 0) - (STRENGTH_RANK[a.strength] || 0),
  )[0];

  const isSelfDeclared = best.evidence_type === 'SELF_DECLARED';

  if (isSelfDeclared) {
    return {
      requirement_id: requirement.id,
      skill_key: requirement.skill_key,
      match_status: 'PARTIAL_MATCH',
      evidence_strength: 'LIMITED',
      evidence_id: best.id,
      explanation: `${requirement.skill_key} appears in your profile, but available evidence is limited (self-declared, not yet validated by a project or assessment).`,
    };
  }

  if (best.strength === 'VERIFIED' || best.strength === 'STRONG') {
    return {
      requirement_id: requirement.id,
      skill_key: requirement.skill_key,
      match_status: 'STRONG_MATCH',
      evidence_strength: best.strength,
      evidence_id: best.id,
      explanation: `${requirement.skill_key} is backed by ${describeEvidence(best)}.`,
    };
  }

  if (best.strength === 'MODERATE' || best.strength === 'LIMITED') {
    return {
      requirement_id: requirement.id,
      skill_key: requirement.skill_key,
      match_status: 'PARTIAL_MATCH',
      evidence_strength: best.strength,
      evidence_id: best.id,
      explanation: `Related evidence exists for ${requirement.skill_key} (${describeEvidence(best)}), but it's not yet strong enough to call this a confident match.`,
    };
  }

  return {
    requirement_id: requirement.id,
    skill_key: requirement.skill_key,
    match_status: 'GAP',
    evidence_strength: 'UNSUPPORTED',
    evidence_id: best.id,
    explanation: `${requirement.skill_key} is mentioned in your profile but not currently supported by usable evidence.`,
  };
}

function describeEvidence(e) {
  const typeLabel = {
    PROJECT: 'a project',
    ASSESSMENT: 'a validated assessment',
    CERTIFICATE: 'a certificate',
    WORK_EXPERIENCE: 'work experience',
    COURSEWORK: 'coursework',
  }[e.evidence_type] || 'recorded evidence';
  return typeLabel;
}

function matchRequirementsToEvidence(requirements, evidenceList) {
  const bySkill = new Map();
  for (const ev of evidenceList) {
    const key = normalizeSkill(ev.skill) || ev.skill;
    if (!bySkill.has(key)) bySkill.set(key, []);
    bySkill.get(key).push(ev);
  }
  return requirements.map((req) => matchOneRequirement(req, req.skill_key ? bySkill.get(req.skill_key) : null));
}

function scoreBand(score) {
  if (score >= 75) return 'STRONG';
  if (score >= 45) return 'MODERATE';
  if (score > 0) return 'WEAK';
  return 'UNKNOWN';
}

// A handful of very common tech-title synonyms so "Software Engineer" and
// "Developer" aren't treated as unrelated words when comparing role titles.
// Deliberately small and conservative -- broader semantic matching is a good
// candidate for the AI-enhanced path, not a large hand-built synonym list.
const ROLE_TOKEN_SYNONYMS = {
  engineer: 'developer', engineering: 'developer', programmer: 'developer', swe: 'developer', dev: 'developer',
};

function roleTokens(text) {
  const raw = String(text || '').toLowerCase().match(/[a-z0-9+]+/g) || [];
  return raw.map((t) => ROLE_TOKEN_SYNONYMS[t] || t);
}

function tokenOverlapScore(a, b) {
  const setA = new Set(roleTokens(a));
  const setB = new Set(roleTokens(b));
  if (setA.size === 0 || setB.size === 0) return 0;
  let hits = 0;
  for (const t of setA) if (setB.has(t)) hits++;
  return Math.round((hits / Math.min(setA.size, setB.size)) * 100);
}

// Computes every fit dimension from spec section 17 as an independent,
// explainable score -- deliberately NOT collapsed into one black-box percent.
function computeFitDimensions({ student, opportunity, requirements, matches, projects, safety }) {
  const criticalOrImportant = requirements.filter((r) => r.priority === 'CRITICAL' || r.priority === 'IMPORTANT');
  const matchById = new Map(matches.map((m) => [m.requirement_id, m]));

  // Career alignment: overlap between opportunity role/industry and the
  // student's stated target role / career direction.
  const careerAlignment = Math.max(
    tokenOverlapScore(opportunity.role, student.target_role),
    tokenOverlapScore(`${opportunity.role} ${opportunity.industry}`, `${student.target_role} ${student.career_direction}`),
  );

  // Capability fit: share of critical/important requirements that are at
  // least partially matched.
  const relevantMatches = criticalOrImportant.map((r) => matchById.get(r.id)).filter(Boolean);
  const capabilityFit = relevantMatches.length === 0 ? 0 : Math.round(
    (relevantMatches.filter((m) => m.match_status === 'STRONG_MATCH').length * 1.0 +
      relevantMatches.filter((m) => m.match_status === 'PARTIAL_MATCH').length * 0.5) /
      relevantMatches.length * 100,
  );

  // Evidence fit: average evidence strength across all matched requirements.
  const strengthValues = matches.map((m) => STRENGTH_RANK[m.evidence_strength] || 0).filter((v) => v > 0);
  const evidenceFit = strengthValues.length === 0 ? 0
    : Math.round((strengthValues.reduce((a, b) => a + b, 0) / strengthValues.length / 5) * 100);

  // Project relevance: do any of the student's projects mention the
  // opportunity's required skills?
  const requiredSkills = new Set(requirements.filter((r) => r.skill_key).map((r) => r.skill_key));
  let projectRelevance = 0;
  for (const p of projects) {
    const pSkills = new Set((p.skills_json ? JSON.parse(p.skills_json) : []));
    let hits = 0;
    for (const s of pSkills) if (requiredSkills.has(s)) hits++;
    if (requiredSkills.size > 0) projectRelevance = Math.max(projectRelevance, Math.round((hits / requiredSkills.size) * 100));
  }

  // Experience fit: entry-level postings default to a reasonable fit for a
  // student profile; otherwise UNKNOWN unless we can compare years directly
  // (we don't track total years yet, so we stay honest and say UNKNOWN).
  const experienceReq = requirements.find((r) => r.req_type === 'EXPERIENCE');
  const experienceFit = !experienceReq ? 'LIKELY_OK'
    : /\b0\b|\b1\b|entry|intern|fresher/i.test(experienceReq.requirement_text) ? 'LIKELY_OK'
      : 'UNKNOWN';

  // Location / work-mode fit vs student constraints (if the student has set any).
  const constraints = student.constraints_json ? JSON.parse(student.constraints_json) : {};
  const locationFit = !opportunity.location ? 'UNKNOWN'
    : constraints.preferred_location
      ? (tokenOverlapScore(opportunity.location, constraints.preferred_location) > 30 ? 'MATCH' : 'MISMATCH')
      : 'UNKNOWN';

  const workModeFit = opportunity.work_mode === 'UNKNOWN' || !opportunity.work_mode ? 'UNKNOWN'
    : constraints.remote_only && opportunity.work_mode !== 'REMOTE' ? 'MISMATCH'
      : 'UNKNOWN';

  const compensationFit = (!opportunity.compensation_text || !constraints.min_salary) ? 'UNKNOWN' : 'UNKNOWN';

  // Opportunity quality: source trust + freshness + safety.
  let quality = 50;
  if (opportunity.source_type === 'OFFICIAL_COMPANY_SOURCE' || opportunity.source_type === 'VERIFIED_JOB_SOURCE') quality += 25;
  if (opportunity.source_type === 'UNKNOWN') quality -= 15;
  if (opportunity.posting_date) quality += 10;
  if (opportunity.deadline) quality += 5;
  if (safety.concern_level === 'HIGH') quality -= 40;
  if (safety.concern_level === 'VERIFY') quality -= 15;
  quality = Math.max(0, Math.min(100, quality));

  // Application effort estimate from posting complexity.
  const effortSignals = [
    /assessment|coding test|online test/i.test(opportunity.raw_jd_text || ''),
    /cover letter/i.test(opportunity.raw_jd_text || ''),
    /portfolio/i.test(opportunity.raw_jd_text || ''),
    requirements.length > 12,
  ].filter(Boolean).length;
  const applicationEffort = effortSignals >= 3 ? 'HIGH_EFFORT' : effortSignals === 2 ? 'TAILORED' : effortSignals === 1 ? 'STANDARD' : 'QUICK';

  return {
    career_alignment: careerAlignment,
    career_alignment_band: scoreBand(careerAlignment),
    capability_fit: capabilityFit,
    capability_fit_band: scoreBand(capabilityFit),
    evidence_fit: evidenceFit,
    evidence_fit_band: scoreBand(evidenceFit),
    experience_fit: experienceFit,
    project_relevance: projectRelevance,
    project_relevance_band: scoreBand(projectRelevance),
    location_fit: locationFit,
    work_mode_fit: workModeFit,
    compensation_fit: compensationFit,
    opportunity_quality: quality,
    application_effort: applicationEffort,
  };
}

module.exports = { matchRequirementsToEvidence, computeFitDimensions, scoreBand, tokenOverlapScore };
