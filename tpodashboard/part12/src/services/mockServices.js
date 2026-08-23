'use strict';

const data = require('./mockData');

/**
 * Contract note: every exported function here is what a real Part-1-11
 * service method would look like from the AI tool layer's point of view —
 * same shape, same institutionId-scoping discipline. Swapping this whole
 * file for calls into the real services is the entire "production
 * integration" step; nothing in src/tools/*.tools.js needs to change.
 */

function byInstitution(list, institutionId) {
  return list.filter((r) => r.institutionId === institutionId);
}

// ---------------------------------------------------------------- students
const students = {
  search({ institutionId, department, minReadiness, maxReadiness, query }) {
    let pool = byInstitution(data.students, institutionId);
    if (department) pool = pool.filter((s) => s.department === department);
    if (typeof minReadiness === 'number') pool = pool.filter((s) => s.readinessScore >= minReadiness);
    if (typeof maxReadiness === 'number') pool = pool.filter((s) => s.readinessScore <= maxReadiness);
    if (query) {
      const q = query.toLowerCase();
      pool = pool.filter((s) => s.displayName.toLowerCase().includes(q) || s.id.includes(q));
    }
    return { items: pool, count: pool.length };
  },

  get({ institutionId, studentId }) {
    return byInstitution(data.students, institutionId).find((s) => s.id === studentId) || null;
  },

  applications({ institutionId, studentId }) {
    const apps = data.applications.filter((a) => a.institutionId === institutionId && a.studentId === studentId);
    return { items: apps, count: apps.length };
  },

  interviews({ institutionId, studentId }) {
    const items = data.interviews.filter((i) => i.institutionId === institutionId && i.studentId === studentId);
    return { items, count: items.length };
  },

  offers({ institutionId, studentId }) {
    const items = data.offers.filter((o) => o.institutionId === institutionId && o.studentId === studentId);
    return { items, count: items.length };
  },
};

// ---------------------------------------------------------------- companies
const companies = {
  search({ institutionId, query }) {
    let pool = byInstitution(data.companies, institutionId);
    if (query) pool = pool.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()));
    return { items: pool, count: pool.length };
  },
  get({ institutionId, companyId, name }) {
    const pool = byInstitution(data.companies, institutionId);
    if (companyId) return pool.find((c) => c.id === companyId) || null;
    if (name) return pool.find((c) => c.name.toLowerCase() === name.toLowerCase()) || null;
    return null;
  },
  history({ institutionId, companyId }) {
    const drivesForCo = data.drives.filter((d) => d.institutionId === institutionId && d.companyId === companyId);
    return { driveCount: drivesForCo.length, drives: drivesForCo.map((d) => ({ id: d.id, season: d.season, role: d.role, status: d.status })) };
  },
  recruiterFollowups({ institutionId }) {
    const stale = byInstitution(data.companies, institutionId).filter((c) => c.relationship === 'new_recruiter' || !c.lastVisitSeason);
    return { items: stale, count: stale.length };
  },
};

// ---------------------------------------------------------------- drives
const drives = {
  search({ institutionId, status }) {
    let pool = byInstitution(data.drives, institutionId);
    if (status) pool = pool.filter((d) => d.status === status);
    return { items: pool, count: pool.length };
  },
  get({ institutionId, driveId }) {
    return byInstitution(data.drives, institutionId).find((d) => d.id === driveId) || null;
  },
  eligibleStudents({ institutionId, driveId }) {
    const drive = drives.get({ institutionId, driveId });
    if (!drive) return { items: [], count: 0 };
    const items = byInstitution(data.students, institutionId).filter(
      (s) => drive.eligibleDepartments.includes(s.department) && s.readinessScore >= drive.minReadiness
    );
    return { items, count: items.length };
  },
  health({ institutionId, driveId }) {
    const drive = drives.get({ institutionId, driveId });
    if (!drive) return null;
    const eligible = drives.eligibleStudents({ institutionId, driveId }).items;
    const appliedStudentIds = new Set(
      data.applications.filter((a) => a.institutionId === institutionId && a.driveId === driveId).map((a) => a.studentId)
    );
    const eligibleIds = new Set(eligible.map((s) => s.id));
    const unapplied = eligible.filter((s) => !appliedStudentIds.has(s.id));
    const appliedCount = [...appliedStudentIds].filter((id) => eligibleIds.has(id)).length;
    const hoursUntilDeadline = (new Date(drive.applicationDeadline).getTime() - Date.now()) / 3600000;
    return {
      drive: { id: drive.id, role: drive.role, companyId: drive.companyId, status: drive.status, applicationDeadline: drive.applicationDeadline },
      eligibleCount: eligible.length,
      appliedCount,
      unappliedCount: unapplied.length,
      applicationRatePct: eligible.length ? +((100 * appliedCount) / eligible.length).toFixed(1) : null,
      hoursUntilDeadline: +hoursUntilDeadline.toFixed(1),
      deadlineRisk: hoursUntilDeadline >= 0 && hoursUntilDeadline <= 24 && unapplied.length > 0,
    };
  },
};

