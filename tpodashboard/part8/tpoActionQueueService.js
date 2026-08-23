const PRIORITY_RANK = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, NONE: 4 };

/**
 * Pulls together outputs that already exist from the other services —
 * this function computes nothing itself, it only prioritizes and
 * formats, same discipline as the AI insight contract (section 58: the
 * synthesis layer never estimates a number the underlying services
 * didn't already produce).
 */
function buildActionQueue({
  highRiskStudents = [],
  zeroOfferRiskResults = [],
  quickWins = [],
  upcomingDeadlines = [],
  overdueInterventions = [],
} = {}) {
  const items = [];

  for (const r of highRiskStudents.filter((r) => r.level === 'CRITICAL' || r.level === 'HIGH')) {
    items.push({
      priority: r.level,
      type: 'HIGH_RISK_STUDENT',
      studentId: r.studentId,
      action: 'Review readiness risk and assign or check on an intervention.',
      evidence: (r.signals || []).map((s) => s.type),
    });
  }

  for (const r of zeroOfferRiskResults.filter((r) => r.level === 'CRITICAL' || r.level === 'HIGH')) {
    items.push({
      priority: r.level,
      type: 'ZERO_OFFER_RISK',
      studentId: r.studentId,
      action: `Proactively match against active drives — season is ${r.seasonProgressPct}% through.`,
      evidence: (r.signals || []).map((s) => s.type),
    });
  }

  for (const q of quickWins) {
    items.push({
      priority: 'MEDIUM',
      type: 'QUICK_WIN_ELIGIBILITY',
      studentId: q.studentId,
      action: `Fix ${q.blockingReason.criterion} to unlock eligibility for ${q.company}.`,
    });
  }

  for (const d of upcomingDeadlines) {
    items.push({
      priority: d.daysLeft <= 2 ? 'HIGH' : 'MEDIUM',
      type: 'DRIVE_DEADLINE',
      driveId: d.driveId,
      action: `Finalize the eligibility list for ${d.company} — closes in ${d.daysLeft} day(s).`,
    });
  }

  for (const iv of overdueInterventions) {
    items.push({
      priority: iv.daysOverdue > 14 ? 'HIGH' : 'MEDIUM',
      type: 'INTERVENTION_OVERDUE',
      studentId: iv.studentId,
      action: `Follow up — intervention has been open ${iv.daysOverdue} day(s).`,
    });
  }

  return items.sort((a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9));
}

module.exports = { buildActionQueue };
