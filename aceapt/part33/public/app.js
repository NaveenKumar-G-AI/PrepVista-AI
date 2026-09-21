'use strict';

const STUDENT_ID = 'student_demo_1'; // single-user demo - no auth layer in this build

const state = { selectedOpportunityId: null };

// ---------- API helpers ----------
async function api(path, options = {}) {
  const res = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}
const get = (path) => api(path);
const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body || {}) });

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str === null || str === undefined ? '' : String(str);
  return d.innerHTML;
}

function fmtDays(days) {
  if (days === null || days === undefined) return 'No deadline set';
  if (days < 0) return 'Deadline passed';
  if (days < 1) return 'Due today';
  const n = Math.ceil(days);
  return `${n} day${n === 1 ? '' : 's'} left`;
}

const ACTION_LABELS = {
  APPLY_NOW: 'Apply now', PREPARE_AND_APPLY: 'Prepare + apply', PREPARE_FIRST: 'Prepare first',
  WATCH: 'Watch', NOT_RECOMMENDED: 'Not recommended', VERIFY_ELIGIBILITY: 'Verify eligibility',
};
const fmtAction = (a) => ACTION_LABELS[a] || a;
const chip = (text, cls) => `<span class="chip ${cls}">${text}</span>`;

// ---------- Journey strip ----------
async function refreshJourneyStrip() {
  const el = document.getElementById('journeyStrip');
  try {
    const [journey, patterns] = await Promise.all([
      get(`/api/students/${STUDENT_ID}/opportunity-history`),
      get(`/api/students/${STUDENT_ID}/patterns`),
    ]);
    const c = journey.counts;
    let html = `<div class="journey-strip">
      <div class="journey-title">Your journey</div>
      <div class="journey-row"><span>Applied</span><span>${c.applied}</span></div>
      <div class="journey-row"><span>Assessments</span><span>${c.assessments}</span></div>
      <div class="journey-row"><span>Interviews</span><span>${c.interviews}</span></div>
      <div class="journey-row"><span>Selected</span><span>${c.selected}</span></div>`;
    if (patterns.bottlenecks.length) html += `<div class="journey-bottleneck">${escapeHtml(patterns.bottlenecks[0].message)}</div>`;
    if (patterns.strength) html += `<div class="journey-bottleneck" style="color:var(--teal);">${escapeHtml(patterns.strength.message)}</div>`;
    html += `</div>`;
    el.innerHTML = html;
  } catch (_err) { el.innerHTML = ''; }
}

// ---------- Queue ----------
async function refreshQueue() {
  const el = document.getElementById('queueTiers');
  let queue;
  try { queue = await get(`/api/students/${STUDENT_ID}/opportunities`); } catch (_err) {
    el.innerHTML = '<p class="empty-rail-note">Could not load the queue yet.</p>';
    return;
  }
  const tiers = [
    ['priority1', 'Priority 1 — act now'],
    ['priority2', 'Priority 2 — strong fit'],
    ['priority3', 'Priority 3 — needs prep'],
    ['watch', 'Watch'],
  ];
  const nonEmpty = tiers.filter(([key]) => queue[key] && queue[key].length > 0);
  if (nonEmpty.length === 0) {
    el.innerHTML = '<p class="empty-rail-note">No opportunities analyzed yet. Seed the demo or add one above.</p>';
    return;
  }
  el.innerHTML = nonEmpty.map(([key, label]) => `
    <div class="tier-label">${label}</div>
    ${queue[key].map(queueCardHtml).join('')}
  `).join('');

  nonEmpty.forEach(([key]) => {
    queue[key].forEach((row) => {
      const cardEl = document.getElementById(`qc-${row.opportunity.id}`);
      if (cardEl) cardEl.addEventListener('click', () => openCaseFile(row.opportunity.id));
    });
  });
}

function queueCardHtml(row) {
  const { opportunity, analysis } = row;
  const selected = state.selectedOpportunityId === opportunity.id ? 'selected' : '';
  return `
    <div class="queue-card ${selected}" id="qc-${opportunity.id}">
      <div class="qc-title">${escapeHtml(opportunity.title)}</div>
      <div class="qc-org">${escapeHtml(opportunity.organization)}</div>
      <div class="qc-meta">
        ${chip(analysis.match.overallFit.band, `chip-fit-${analysis.match.overallFit.band}`)}
        ${chip(fmtDays(analysis.recommendation.daysRemaining), `chip-urgency-${analysis.recommendation.urgency}`)}
      </div>
    </div>`;
}