// ------------------------------------------------------------ applications
const applications = {
  forDrive({ institutionId, driveId }) {
    const items = data.applications.filter((a) => a.institutionId === institutionId && a.driveId === driveId);
    return { items, count: items.length };
  },

  funnel({ institutionId, driveId }) {
    const eligible = drives.eligibleStudents({ institutionId, driveId }).items;
    const eligibleIds = new Set(eligible.map((s) => s.id));
    const appliedIds = new Set(
      data.applications.filter((a) => a.institutionId === institutionId && a.driveId === driveId && eligibleIds.has(a.studentId)).map((a) => a.studentId)
    );
    const interviewedIds = new Set(
      data.interviews.filter((i) => i.institutionId === institutionId && i.driveId === driveId && appliedIds.has(i.studentId)).map((i) => i.studentId)
    );
    const offeredIds = new Set(
      data.offers.filter((o) => o.institutionId === institutionId && o.driveId === driveId && appliedIds.has(o.studentId)).map((o) => o.studentId)
    );
    return {
      driveId,
      eligible: eligibleIds.size,
      applied: appliedIds.size,
      interviewed: interviewedIds.size,
      offered: offeredIds.size,
    };
  },

  /**
   * The central cross-module tool (spec sections 4, 17, 21, 28, 36, 104):
   * intersects readiness + drive eligibility + application status in one
   * pass. minReadiness is optional — omit it to get all unapplied-eligible
   * students, or set it to isolate the high-readiness subset.
   */
  unappliedEligible({ institutionId, driveId, minReadiness, department }) {
    const pool = driveId
      ? drives.eligibleStudents({ institutionId, driveId }).items
      : byInstitution(data.students, institutionId);
    const appliedIds = new Set(
      data.applications
        .filter((a) => a.institutionId === institutionId && (!driveId || a.driveId === driveId))
        .map((a) => a.studentId)
    );
    let items = pool.filter((s) => !appliedIds.has(s.id));
    if (typeof minReadiness === 'number') items = items.filter((s) => s.readinessScore >= minReadiness);
    if (department) items = items.filter((s) => s.department === department);
    const byDept = {};
    for (const s of items) byDept[s.department] = (byDept[s.department] || 0) + 1;
    return { items, count: items.length, byDepartment: byDept };
  },

  rate({ institutionId, driveId }) {
    const f = applications.funnel({ institutionId, driveId });
    return { driveId, eligible: f.eligible, applied: f.applied, ratePct: f.eligible ? +((100 * f.applied) / f.eligible).toFixed(2) : null };
  },
};

