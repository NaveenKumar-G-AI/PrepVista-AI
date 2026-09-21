const STAGE_PROGRESS = {
  SAVED: 0, RESEARCHING: 0, PREPARING: 0,
  APPLIED: 1, ASSESSMENT: 2, RECRUITER_CONTACT: 2,
  INTERVIEW_1: 3, INTERVIEW_2: 3, FINAL_ROUND: 4, OFFER: 5,
};

function maxProgressReached(app, historyRows) {
  let running = STAGE_PROGRESS[app.stage] || 0;
  for (const h of historyRows) {
    if (h.application_id !== app.id) continue;
    const p = STAGE_PROGRESS[h.stage];
    if (p !== undefined) running = Math.max(running, p);
  }
  return running;
}

// Per spec section 48: never claim a bottleneck without enough data, and
// never claim certainty -- always "possible".
function computeFunnel(applications, historyRows) {
  const progress = applications.map((a) => maxProgressReached(a, historyRows));
  const counts = {
    applications: progress.filter((p) => p >= 1).length,
    assessments: progress.filter((p) => p >= 2).length,
    interviews: progress.filter((p) => p >= 3).length,
    final_rounds: progress.filter((p) => p >= 4).length,
    offers: progress.filter((p) => p >= 5).length,
  };

  let bottleneck = null;
  if (counts.applications < 5) {
    bottleneck = { area: 'INSUFFICIENT_DATA', message: 'Not enough applications yet to reliably diagnose a funnel bottleneck.' };
  } else if (counts.interviews / counts.applications < 0.15) {
    bottleneck = { area: 'APPLICATION_STAGE', message: 'Possible application-stage bottleneck -- interview conversion is low relative to applications sent.' };
  } else if (counts.interviews >= 5 && counts.offers / counts.interviews < 0.15) {
    bottleneck = { area: 'INTERVIEW_STAGE', message: 'Possible interview-stage bottleneck -- offer conversion is low relative to interviews reached.' };
  }

  return { counts, bottleneck };
}

function computeWeeklyReview({ applications, historyRows }) {
  const since = new Date();
  since.setDate(since.getDate() - 7);
  const recent = historyRows.filter((h) => new Date(h.changed_at) >= since);

  const countStage = (stage) => recent.filter((h) => h.stage === stage).length;

  // Bucket by positioning statement prefix; only surface a pattern with a
  // real sample size, and always label it observed, not causal (section 49/50).
  const buckets = new Map();
  for (const app of applications) {
    if (!app.positioning_statement) continue;
    const key = app.positioning_statement.slice(0, 48);
    if (!buckets.has(key)) buckets.set(key, { total: 0, interviewed: 0 });
    const b = buckets.get(key);
    b.total += 1;
    if (['INTERVIEW_1', 'INTERVIEW_2', 'FINAL_ROUND', 'OFFER'].includes(app.stage)) b.interviewed += 1;
  }
  let topPositioning = null;
  for (const [statement, b] of buckets) {
    if (b.total < 3) continue;
    const rate = b.interviewed / b.total;
    if (!topPositioning || rate > topPositioning.rate) topPositioning = { statement, rate, sample: b.total };
  }

  return {
    window_days: 7,
    applications_submitted: countStage('APPLIED'),
    interviews: countStage('INTERVIEW_1') + countStage('INTERVIEW_2'),
    final_rounds: countStage('FINAL_ROUND'),
    offers: countStage('OFFER'),
    no_response: countStage('NO_RESPONSE'),
    rejections: countStage('REJECTED'),
    top_performing_positioning: topPositioning ? {
      statement_preview: topPositioning.statement,
      sample_size: topPositioning.sample,
      note: `OBSERVED DATA: this positioning has produced more recorded interview activity in your current history (sample size ${topPositioning.sample}). This describes a pattern, not a proven cause.`,
    } : null,
  };
}

function computeHighValueGaps(analyses) {
  const counts = new Map();
  for (const a of analyses) {
    const gaps = JSON.parse(a.gaps_json || '[]');
    for (const g of gaps) {
      const key = g.skill_key || 'unspecified requirement';
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  const total = analyses.length;
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([skill, count]) => ({
      skill,
      count,
      total_opportunities_analyzed: total,
      note: `${skill} appears as a gap in ${count} of your last ${total} analyzed opportunities.`,
    }));
}

function computePortfolioBreakdown(analyses) {
  const counts = { TARGET: 0, STRETCH: 0, ADJACENT: 0, EXPLORATORY: 0 };
  for (const a of analyses) {
    if (a.portfolio_tag && counts[a.portfolio_tag] !== undefined) counts[a.portfolio_tag]++;
  }
  return counts;
}

// "Today's Priorities" -- dynamic, bounded by real pipeline state, never a
// fixed arbitrary number (spec section 59).
function computeTodayPriorities({ dueFollowups, highPriorityOpportunities, stuckApplications, topGap }) {
  const items = [];
  for (const f of dueFollowups.slice(0, 3)) {
    items.push({ type: 'FOLLOW_UP', title: `Follow up: ${f.role} at ${f.company}`, detail: f.reason, href: `/applications/${f.application_id}` });
  }
  for (const o of highPriorityOpportunities.slice(0, 3)) {
    items.push({ type: 'HIGH_VALUE_APPLICATION', title: `Review: ${o.role} at ${o.company}`, detail: 'Strong match -- worth reviewing today.', href: `/opportunities/${o.id}` });
  }
  for (const a of stuckApplications.slice(0, 2)) {
    items.push({ type: 'PREPARATION_TASK', title: `Finish preparing: ${a.role} at ${a.company}`, detail: 'This application is still in preparation.', href: `/applications/${a.id}` });
  }
  if (topGap) {
    items.push({ type: 'EVIDENCE_GAP', title: `Recurring gap: ${topGap.skill}`, detail: topGap.note, href: '/insights' });
  }
  return items;
}

module.exports = {
  computeFunnel, computeWeeklyReview, computeHighValueGaps, computePortfolioBreakdown, computeTodayPriorities,
};
