const { daysBetween } = require('../utils');

const ACTIVE_PROGRESSING_STAGES = ['ASSESSMENT', 'RECRUITER_CONTACT', 'INTERVIEW_1', 'INTERVIEW_2', 'FINAL_ROUND'];
const CLOSED_STAGES = ['OFFER', 'REJECTED', 'WITHDRAWN', 'CLOSED'];

// Per spec section 46: never silently classify no-response as rejection.
function computeResponsivenessState(app) {
  if (CLOSED_STAGES.includes(app.stage)) return 'CLOSED';
  if (ACTIVE_PROGRESSING_STAGES.includes(app.stage)) return 'WAITING';
  if (app.stage !== 'APPLIED') return 'WAITING';
  if (!app.applied_date) return 'WAITING';

  const days = daysBetween(app.applied_date);
  const interval = app.followup_interval_days || 7;
  if (days < interval) return 'WAITING';
  if (days < interval * 3) return 'FOLLOW_UP_RECOMMENDED';
  if (days < interval * 6) return 'NO_RESPONSE';
  return 'POSSIBLY_INACTIVE';
}

function getFollowUpReason(state) {
  switch (state) {
    case 'FOLLOW_UP_RECOMMENDED':
      return 'No update since you applied -- a short, polite follow-up is reasonable at this point.';
    case 'NO_RESPONSE':
      return "It's been a while with no response. One more follow-up is reasonable before treating this as inactive.";
    case 'POSSIBLY_INACTIVE':
      return 'A long time has passed with no response. This opportunity may no longer be active.';
    default:
      return null;
  }
}

function buildFollowUpDraft({ role, company, applied_date }) {
  const days = applied_date ? daysBetween(applied_date) : null;
  return `Hi, I wanted to follow up on my application for the ${role || 'role'}${company ? ` at ${company}` : ''}${days !== null ? ` (submitted ${days} day${days === 1 ? '' : 's'} ago)` : ''}. I'm still very interested and happy to share any additional information that would help. Thank you for your time.`;
}

// Scans every application that isn't closed and returns follow-ups that
// should exist but don't yet, so the caller can insert them.
function findDueFollowUps(applications, opportunitiesById, existingByAppId) {
  const due = [];
  for (const app of applications) {
    const state = computeResponsivenessState(app);
    if (state !== 'FOLLOW_UP_RECOMMENDED' && state !== 'NO_RESPONSE') continue;
    if (existingByAppId.has(app.id)) continue; // already has a pending followup
    const opp = opportunitiesById.get(app.opportunity_id) || {};
    due.push({
      application_id: app.id,
      due_date: new Date().toISOString().slice(0, 10),
      reason: getFollowUpReason(state),
      channel: 'Company careers portal or recruiter email',
      message_draft: buildFollowUpDraft({ role: opp.role, company: opp.company, applied_date: app.applied_date }),
    });
  }
  return due;
}

module.exports = { computeResponsivenessState, getFollowUpReason, buildFollowUpDraft, findDueFollowUps };
