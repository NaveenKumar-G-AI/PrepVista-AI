// PrepVista Part 11 dashboard. Plain JS, no build step, no framework.
// Every number and row on screen comes from a real fetch() to the Express
// API in this same project — nothing here is hardcoded or simulated.

const state = { token: localStorage.getItem('pv_token'), user: null };

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => (el.style.display = 'none'), 3200);
}

async function api(path, options = {}) {
  const res = await fetch('/api' + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (res.status === 204) return null;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = body?.error?.message || `Request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return body;
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Auth ----------

async function tryResumeSession() {
  if (!state.token) return showLogin();
  try {
    state.user = await api('/me');
    showApp();
  } catch {
    localStorage.removeItem('pv_token');
    state.token = null;
    showLogin();
  }
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errBox = document.getElementById('login-error');
  errBox.style.display = 'none';
  try {
    const result = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    state.token = result.token;
    localStorage.setItem('pv_token', state.token);
    state.user = await api('/me');
    showApp();
  } catch (err) {
    errBox.textContent = err.message;
    errBox.style.display = 'block';
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  try { await api('/auth/logout', { method: 'POST' }); } catch {}
  localStorage.removeItem('pv_token');
  state.token = null;
  state.user = null;
  showLogin();
});

function showLogin() {
  document.getElementById('login-view').style.display = 'flex';
  document.getElementById('app-view').style.display = 'none';
}

function showApp() {
  document.getElementById('login-view').style.display = 'none';
  document.getElementById('app-view').style.display = 'block';
  document.getElementById('who-name').textContent = state.user.name;
  document.getElementById('who-role').textContent = state.user.role.replace(/_/g, ' ');
  loadView('dashboard');
}

// ---------- Tabs ----------

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    tab.classList.add('active');
    const view = tab.dataset.view;
    document.getElementById('view-' + view).classList.add('active');
    loadView(view);
  });
});

function loadView(name) {
  const loaders = {
    dashboard: loadDashboard, users: loadUsers, audit: loadAudit,
    dataquality: loadDataQuality, policies: loadPolicies, sessions: loadSessions, system: loadSystem,
  };
  loaders[name]?.().catch((err) => toast(err.message));
}

// ---------- Dashboard ----------

async function loadDashboard() {
  const [users, dq, sessions, audit, policies] = await Promise.all([
    api('/admin/users').catch(() => []),
    api('/admin/data-quality').catch(() => null),
    api('/sessions').catch(() => []),
    api('/admin/audit?pageSize=8').catch(() => ({ events: [] })),
    api('/admin/policies').catch(() => []),
  ]);

  const activeUsers = users.filter((u) => u.status === 'ACTIVE').length;
  const cards = [
    { label: 'Active users', value: activeUsers, sub: `${users.length} total accounts`, cls: '' },
    { label: 'Data quality issues', value: dq ? dq.issues.length : '—', sub: dq ? `${dq.completenessScore}% completeness` : 'no permission', cls: dq && dq.counts.CRITICAL > 0 ? 'critical' : dq && dq.issues.length > 0 ? 'warn' : 'good' },
    { label: 'My active sessions', value: sessions.length, sub: 'across all your devices', cls: '' },
    { label: 'Active policies', value: Array.isArray(policies) ? policies.length : '—', sub: 'versioned, never overwritten', cls: '' },
  ];
  document.getElementById('dashboard-cards').innerHTML = cards.map(cardHtml).join('');
  document.querySelectorAll('#dashboard-cards .card')[1]?.addEventListener('click', () => document.querySelector('[data-view="dataquality"]').click());

  const recentBox = document.getElementById('dashboard-recent-audit');
  recentBox.innerHTML = audit.events.length
    ? audit.events.map((e) => `<div class="issue-row"><div class="seal seal-sm">${sealGlyph(e.action)}</div><div class="issue-body"><div class="issue-reason">${escapeHtml(e.action)} <span class="muted">· ${escapeHtml(e.entityType)}</span></div><div class="issue-meta">${escapeHtml(e.actorName || 'system')} · ${fmtDate(e.createdAt)}</div></div></div>`).join('')
    : `<div class="empty-state">No activity yet.</div>`;

  const issuesBox = document.getElementById('dashboard-top-issues');
  const topIssues = dq ? dq.issues.slice(0, 5) : [];
  issuesBox.innerHTML = topIssues.length
    ? topIssues.map(issueRowHtml).join('')
    : `<div class="empty-state">${dq ? 'No open issues.' : 'You do not have data_quality.read.'}</div>`;
}

function cardHtml(c) {
  return `<div class="card ${c.cls}"><div class="card-label">${c.label}</div><div class="card-value">${c.value}</div><div class="card-sub">${c.sub}</div></div>`;
}

function sealGlyph(action) {
  if (action.includes('failed') || action.includes('locked')) return '!';
  if (action.includes('changed') || action.includes('revoked')) return '~';
  return '✓';
}

// ---------- Users ----------

async function loadUsers() {
  const users = await api('/admin/users');
  const tbody = document.getElementById('users-tbody');
  tbody.innerHTML = users.length ? users.map((u) => `
    <tr>
      <td>${escapeHtml(u.name)}</td>
      <td class="mono-cell">${escapeHtml(u.email)}</td>
      <td>${escapeHtml((u.role || '').replace(/_/g, ' '))}${u.department ? ` <span class="muted">· ${escapeHtml(u.department)}</span>` : ''}</td>
      <td><span class="badge badge-${u.status.toLowerCase()}">${u.status}</span></td>
      <td class="muted">${fmtDate(u.lastLoginAt)}</td>
      <td>
        ${u.status === 'ACTIVE' ? `<button class="btn btn-ghost" data-deactivate="${u.id}">Deactivate</button>` : ''}
      </td>
    </tr>`).join('') : `<tr><td colspan="6"><div class="empty-state">No users visible in your scope.</div></td></tr>`;

  tbody.querySelectorAll('[data-deactivate]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Deactivate this user? Their sessions will be revoked immediately.')) return;
      try {
        await api(`/admin/users/${btn.dataset.deactivate}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'DEACTIVATED' }) });
        toast('User deactivated.');
        loadUsers();
      } catch (err) { toast(err.message); }
    });
  });
}