// ---------- Case file ----------
async function openCaseFile(opportunityId) {
  state.selectedOpportunityId = opportunityId;
  document.getElementById('emptyState').classList.add('hidden');
  const content = document.getElementById('caseFileContent');
  content.classList.remove('hidden');
  content.innerHTML = '<div class="cf-section">Loading case file…</div>';

  try {
    const [raw, analyzeResult, application] = await Promise.all([
      get(`/api/opportunities/${opportunityId}`),
      post(`/api/opportunities/${opportunityId}/analyze`, { studentId: STUDENT_ID }),
      get(`/api/opportunities/${opportunityId}/application/${STUDENT_ID}`),
    ]);
    renderCaseFile({ raw, analysis: analyzeResult.analysis, brief: analyzeResult.brief, application });
  } catch (err) {
    content.innerHTML = `<div class="cf-section">Could not load this opportunity's case file: ${escapeHtml(err.message)}</div>`;
  }
  refreshQueue();
}

function renderCaseFile({ raw, analysis, brief, application }) {
  const { opportunity, requirements } = raw;
  const content = document.getElementById('caseFileContent');

  const requiredText = requirements.filter((r) => r.requirementType === 'required').map((r) => r.sourceText).join(', ') || 'Not specified';
  const preferredText = requirements.filter((r) => r.requirementType === 'preferred').map((r) => r.sourceText).join(', ') || 'Not specified';

  content.innerHTML = `
    <div class="cf-header">
      <div class="cf-title">${escapeHtml(opportunity.title)}</div>
      <div class="cf-org">${escapeHtml(opportunity.organization)}${opportunity.location ? ' · ' + escapeHtml(opportunity.location) : ''}</div>
      <div class="cf-meta-row">
        ${chip(brief.fit.band + ' fit', `chip-fit-${brief.fit.band}`)}
        ${chip(brief.eligibility.state.replace(/_/g, ' '), `chip-eligibility-${brief.eligibility.state}`)}
        ${chip(fmtDays(brief.daysRemaining), `chip-urgency-${analysis.recommendation.urgency}`)}
      </div>
    </div>

    <div class="cf-section">
      <div class="cf-section-title">Source vs. ACEAPT intelligence</div>
      <div class="source-vs-intel">
        <div>
          <div class="svi-col-label">What the source states</div>
          <div class="svi-source">Required: ${escapeHtml(requiredText)}
Preferred: ${escapeHtml(preferredText)}
Eligibility: ${escapeHtml(opportunity.eligibilityText || 'Not specified')}
Deadline: ${opportunity.deadline ? new Date(opportunity.deadline).toLocaleDateString() : 'Not specified'}</div>
        </div>
        <div>
          <div class="svi-col-label">What ACEAPT concludes</div>
          <div class="svi-intel">
            <strong>${escapeHtml(brief.strongestMatch || '—')}</strong> is your strongest match.<br>
            <strong>${escapeHtml(brief.primaryGap || '—')}</strong> is your primary gap.
          </div>
        </div>
      </div>
    </div>

    <div class="cf-section">
      <div class="cf-section-title">Eligibility</div>
      <ul class="reason-list">${analysis.eligibility.reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>
    </div>

    <div class="cf-section">
      <div class="cf-section-title">Your fit, by dimension</div>
      <div class="dim-grid">${Object.entries(analysis.match.dimensions).map(([key, dim]) => dimHtml(key, dim)).join('')}</div>
    </div>

    <div class="cf-section">
      <div class="cf-section-title">Gaps</div>
      <div class="gap-columns">
        <div>
          <div class="gap-col-title">Target gap (general prep)</div>
          ${gapListHtml(analysis.gaps.targetGaps)}
        </div>
        <div>
          <div class="gap-col-title">Opportunity gap (this posting)</div>
          ${gapListHtml(analysis.gaps.opportunityGaps)}
        </div>
      </div>
      ${analysis.gaps.preferred.length ? `<div class="preferred-note">Preferred, not required: ${analysis.gaps.preferred.map((p) => escapeHtml(p.label)).join(', ')} — never treated as a "must".</div>` : ''}
    </div>

    <div class="cf-section">
      <div class="cf-section-title">Recommendation</div>
      <div class="stamp-wrap">
        <div class="stamp stamp-${analysis.recommendation.action}">${fmtAction(analysis.recommendation.action)}</div>
        <div class="stamp-note">${analysis.recommendation.explanation ? escapeHtml(analysis.recommendation.explanation) : analysis.recommendation.reasons.map(escapeHtml).join(' ')}</div>
      </div>
    </div>

    <div class="cf-section">
      <div class="cf-section-title">Action plan</div>
      <div id="planArea"><button class="btn btn-primary btn-small" id="genPlanBtn">Generate action plan</button></div>
    </div>

    <div class="cf-section">
      <div class="cf-section-title">Application</div>
      <div id="applicationArea"></div>
    </div>

    <div class="cf-section">
      <div class="cf-section-title">Record an outcome</div>
      <form id="outcomeForm" class="outcome-form">
        <select name="stageReached" required>
          <option value="applied">Applied</option>
          <option value="assessment" selected>Assessment</option>
          <option value="interview">Interview</option>
          <option value="final_stage">Final stage</option>
        </select>
        <select name="outcome" required>
          <option value="rejected" selected>Rejected</option>
          <option value="selected">Selected</option>
          <option value="withdrawn">Withdrawn</option>
          <option value="unknown">Unknown</option>
        </select>
        <input name="skillTag" placeholder="Skill involved (optional, e.g. timed_technical_application)">
        <textarea name="feedback" placeholder="Any feedback you received (optional)"></textarea>
        <button type="submit" class="btn btn-small">Record outcome</button>
      </form>
      <div id="outcomeResult"></div>
    </div>`;

  document.getElementById('genPlanBtn').addEventListener('click', () => generatePlan(opportunity.id));
  renderApplicationTracker(opportunity.id, application);

  document.getElementById('outcomeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target).entries());
    if (!body.skillTag) delete body.skillTag;
    if (!body.feedback) delete body.feedback;
    try {
      const result = await post(`/api/opportunities/${opportunity.id}/outcome`, { studentId: STUDENT_ID, ...body });
      let html = '<div class="note-banner">Outcome recorded.</div>';
      if (result.patterns.bottlenecks.length) html += `<div class="note-banner">${escapeHtml(result.patterns.bottlenecks[0].message)}</div>`;
      document.getElementById('outcomeResult').innerHTML = html;
      refreshJourneyStrip();
    } catch (err) {
      document.getElementById('outcomeResult').innerHTML = `<div class="tracker-error">${escapeHtml(err.message)}</div>`;
    }
  });
}