// -------------------------------------------------------------- interviews
const interviews = {
  today({ institutionId }) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    const items = data.interviews.filter((i) => {
      if (i.institutionId !== institutionId) return false;
      const at = new Date(i.scheduledFor || i.interviewedAt).getTime();
      return at >= startOfDay.getTime() && at <= endOfDay.getTime();
    });
    return { items, count: items.length };
  },

  pendingResults({ institutionId, olderThanHours = 24 }) {
    const cutoff = Date.now() - olderThanHours * 3600000;
    const items = data.interviews.filter(
      (i) => i.institutionId === institutionId && i.status === 'completed' && i.result === null && new Date(i.interviewedAt).getTime() <= cutoff
    );
    return { items, count: items.length };
  },

  roundConversion({ institutionId, department }) {
    let pool = data.interviews.filter((i) => i.institutionId === institutionId && i.result !== null);
    if (department) pool = pool.filter((i) => i.department === department);
    const byDept = {};
    for (const i of pool) {
      byDept[i.department] = byDept[i.department] || { pass: 0, total: 0 };
      byDept[i.department].total += 1;
      if (i.result === 'pass') byDept[i.department].pass += 1;
    }
    const rates = {};
    for (const [dept, v] of Object.entries(byDept)) rates[dept] = +((100 * v.pass) / v.total).toFixed(1);
    const values = Object.values(rates);
    let median = null;
    if (values.length) {
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      median = sorted.length % 2 ? sorted[mid] : +((sorted[mid - 1] + sorted[mid]) / 2).toFixed(1);
    }
    return { byDepartment: { ...byDept, ...Object.fromEntries(Object.entries(rates).map(([k, v]) => [k, { ...byDept[k], ratePct: v }])) }, ratesPct: rates, institutionMedianPct: median };
  },
};

// ------------------------------------------------------------------ offers
const offers = {
  list({ institutionId, status }) {
    let pool = byInstitution(data.offers, institutionId);
    if (status) pool = pool.filter((o) => o.status === status);
    return { items: pool, count: pool.length };
  },

  expiring({ institutionId, withinHours = 48 }) {
    const now = Date.now();
    const items = data.offers.filter((o) => {
      if (o.institutionId !== institutionId || o.status !== 'pending_acceptance') return false;
      const hoursLeft = (new Date(o.expiresAt).getTime() - now) / 3600000;
      return hoursLeft >= 0 && hoursLeft <= withinHours;
    });
    return { items, count: items.length };
  },

  joiningPending({ institutionId }) {
    const accepted = data.offers.filter((o) => o.institutionId === institutionId && o.status === 'accepted');
    const confirmedOfferIds = new Set(
      data.joiningRecords.filter((j) => j.institutionId === institutionId && j.confirmed).map((j) => j.offerId)
    );
    const items = accepted.filter((o) => !confirmedOfferIds.has(o.id));
    return { items, count: items.length };
  },

  placementOutcomes({ institutionId }) {
    const totalStudents = byInstitution(data.students, institutionId).length;
    const placedStudentIds = new Set(
      data.offers.filter((o) => o.institutionId === institutionId && o.status === 'accepted').map((o) => o.studentId)
    );
    const placementRatePct = totalStudents ? +((100 * placedStudentIds.size) / totalStudents).toFixed(1) : null;
    return { totalStudents, placedCount: placedStudentIds.size, placementRatePct };
  },
};

// ---------------------------------------------------------------- training
const training = {
  programs({ institutionId }) {
    return { items: byInstitution(data.trainingPrograms, institutionId) };
  },

  effectiveness({ institutionId, programId }) {
    const program = byInstitution(data.trainingPrograms, institutionId).find((p) => p.id === programId);
    if (!program) return null;
    const completions = data.trainingCompletions.filter((c) => c.institutionId === institutionId && c.programId === programId);
    const assessed = completions.filter((c) => c.preAssessmentScore != null && c.postAssessmentScore != null);
    const avgImprovement = assessed.length
      ? +(assessed.reduce((sum, c) => sum + (c.postAssessmentScore - c.preAssessmentScore), 0) / assessed.length).toFixed(1)
      : null;
    return {
      programId,
      programName: program.name,
      completions: completions.length,
      assessedCount: assessed.length,
      avgImprovement,
      dataSufficient: assessed.length === completions.length,
      note:
        assessed.length < completions.length
          ? `${completions.length} completions, but only ${assessed.length} have both pre- and post-assessment data. Observed improvement is reported only across those ${assessed.length}, not the full cohort.`
          : null,
    };
  },
};