document.getElementById('invite-user-btn').addEventListener('click', () => {
  document.getElementById('invite-modal-backdrop').style.display = 'flex';
});
document.getElementById('invite-cancel-btn').addEventListener('click', () => {
  document.getElementById('invite-modal-backdrop').style.display = 'none';
});
document.getElementById('invite-submit-btn').addEventListener('click', async () => {
  const name = document.getElementById('invite-name').value.trim();
  const email = document.getElementById('invite-email').value.trim();
  const roleName = document.getElementById('invite-role').value;
  try {
    await api('/admin/users/invite', { method: 'POST', body: JSON.stringify({ name, email, roleName }) });
    toast(`Invitation sent to ${email} (see /api/auth/dev/outbox in dev mode).`);
    document.getElementById('invite-modal-backdrop').style.display = 'none';
    loadUsers();
  } catch (err) { toast(err.message); }
});

// ---------- Audit ----------

async function loadAudit() {
  const mode = document.getElementById('audit-filter-mode').value;
  const action = document.getElementById('audit-filter-action').value.trim();
  const params = new URLSearchParams();
  if (action) params.set('action', action);
  const path = mode === 'security' ? '/admin/audit/security-events' : '/admin/audit';
  const res = await api(`${path}?${params.toString()}`);
  const tbody = document.getElementById('audit-tbody');
  tbody.innerHTML = res.events.length ? res.events.map((e) => `
    <tr>
      <td class="muted mono-cell">${fmtDate(e.createdAt)}</td>
      <td>${escapeHtml(e.actorName || 'system')}</td>
      <td><span class="mono-cell">${escapeHtml(e.action)}</span></td>
      <td class="muted">${escapeHtml(e.entityType)}</td>
      <td class="muted" style="max-width:260px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(e.newState || '')}</td>
    </tr>`).join('') : `<tr><td colspan="5"><div class="empty-state">No matching events.</div></td></tr>`;
}
document.getElementById('audit-refresh-btn').addEventListener('click', () => loadAudit().catch((e) => toast(e.message)));
document.getElementById('audit-filter-mode').addEventListener('change', () => loadAudit().catch((e) => toast(e.message)));

// ---------- Data quality ----------

async function loadDataQuality() {
  const dq = await api('/admin/data-quality');
  const sevCls = { CRITICAL: 'critical', HIGH: 'warn', MEDIUM: '', LOW: '' };
  document.getElementById('dq-cards').innerHTML = [
    { label: 'Completeness score', value: dq.completenessScore + '%', sub: 'weighted by severity', cls: dq.completenessScore >= 90 ? 'good' : dq.completenessScore >= 70 ? 'warn' : 'critical' },
    { label: 'Critical', value: dq.counts.CRITICAL, sub: 'blocks report publication', cls: dq.counts.CRITICAL > 0 ? 'critical' : 'good' },
    { label: 'High', value: dq.counts.HIGH, sub: '', cls: dq.counts.HIGH > 0 ? 'warn' : '' },
    { label: 'Medium + Low', value: dq.counts.MEDIUM + dq.counts.LOW, sub: '', cls: '' },
  ].map(cardHtml).join('');

  document.getElementById('dq-issues').innerHTML = dq.issues.length
    ? dq.issues.map(issueRowHtml).join('')
    : `<div class="empty-state">No open data quality issues. 🎉</div>`;
}