function dimHtml(key, dim) {
  const labels = { targetAlignment: 'Target alignment', capabilityMatch: 'Capability match', evidenceMatch: 'Evidence match', readiness: 'Readiness', timelineFit: 'Timeline' };
  const pct = typeof dim.score === 'number' ? Math.max(0, Math.min(100, dim.score)) : 0;
  return `
    <div class="dim-item">
      <div class="dim-label">${labels[key] || key}</div>
      <div class="dim-value">${dim.band}</div>
      <div class="dim-bar"><div class="dim-bar-fill" style="width:${pct}%"></div></div>
    </div>`;
}

function gapListHtml(rows) {
  if (!rows || rows.length === 0) return '<p class="preferred-note">No gap detected here.</p>';
  return rows.map((r) => `
    <div class="gap-row">
      <span>${escapeHtml(r.label)}</span>
      <span class="gap-sev gap-sev-${r.capabilityGap || (r.evidenceGap ? 'moderate' : 'none')}">${r.capabilityGap ? r.capabilityGap + ' gap' : (r.evidenceGap ? 'evidence gap' : 'ok')}</span>
    </div>`).join('');
}

async function generatePlan(opportunityId) {
  const area = document.getElementById('planArea');
  area.innerHTML = 'Generating…';
  try {
    const plan = await post(`/api/opportunities/${opportunityId}/action-plan`, { studentId: STUDENT_ID });
    renderPlan(opportunityId, plan);
  } catch (err) {
    area.innerHTML = `<div class="tracker-error">${escapeHtml(err.message)}</div>`;
  }
}