// --------------------------------------------------------------- readiness
const readiness = {
  trend({ institutionId, studentId }) {
    const student = students.get({ institutionId, studentId });
    if (!student) return null;
    return { studentId, currentScore: student.readinessScore, history: [], note: 'Historical readiness snapshots are not populated in this reference dataset — only the current score is available.' };
  },

  highRisk({ institutionId, department, threshold = 45 }) {
    let pool = byInstitution(data.students, institutionId).filter((s) => s.readinessScore < threshold);
    if (department) pool = pool.filter((s) => s.department === department);
    return { items: pool, count: pool.length, threshold };
  },

  topImprovers({ institutionId, limit = 10, department }) {
    const studentDept = new Map(byInstitution(data.students, institutionId).map((s) => [s.id, s.department]));
    let assessed = data.trainingCompletions.filter(
      (c) => c.institutionId === institutionId && c.preAssessmentScore != null && c.postAssessmentScore != null
    );
    if (department) assessed = assessed.filter((c) => studentDept.get(c.studentId) === department);
    const withDelta = assessed
      .map((c) => ({ studentId: c.studentId, institutionId, department: studentDept.get(c.studentId) || null, programId: c.programId, improvement: c.postAssessmentScore - c.preAssessmentScore }))
      .sort((a, b) => b.improvement - a.improvement)
      .slice(0, limit);
    return { items: withDelta, count: withDelta.length };
  },

  departmentReadiness({ institutionId }) {
    const pool = byInstitution(data.students, institutionId);
    const byDept = {};
    for (const s of pool) {
      byDept[s.department] = byDept[s.department] || { count: 0, sum: 0 };
      byDept[s.department].count += 1;
      byDept[s.department].sum += s.readinessScore;
    }
    const out = {};
    for (const [dept, v] of Object.entries(byDept)) out[dept] = { count: v.count, avgReadiness: +(v.sum / v.count).toFixed(1) };
    return out;
  },
};

// ----------------------------------------------------------------- reports
const reports = {
  executiveMetrics({ institutionId }) {
    const pool = byInstitution(data.students, institutionId);
    const eligible = pool.filter((s) => s.readinessScore >= 45);
    const appliedIds = new Set(data.applications.filter((a) => a.institutionId === institutionId).map((a) => a.studentId));
    const applied = eligible.filter((s) => appliedIds.has(s.id));
    const placedIds = new Set(data.offers.filter((o) => o.institutionId === institutionId && o.status === 'accepted').map((o) => o.studentId));
    const placed = eligible.filter((s) => placedIds.has(s.id));
    const target = data.placementTarget.institutionId === institutionId ? data.placementTarget.targetPct : null;
    const placementRatePct = eligible.length ? +((100 * placed.length) / eligible.length).toFixed(1) : null;
    return {
      eligible: eligible.length,
      applied: applied.length,
      applicationRatePct: eligible.length ? +((100 * applied.length) / eligible.length).toFixed(1) : null,
      placed: placed.length,
      placementRatePct,
      targetPct: target,
      belowTarget: target != null && placementRatePct != null ? placementRatePct < target : null,
      gapPts: target != null && placementRatePct != null ? +(target - placementRatePct).toFixed(1) : null,
    };
  },

  placementFunnel({ institutionId }) {
    const pool = byInstitution(data.students, institutionId);
    const eligible = pool.filter((s) => s.readinessScore >= 45);
    const eligibleIds = new Set(eligible.map((s) => s.id));
    const appliedIds = new Set(data.applications.filter((a) => a.institutionId === institutionId && eligibleIds.has(a.studentId)).map((a) => a.studentId));
    const interviewedIds = new Set(data.interviews.filter((i) => i.institutionId === institutionId && appliedIds.has(i.studentId)).map((i) => i.studentId));
    const offeredIds = new Set(data.offers.filter((o) => o.institutionId === institutionId && appliedIds.has(o.studentId)).map((o) => o.studentId));
    const joinedIds = new Set(
      data.joiningRecords.filter((j) => j.institutionId === institutionId && j.confirmed && appliedIds.has(j.studentId)).map((j) => j.studentId)
    );
    return {
      eligible: eligibleIds.size,
      applied: appliedIds.size,
      interviewed: interviewedIds.size,
      offered: offeredIds.size,
      joined: joinedIds.size,
    };
  },

  departmentReport({ institutionId }) {
    const departments = [...new Set(byInstitution(data.students, institutionId).map((s) => s.department))];
    const conv = interviews.roundConversion({ institutionId });
    const readinessByDept = readiness.departmentReadiness({ institutionId });
    const out = {};
    for (const dept of departments) {
      const pool = byInstitution(data.students, institutionId).filter((s) => s.department === dept);
      const appliedCount = pool.filter((s) => data.applications.some((a) => a.institutionId === institutionId && a.studentId === s.id)).length;
      out[dept] = {
        studentCount: pool.length,
        avgReadiness: readinessByDept[dept]?.avgReadiness ?? null,
        applicationRatePct: pool.length ? +((100 * appliedCount) / pool.length).toFixed(1) : null,
        interviewConversionPct: conv.ratesPct[dept] ?? null,
      };
    }
    return out;
  },
};

