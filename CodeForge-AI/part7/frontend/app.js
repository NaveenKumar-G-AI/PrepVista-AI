// CodeForge Assessment Workspace — vanilla JS, no framework, no build step.
// Talks to the REAL API on the same origin. The only "stub" here is
// identity (X-User-Id / X-User-Role headers) — see src/api/middleware/auth.ts
// for exactly what a real deployment replaces this with.

const state = {
  userId: localStorage.getItem('cf_user_id') || '',
  role: localStorage.getItem('cf_role') || 'student',
  currentAssessment: null,
  currentChallenges: [],
  activeChallengeId: null,
  timerHandle: null,
};

function api(path, options = {}) {
  return fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': state.userId,
      'X-User-Role': state.role,
      ...(options.headers || {}),
    },
  }).then(async (res) => {
    if (!res.ok) {
      const body = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(body.message || body.error || `HTTP ${res.status}`);
    }
    if (res.status === 204) return null;
    return res.json();
  });
}

function showError(message) {
  const content = document.getElementById('content');
  const banner = document.createElement('div');
  banner.className = 'error-banner';
  banner.textContent = message;
  content.prepend(banner);
  setTimeout(() => banner.remove(), 6000);
}

// ---- identity ----------------------------------------------------------
document.getElementById('signInBtn').addEventListener('click', () => {
  state.userId = document.getElementById('userIdInput').value.trim();
  state.role = document.getElementById('roleSelect').value;
  localStorage.setItem('cf_user_id', state.userId);
  localStorage.setItem('cf_role', state.role);
  loadHome();
});

document.getElementById('createBtn').addEventListener('click', async () => {
  try {
    const roleId = document.getElementById('newRoleId').value.trim();
    const assessment = await api('/api/assessments', {
      method: 'POST',
      body: JSON.stringify({
        roleId,
        blueprintName: 'Software Engineer Coding Readiness',
        assessmentType: document.getElementById('newType').value,
        purpose: document.getElementById('newPurpose').value,
        language: 'python',
        durationMinutes: 45,
      }),
    });
    await openAssessment(assessment.id);
    loadAssessmentList();
  } catch (err) {
    showError('Could not create assessment: ' + err.message);
  }
});

// ---- home / list ----------------------------------------------------------
async function loadHome() {
  document.getElementById('userIdInput').value = state.userId;
  document.getElementById('roleSelect').value = state.role;
  if (!state.userId) return;

  if (state.role === 'tpo') {
    document.getElementById('newAssessmentCard').style.display = 'none';
    renderTpoHome();
    return;
  }
  document.getElementById('newAssessmentCard').style.display = 'block';
  await loadAssessmentList();
}

async function loadAssessmentList() {
  const listEl = document.getElementById('assessmentList');
  try {
    const assessments = await api('/api/assessments');
    if (assessments.length === 0) {
      listEl.innerHTML = '<p class="muted">No assessments yet — start one below.</p>';
      return;
    }
    listEl.innerHTML = '';
    for (const a of assessments) {
      const el = document.createElement('button');
      el.className = 'assessment-item';
      el.innerHTML = `<span class="type">${a.assessment_type}</span><span class="status">${a.status}</span><br/>${escapeHtml(a.purpose)}`;
      el.addEventListener('click', () => openAssessment(a.id));
      listEl.appendChild(el);
    }
  } catch (err) {
    listEl.innerHTML = `<p class="muted">Could not load assessments: ${escapeHtml(err.message)}</p>`;
  }
}