function renderPlan(opportunityId, plan) {
  const area = document.getElementById('planArea');
  area.innerHTML = `
    <ul class="plan-list">
      ${plan.items.map((item) => `
        <li class="plan-item ${item.status === 'done' ? 'done' : ''}" data-order="${item.order}">
          <div class="plan-check" role="checkbox" aria-checked="${item.status === 'done'}" tabindex="0">${item.status === 'done' ? '✓' : ''}</div>
          <div>
            <div class="plan-item-title">${item.order}. ${escapeHtml(item.title)}</div>
            <div class="plan-item-desc">${escapeHtml(item.description)}</div>
          </div>
          <div class="plan-item-time">~${item.estMinutes} min</div>
        </li>`).join('')}
    </ul>
    <div class="plan-total">Total ~${plan.totalEstMinutes} min against a budget of ~${plan.budgetMinutes} min</div>`;

  area.querySelectorAll('.plan-item').forEach((li) => {
    const toggle = async () => {
      const order = parseInt(li.dataset.order, 10);
      try {
        const updated = await post(`/api/opportunities/${opportunityId}/action-plan/${STUDENT_ID}/items/${order}/complete`, {});
        renderPlan(opportunityId, updated);
      } catch (_err) { /* non-critical */ }
    };
    const box = li.querySelector('.plan-check');
    box.addEventListener('click', toggle);
    box.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  });
}

const TRACKER_BUTTONS = [
  ['REVIEWED', 'Reviewed'], ['ELIGIBILITY_CHECKED', 'Eligibility checked'], ['READY', 'Ready'],
  ['APPLIED', 'Applied'], ['ASSESSMENT', 'Assessment'], ['INTERVIEW', 'Interview'],
  ['FINAL_STAGE', 'Final stage'], ['SELECTED', 'Selected'], ['REJECTED', 'Rejected'], ['WITHDRAWN', 'Withdraw'],
];

function renderApplicationTracker(opportunityId, application) {
  const area = document.getElementById('applicationArea');
  area.innerHTML = `
    <div class="status-row">
      <span class="status-current">${application.status.replace(/_/g, ' ')}</span>
      <div class="status-buttons">${TRACKER_BUTTONS.map(([value, label]) => `<button class="btn btn-small" data-status="${value}">${label}</button>`).join('')}</div>
    </div>
    <div id="trackerError"></div>`;

  area.querySelectorAll('[data-status]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const updated = await post(`/api/opportunities/${opportunityId}/application`, { studentId: STUDENT_ID, status: btn.dataset.status });
        renderApplicationTracker(opportunityId, updated);
      } catch (err) {
        const msg = err.body && err.body.from ? `Can't go from ${err.body.from.replace(/_/g, ' ')} to ${err.body.to.replace(/_/g, ' ')} directly.` : err.message;
        document.getElementById('trackerError').innerHTML = `<div class="tracker-error">${escapeHtml(msg)}</div>`;
      }
    });
  });
}

// ---------- Top-level actions ----------
document.getElementById('seedBtn').addEventListener('click', async () => {
  const btn = document.getElementById('seedBtn');
  btn.disabled = true;
  btn.textContent = 'Seeding…';
  try {
    const result = await post('/api/demo/run', {});
    await refreshQueue();
    await refreshJourneyStrip();
    openCaseFile(result.opportunity.id);
  } catch (err) {
    alert(`Could not seed demo data: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Seed demo data';
  }
});

document.getElementById('addOppToggle').addEventListener('click', () => {
  document.getElementById('addOppForm').classList.toggle('hidden');
});

document.getElementById('addOppForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target).entries());
  if (body.deadline) body.deadline = new Date(body.deadline).toISOString();
  else delete body.deadline;
  ['requirements', 'preferredRequirements', 'eligibility'].forEach((k) => { if (!body[k]) delete body[k]; });
  body.targetId = 'target_software_developer'; // demo student's target - see src/seed/demoData.js

  try {
    const result = await post('/api/opportunities', body);
    await refreshQueue();
    document.getElementById('addOppForm').classList.add('hidden');
    e.target.reset();
    openCaseFile(result.opportunity.id);
  } catch (err) {
    alert(`Could not add that opportunity: ${err.message}`);
  }
});

// ---------- Init ----------
(async function init() {
  await refreshJourneyStrip();
  await refreshQueue();
})();