// ----------------------------------------------------------- communication
const _deliveryLedger = new Map(); // messageId -> delivery record (simulates a durable send log)

const communication = {
  findAudience({ institutionId, driveId, minReadiness }) {
    return applications.unappliedEligible({ institutionId, driveId, minReadiness });
  },

  prepareMessage({ institutionId, driveId, minReadiness }) {
    const drive = drives.get({ institutionId, driveId });
    const audience = applications.unappliedEligible({ institutionId, driveId, minReadiness });
    if (!drive) return null;
    const company = companies.get({ institutionId, companyId: drive.companyId });
    const deadline = new Date(drive.applicationDeadline);
    const hoursLeft = (deadline.getTime() - Date.now()) / 3600000;
    const timeLabel = hoursLeft <= 20
      ? `today at ${deadline.toLocaleString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}`
      : `on ${deadline.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
    const body =
      `Reminder: applications for ${company?.name || 'this drive'} (${drive.role}) close ${timeLabel}. ` +
      `You are eligible but haven't applied yet — apply now to be considered.`;
    return {
      draft: {
        channel: 'in_app',
        driveId,
        recipientCount: audience.count,
        recipientStudentIds: audience.items.map((s) => s.id),
        body,
      },
    };
  },

  send({ institutionId, driveId, recipientStudentIds, body }) {
    const id = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    // Deterministic: the last 2 recipients (if there are at least 2) fail
    // delivery, so the demo's "N delivered, 2 failed" is a real count of a
    // real per-recipient delivery array, not a narrated number.
    const results = recipientStudentIds.map((studentId, idx) => ({
      studentId,
      delivered: idx < recipientStudentIds.length - Math.min(2, recipientStudentIds.length),
    }));
    const delivered = results.filter((r) => r.delivered).length;
    const failed = results.length - delivered;
    const record = { id, institutionId, driveId, body, sentAt: new Date().toISOString(), total: results.length, delivered, failed, results };
    _deliveryLedger.set(id, record);
    return record;
  },

  status({ messageId }) {
    return _deliveryLedger.get(messageId) || null;
  },
};

// ----------------------------------------------------------------- policy
const policy = {
  active({ institutionId }) {
    return data.policies.active.institutionId === institutionId ? data.policies.active : null;
  },
  aiActionPolicy({ institutionId }) {
    const p = policy.active({ institutionId });
    return p ? p.aiActionPolicy : null;
  },
};

// ------------------------------------------------------------ data quality
const dataQuality = {
  summary({ institutionId }) {
    const joining = data.joiningRecords.filter((j) => j.institutionId === institutionId);
    const unverified = joining.filter((j) => !j.verified);
    return {
      unverifiedJoiningRecords: unverified.length,
      totalJoiningRecords: joining.length,
      asOf: new Date().toISOString(),
      issues: unverified.length > 0 ? [`${unverified.length} joining record(s) are recorded but not yet verified — placement figures that include them should be treated as provisional.`] : [],
    };
  },
  criticalIssues({ institutionId }) {
    const s = dataQuality.summary({ institutionId });
    return { critical: s.unverifiedJoiningRecords >= 5 ? s.issues : [], summary: s };
  },
};

module.exports = { students, companies, drives, applications, interviews, offers, training, readiness, reports, communication, policy, dataQuality };