function issueRowHtml(i) {
  const sealCls = i.severity === 'CRITICAL' ? 'seal--critical' : i.severity === 'HIGH' ? 'seal--high' : '';
  return `<div class="issue-row">
    <div class="seal seal-sm ${sealCls}">${i.severity[0]}</div>
    <div class="issue-body">
      <div class="issue-reason">${escapeHtml(i.reason)} <span class="badge badge-${i.severity.toLowerCase()}">${i.severity}</span></div>
      <div class="issue-meta">${escapeHtml(i.entityType)} · <span class="mono-cell">${escapeHtml(i.entityId)}</span></div>
      <div class="issue-action">→ ${escapeHtml(i.suggestedAction)}</div>
    </div>
  </div>`;
}

// ---------- Policies ----------

async function loadPolicies() {
  const policies = await api('/admin/policies');
  const tbody = document.getElementById('policies-tbody');
  tbody.innerHTML = policies.length ? policies.map((p) => `
    <tr>
      <td class="mono-cell">${escapeHtml(p.key)}</td>
      <td>v${p.version}</td>
      <td class="muted">${fmtDate(p.effectiveDate)}</td>
      <td class="mono-cell">${escapeHtml(JSON.stringify(p.config))}</td>
    </tr>`).join('') : `<tr><td colspan="4"><div class="empty-state">No policies configured yet.</div></td></tr>`;
}

document.getElementById('new-policy-btn').addEventListener('click', () => {
  document.getElementById('policy-modal-backdrop').style.display = 'flex';
});
document.getElementById('policy-cancel-btn').addEventListener('click', () => {
  document.getElementById('policy-modal-backdrop').style.display = 'none';
});
document.getElementById('policy-submit-btn').addEventListener('click', async () => {
  const key = document.getElementById('policy-key').value.trim();
  const reason = document.getElementById('policy-reason').value.trim();
  let config;
  try { config = JSON.parse(document.getElementById('policy-config').value || '{}'); }
  catch { return toast('Config must be valid JSON.'); }
  try {
    await api(`/admin/policies/${encodeURIComponent(key)}`, {
      method: 'POST', body: JSON.stringify({ config, effectiveDate: new Date().toISOString(), reason }),
    });
    toast('New policy version published.');
    document.getElementById('policy-modal-backdrop').style.display = 'none';
    loadPolicies();
  } catch (err) { toast(err.message); }
});

// ---------- Sessions ----------

async function loadSessions() {
  const sessions = await api('/sessions');
  const tbody = document.getElementById('sessions-tbody');
  tbody.innerHTML = sessions.map((s) => `
    <tr>
      <td>${escapeHtml(s.userAgent || 'Unknown device')} ${s.isCurrent ? '<span class="badge badge-active">this session</span>' : ''}</td>
      <td class="muted">${fmtDate(s.createdAt)}</td>
      <td class="muted">${fmtDate(s.lastActiveAt)}</td>
      <td>${s.isCurrent ? '' : `<button class="btn btn-danger" data-revoke="${s.id}">Revoke</button>`}</td>
    </tr>`).join('');

  tbody.querySelectorAll('[data-revoke]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api(`/sessions/${btn.dataset.revoke}`, { method: 'DELETE' });
      toast('Session revoked.');
      loadSessions();
    });
  });
}

// ---------- System ----------

async function loadSystem() {
  const [health, integrations] = await Promise.all([api('/admin/system/health'), api('/admin/system/integrations')]);
  const healthRows = [
    { label: 'Database', status: health.database.status, note: health.database.latencyMs != null ? `${health.database.latencyMs}ms` : '' },
    { label: 'Queue', status: health.queue.status, note: health.queue.note },
    { label: 'Document storage', status: health.documentStorage.status, note: health.documentStorage.note },
    { label: 'Backups', status: health.backups.status, note: health.backups.note },
  ];
  document.getElementById('system-health').innerHTML = healthRows.map(statusRowHtml).join('');
  document.getElementById('system-integrations').innerHTML = integrations.map((i) => statusRowHtml({ label: i.label, status: i.status, note: '' })).join('');
}

function statusRowHtml(r) {
  const ok = r.status === 'HEALTHY' || r.status === 'CONNECTED';
  return `<div class="issue-row">
    <div class="seal seal-sm ${ok ? 'seal--ok' : ''}">${ok ? '✓' : '–'}</div>
    <div class="issue-body">
      <div class="issue-reason">${escapeHtml(r.label)} <span class="badge badge-${r.status.toLowerCase()}">${escapeHtml(r.status.replace(/_/g, ' '))}</span></div>
      ${r.note ? `<div class="issue-meta">${escapeHtml(r.note)}</div>` : ''}
    </div>
  </div>`;
}

// ---------- Init ----------
tryResumeSession();
