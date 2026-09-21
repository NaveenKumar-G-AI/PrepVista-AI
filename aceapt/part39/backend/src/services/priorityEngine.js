const RECOMMENDATION_COPY = {
  APPLY_NOW: 'Apply now.',
  PREPARE_THEN_APPLY: 'Prepare, then apply.',
  LOW_PRIORITY: 'Low priority.',
  DO_NOT_PRIORITIZE: "Don't prioritize this one.",
  VERIFY_FIRST: 'Verify before applying.',
};

function classifyPortfolio(dimensions) {
  const align = dimensions.career_alignment_band;
  const evidence = dimensions.evidence_fit_band;
  if (align === 'STRONG' && (evidence === 'STRONG' || evidence === 'MODERATE')) return 'TARGET';
  if (align === 'STRONG') return 'STRETCH';
  if (align === 'MODERATE') return 'ADJACENT';
  return 'EXPLORATORY';
}

function nextActionFor(recommendation, topGap) {
  switch (recommendation) {
    case 'APPLY_NOW':
      return 'Prepare your application -- your evidence already supports this role well.';
    case 'PREPARE_THEN_APPLY':
      return topGap
        ? `Prepare a short explanation for ${topGap.skill_key || 'the main gap'}, then apply.`
        : 'Prepare your positioning, then apply.';
    case 'LOW_PRIORITY':
      return 'Only worth pursuing if you have spare time -- there are likely better uses of your effort right now.';
    case 'DO_NOT_PRIORITIZE':
      return 'Skip for now unless this is a deliberate exploratory application.';
    case 'VERIFY_FIRST':
      return 'Verify the company and application channel before spending any time on this.';
    default:
      return 'Review the details below before deciding.';
  }
}

function computePriority({ dimensions, safety, matches, requirements }) {
  const value = Math.round(
    dimensions.career_alignment * 0.35
    + dimensions.capability_fit * 0.30
    + dimensions.evidence_fit * 0.20
    + dimensions.project_relevance * 0.15,
  );

  const matchByReq = new Map(matches.map((m) => [m.requirement_id, m]));
  const withStatus = (priorityLevel, statuses) => requirements
    .filter((r) => r.priority === priorityLevel)
    .map((r) => ({ ...r, match: matchByReq.get(r.id) }))
    .filter((r) => r.match && statuses.includes(r.match.match_status));

  // Hard gaps (no evidence at all) drive the recommendation math -- they're
  // more serious than a skill with limited/self-declared evidence.
  const criticalGaps = withStatus('CRITICAL', ['GAP']);
  const importantGaps = withStatus('IMPORTANT', ['GAP']);

  // Soft gaps (limited/partial evidence on an important requirement) still
  // belong in the "Gaps" list -- this is the "Testing: limited evidence"
  // case from the spec's own example, distinct from a true unsupported gap.
  const criticalPartial = withStatus('CRITICAL', ['PARTIAL_MATCH']);
  const importantPartial = withStatus('IMPORTANT', ['PARTIAL_MATCH']);
  const allGaps = [...criticalGaps, ...importantGaps, ...criticalPartial, ...importantPartial];

  const totalCriticalImportant = requirements.filter((r) => r.priority === 'CRITICAL' || r.priority === 'IMPORTANT').length;
  const evaluableMatches = matches.filter((m) => m.match_status !== 'UNKNOWN').length;
  const dataRatio = requirements.length === 0 ? 0 : evaluableMatches / requirements.length;

  let confidence;
  if (requirements.length < 2 || totalCriticalImportant === 0) confidence = 'LOW';
  else if (dataRatio >= 0.7) confidence = 'HIGH';
  else if (dataRatio >= 0.4) confidence = 'MODERATE';
  else confidence = 'LOW';
  if (dimensions.career_alignment === 0 && dimensions.capability_fit === 0 && requirements.length === 0) confidence = 'UNKNOWN';

  let recommendation;
  if (safety.concern_level === 'HIGH') {
    recommendation = 'VERIFY_FIRST';
  } else if (safety.concern_level === 'VERIFY' && value >= 55) {
    recommendation = 'VERIFY_FIRST';
  } else if (value >= 70 && criticalGaps.length === 0) {
    recommendation = 'APPLY_NOW';
  } else if (value >= 50 && criticalGaps.length <= 1) {
    recommendation = 'PREPARE_THEN_APPLY';
  } else if (value >= 30) {
    recommendation = 'LOW_PRIORITY';
  } else {
    recommendation = 'DO_NOT_PRIORITIZE';
  }

  // Build "why" bullets from the strongest real signals -- 3 to 5, plain language.
  const why = [];
  const strongMatches = matches.filter((m) => m.match_status === 'STRONG_MATCH');
  for (const m of strongMatches.slice(0, 3)) {
    why.push(`${m.skill_key} -- validated evidence on file`);
  }
  if (dimensions.career_alignment_band === 'STRONG') why.push('Strongly aligned with your target role');
  else if (dimensions.career_alignment_band === 'MODERATE') why.push('Reasonably aligned with your target direction');
  if (dimensions.project_relevance_band === 'STRONG') why.push('One of your projects is directly relevant to this role');
  if (dimensions.application_effort === 'QUICK') why.push('Application effort is low relative to the potential value');
  if (why.length === 0) {
    why.push(requirements.length === 0
      ? 'Not enough job-description detail was extracted to identify strong matches yet.'
      : 'Limited validated evidence currently overlaps with this posting\'s requirements.');
  }

  const gapBullets = allGaps.slice(0, 4).map((g) => ({
    skill_key: g.skill_key || g.requirement_text.slice(0, 60),
    priority: g.priority,
    severity: g.match.match_status === 'GAP' ? 'UNSUPPORTED' : 'LIMITED_EVIDENCE',
    explanation: g.match.explanation,
  }));

  return {
    value_score: value,
    priority_recommendation: recommendation,
    recommendation_label: RECOMMENDATION_COPY[recommendation],
    confidence,
    portfolio_tag: classifyPortfolio(dimensions),
    why: why.slice(0, 5),
    gaps: gapBullets,
    next_action: nextActionFor(recommendation, gapBullets[0]),
  };
}

module.exports = { computePriority, classifyPortfolio, RECOMMENDATION_COPY };