// ---- TPO home ---------------------------------------------------------
async function renderTpoHome() {
  const content = document.getElementById('content');
  content.innerHTML = `
    <h2>Cohort readiness report</h2>
    <p class="muted">Aggregate only — built entirely from RLS-scoped rows your session can see, never from raw submissions.</p>
    <div style="margin:12px 0;"><input id="roleIdForCohort" placeholder="role id" style="width:340px; background:var(--bg-raised); border:1px solid var(--border); border-radius:6px; padding:6px 8px;" />
    <button class="primary" id="loadCohortBtn">Load</button></div>
    <div id="cohortOutput"></div>
  `;
  document.getElementById('loadCohortBtn').addEventListener('click', async () => {
    const roleId = document.getElementById('roleIdForCohort').value.trim();
    try {
      const report = await api('/api/cohort-report?role_id=' + encodeURIComponent(roleId));
      document.getElementById('cohortOutput').innerHTML = `
        <div class="card">
          <p>Students with a readiness result: <strong>${report.students_with_readiness_result}</strong></p>
          <p>Completed: <strong>${report.completion.completed}</strong> / ${report.completion.total_assessments}</p>
          <h3 style="margin-top:14px;">Readiness distribution</h3>
          <pre style="font-family:var(--font-mono);font-size:12.5px;background:var(--bg-raised);padding:10px;border-radius:6px;">${escapeHtml(JSON.stringify(report.readiness_distribution, null, 2))}</pre>
          <h3 style="margin-top:14px;">Competency gap ranking</h3>
          ${report.competency_gap_ranking.map((g) => `<div class="test-row"><span>${escapeHtml(g.skill_name)}</span><span class="muted">${g.gap_count}/${g.total} weak or developing</span></div>`).join('')}
        </div>`;
    } catch (err) {
      showError(err.message);
    }
  });
}

// ---- workspace ----------------------------------------------------------
async function openAssessment(id) {
  try {
    state.currentAssessment = await api(`/api/assessments/${id}`);
    state.currentChallenges = await api(`/api/assessments/${id}/challenges`);
    state.activeChallengeId = state.currentChallenges[0]?.id || null;
    renderWorkspace();
    startTimerLoop();
  } catch (err) {
    showError('Could not open assessment: ' + err.message);
  }
}

function renderWorkspace() {
  const a = state.currentAssessment;
  const content = document.getElementById('content');
  const isAssessmentMode = a.assistance_level === 'none' || ['role_readiness', 'placement_assessment', 'interview_simulation'].includes(a.assessment_type);
  const modeClass = isAssessmentMode ? 'assessment' : 'practice';
  const modeLabel = isAssessmentMode ? 'Assessment mode' : 'Practice-assisted mode';

  content.innerHTML = `
    <div class="mode-bar ${modeClass}">
      <span class="mode-badge">${modeLabel}</span>
      <span class="muted">${escapeHtml(a.purpose)}</span>
      <span class="timer" id="timerDisplay">--:--</span>
      <span class="timer-caption">server-enforced — this is a display only</span>
    </div>
    <div class="workspace-grid">
      <div>
        <h2 style="margin-bottom:10px;">Challenges</h2>
        <div id="challengeListEl"></div>
      </div>
      <div id="challengePane"></div>
    </div>
  `;

  const listEl = document.getElementById('challengeListEl');
  for (const ch of state.currentChallenges) {
    const item = document.createElement('div');
    item.className = 'challenge-list-item' + (ch.id === state.activeChallengeId ? ' active' : '');
    item.innerHTML = `<span>${escapeHtml(ch.title)} <span class="skill">${ch.skill_name}</span></span>${ch.submission_id ? `<span class="badge-done">${ch.tests_passed}/${ch.tests_total}</span>` : ''}`;
    item.addEventListener('click', () => {
      state.activeChallengeId = ch.id;
      renderWorkspace();
    });
    listEl.appendChild(item);
  }

  renderChallengePane();
}

