'use strict';

/**
 * Everything here goes through registry.executeTool — the briefing gets no
 * special back-door to the data layer, so it inherits the exact same
 * permission scoping (a Department Coordinator gets a briefing scoped to
 * their department) and audit trail as any chat-driven question.
 */
async function generateBriefing({ registry, user }) {
  const ctx = {};
  const call = (name, params = {}) => registry.executeTool(name, params, user, ctx);

  const [drivesResult, pendingResults, expiringOffers, dataQuality, roundConversion] = await Promise.all([
    call('search_drives', { status: 'open' }),
    call('get_pending_results', { olderThanHours: 24 }),
    call('get_expiring_offers', { withinHours: 48 }),
    call('get_data_quality', {}),
    call('get_round_conversion', {}),
  ]);

  const sections = [];
  const evidenceSources = [];
  const record = (r) => { if (r.success) evidenceSources.push(r.source); };
  [drivesResult, pendingResults, expiringOffers, dataQuality, roundConversion].forEach(record);

  // 1. Most urgent open drive by deadline, if it has an unapplied gap.
  let urgentDrive = null;
  if (drivesResult.success) {
    const healthChecks = await Promise.all(drivesResult.data.items.map((d) => call('get_drive_health', { driveId: d.id })));
    const withGap = healthChecks
      .filter((r) => r.success && r.data.unappliedCount > 0 && r.data.hoursUntilDeadline >= 0)
      .sort((a, b) => a.data.hoursUntilDeadline - b.data.hoursUntilDeadline);
    if (withGap.length > 0) {
      urgentDrive = withGap[0].data;
      record(withGap[0]);
      const highReadiness = await call('get_unapplied_eligible_students', { driveId: urgentDrive.drive.id, minReadiness: 75 });
      record(highReadiness);
      const deadlineLabel = urgentDrive.hoursUntilDeadline <= 24 ? 'today' : `in ${Math.round(urgentDrive.hoursUntilDeadline / 24)} day(s)`;
      sections.push({
        category: 'Application deadline',
        count: urgentDrive.unappliedCount,
        detail: `Applications for ${urgentDrive.drive.role} close ${deadlineLabel}. ${urgentDrive.unappliedCount} eligible student(s) haven't applied.`,
        driveId: urgentDrive.drive.id,
      });
      if (highReadiness.success && highReadiness.data.count > 0) {
        sections.push({
          category: 'High-readiness unapplied',
          count: highReadiness.data.count,
          detail: `${highReadiness.data.count} of those ${urgentDrive.unappliedCount} are high-readiness (75+) students.`,
          driveId: urgentDrive.drive.id,
          studentIds: highReadiness.data.items.map((s) => s.id),
        });
      }
    }
  }

  // 2. Pending interview results.
  if (pendingResults.success && pendingResults.data.count > 0) {
    sections.push({
      category: 'Pending interview results',
      count: pendingResults.data.count,
      detail: `${pendingResults.data.count} interview result(s) have been pending for more than 24 hours.`,
    });
  }

  // 3. Expiring offers.
  if (expiringOffers.success && expiringOffers.data.count > 0) {
    sections.push({
      category: 'Expiring offers',
      count: expiringOffers.data.count,
      detail: `${expiringOffers.data.count} offer(s) expire within 48 hours.`,
    });
  }

  // 4. Weakest department vs. institutional median (only if the gap is meaningful).
  if (roundConversion.success && roundConversion.data.institutionMedianPct != null) {
    const rates = Object.entries(roundConversion.data.ratesPct);
    if (rates.length > 1) {
      const weakest = rates.sort((a, b) => a[1] - b[1])[0];
      const gap = +(roundConversion.data.institutionMedianPct - weakest[1]).toFixed(1);
      if (gap >= 5) {
        sections.push({
          category: 'Department interview conversion gap',
          count: gap,
          detail: `${weakest[0]} interview progression is ${gap} points below the institutional median (${roundConversion.data.institutionMedianPct}%).`,
        });
      }
    }
  }

  // 5. Data quality.
  if (dataQuality.success && dataQuality.data.unverifiedJoiningRecords > 0) {
    sections.push({
      category: 'Data quality',
      count: dataQuality.data.unverifiedJoiningRecords,
      detail: dataQuality.data.issues[0],
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    greeting:
      sections.length > 0
        ? `Good morning. I found ${sections.length} thing${sections.length === 1 ? '' : 's'} worth your attention.`
        : 'Good morning — nothing urgent stands out right now.',
    sections,
    evidence: evidenceSources,
  };
}

module.exports = { generateBriefing };