function renderChallengePane() {
  const ch = state.currentChallenges.find((c) => c.id === state.activeChallengeId);
  const pane = document.getElementById('challengePane');
  if (!ch) {
    pane.innerHTML = '<p class="muted">No challenges.</p>';
    return;
  }
  const alreadySubmitted = !!ch.submission_id;
  pane.innerHTML = `
    <div class="problem card">
      <h3>${escapeHtml(ch.title)}</h3>
      <div style="margin:6px 0 10px;">
        <span class="pill">${ch.language}</span>
        ${ch.is_unseen ? '<span class="pill unseen">unseen</span>' : ''}
        ${ch.is_transfer_probe ? '<span class="pill transfer">transfer probe</span>' : ''}
      </div>
      <pre>${escapeHtml(ch.statement)}</pre>
    </div>
    <div class="editor-toolbar">
      <button class="secondary" id="hintBtn" ${alreadySubmitted ? 'disabled' : ''}>Request hint</button>
      <span class="muted" id="hintNote"></span>
    </div>
    <textarea class="editor" id="codeEditor" ${alreadySubmitted ? 'readonly' : ''}>${escapeHtml(ch.starter_code || '')}</textarea>
    <div class="editor-toolbar">
      <button class="primary" id="submitBtn" ${alreadySubmitted ? 'disabled' : ''}>${alreadySubmitted ? 'Already submitted' : 'Submit'}</button>
    </div>
    <div id="resultsPane"></div>
  `;

  document.getElementById('hintBtn').addEventListener('click', async () => {
    try {
      await api(`/api/assessments/${state.currentAssessment.id}/challenges/${ch.id}/hint`, {
        method: 'POST',
        body: JSON.stringify({ hint_level: 1 }),
      });
      document.getElementById('hintNote').textContent = 'Hint recorded — this affects your independence score.';
    } catch (err) {
      showError(err.message);
    }
  });

  document.getElementById('submitBtn').addEventListener('click', async () => {
    const code = document.getElementById('codeEditor').value;
    try {
      const outcome = await api(`/api/assessments/${state.currentAssessment.id}/challenges/${ch.id}/submit`, {
        method: 'POST',
        body: JSON.stringify({ language: ch.language, code, idempotency_key: 'ui-' + Date.now() }),
      });
      await refreshResultsPane(outcome.submission.id);
      state.currentChallenges = await api(`/api/assessments/${state.currentAssessment.id}/challenges`);
      renderWorkspace();
      if (outcome.finalized) {
        renderReport(outcome.finalized);
      }
    } catch (err) {
      showError(err.message);
    }
  });

  if (alreadySubmitted) refreshResultsPane(ch.submission_id);
}

async function refreshResultsPane(submissionId) {
  try {
    const results = await api(`/api/submissions/${submissionId}/results`);
    const pane = document.getElementById('resultsPane');
    if (!pane) return;
    pane.innerHTML =
      '<div class="card">' +
      results
        .map(
          (r) =>
            `<div class="test-row"><span class="dot ${r.passed ? 'pass' : 'fail'}"></span> test ${r.test_index + 1}: ${r.passed ? 'passed' : `expected "${escapeHtml(r.expected_output)}", got "${escapeHtml(r.actual_output)}"`}</div>`
        )
        .join('') +
      '</div>';
  } catch {
    /* not fatal — results pane just stays empty */
  }
}

function renderReport(finalized) {
  const content = document.getElementById('content');
  const report = finalized.readiness;
  const readinessState = report.computation.readiness_state;
  const conf = report.computation.readiness_confidence;
  const rows = report.computation.reasons
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r.skill_name || r.skill_id)}</td><td><span class="level-tag level-${r.performance_level}">${r.performance_level.replace(/_/g, ' ')}</span></td><td>${r.gate_met ? 'yes' : 'no'}</td></tr>`
    )
    .join('');
  const banner = document.createElement('div');
  banner.className = 'card';
  banner.innerHTML = `
    <div class="readiness-hero">
      <span class="readiness-state">${readinessState.replace(/_/g, ' ')}</span>
      <span class="confidence-tag">confidence: ${conf}</span>
    </div>
    <table class="skills"><thead><tr><th>Skill</th><th>Level</th><th>Gate met</th></tr></thead><tbody>${rows}</tbody></table>
  `;
  content.prepend(banner);
}

// ---- timer (display only — see mode-bar caption) ------------------------
function startTimerLoop() {
  if (state.timerHandle) clearInterval(state.timerHandle);
  const tick = async () => {
    const a = state.currentAssessment;
    const el = document.getElementById('timerDisplay');
    if (!el) return;
    if (!a.expires_at) {
      el.textContent = '—';
      return;
    }
    const remainingMs = new Date(a.expires_at).getTime() - Date.now();
    if (remainingMs <= 0) {
      el.textContent = '00:00';
      el.className = 'timer low';
      // Re-fetch once to pick up the server's real EXPIRED transition.
      state.currentAssessment = await api(`/api/assessments/${a.id}`).catch(() => a);
      return;
    }
    const mins = Math.floor(remainingMs / 60000);
    const secs = Math.floor((remainingMs % 60000) / 1000);
    el.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    el.className = 'timer' + (remainingMs < 60000 ? ' low' : remainingMs < 5 * 60000 ? ' mid' : '');
  };
  tick();
  state.timerHandle = setInterval(tick, 1000);
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

loadHome();
