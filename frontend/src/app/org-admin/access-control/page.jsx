'use client';
// @ts-nocheck
import React, { useState } from 'react';

export default function AccessControlPage() {
  const [tab, setTab] = useState("dashboard");

  return (
    <div className="pv11-root">
      <style>{`
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');

:root {
  --ink-900: #020617;
  --ink-800: #0f172a;
  --ink-700: #1e293b;
  --ink-600: #334155;
  --ink-border: rgba(255,255,255,0.1);
  --paper: #f8fafc;
  --brass: #f59e0b;
  --brass-bright: #fbbf24;
  --text-primary: #f8fafc;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;
  --sig-critical: #f43f5e;
  --sig-high: #f59e0b;
  --sig-medium: #10b981;
  --sig-low: #94a3b8;
  --sig-good: #10b981;
  --font-display: 'Fraunces', Georgia, serif;
  --font-body: 'IBM Plex Sans', system-ui, sans-serif;
  --font-mono: 'IBM Plex Mono', 'SF Mono', monospace;
  --radius: 10px;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: transparent;
  background-image:
    radial-gradient(ellipse 900px 500px at 10% -10%, rgba(201, 162, 75, 0.06), transparent),
    radial-gradient(ellipse 700px 500px at 100% 0%, rgba(79, 184, 166, 0.05), transparent);
  color: var(--text-primary);
  font-family: var(--font-body);
  min-height: 100vh;
}

h1, h2, h3 { font-family: var(--font-display); font-weight: 600; margin: 0; letter-spacing: -0.01em; }
code, .mono { font-family: var(--font-mono); }

/* ---------- Login ---------- */
#login-view {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.login-card {
  width: 100%;
  max-width: 400px;
  background: var(--ink-800);
  border: 1px solid var(--ink-border);
  border-top: 3px solid var(--brass);
  border-radius: var(--radius);
  padding: 36px 32px;
  box-shadow: 0 30px 60px -20px rgba(0,0,0,0.6);
}
.login-mark { display: flex; align-items: center; gap: 12px; margin-bottom: 6px; }
.login-title { font-size: 22px; }
.login-sub { color: var(--text-secondary); font-size: 13.5px; margin: 6px 0 28px; line-height: 1.5; }
.field { margin-bottom: 16px; }
.field label { display: block; font-size: 12.5px; color: var(--text-secondary); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.04em; }
.field input, select {
  width: 100%;
  background: transparent;
  border: 1px solid var(--ink-border);
  border-radius: 7px;
  padding: 10px 12px;
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: 14px;
}
.field input:focus, select:focus { outline: none; border-color: var(--brass); }
.btn {
  border: none;
  border-radius: 7px;
  padding: 10px 16px;
  font-family: var(--font-body);
  font-weight: 600;
  font-size: 13.5px;
  cursor: pointer;
}
.btn-primary { background: var(--brass); color: #201804; width: 100%; }
.btn-primary:hover { background: var(--brass-bright); }
.btn-ghost { background: transparent; color: var(--text-secondary); border: 1px solid var(--ink-border); }
.btn-ghost:hover { color: var(--text-primary); border-color: var(--text-muted); }
.btn-danger { background: rgba(229,72,77,0.15); color: var(--sig-critical); border: 1px solid rgba(229,72,77,0.35); }
.error-banner { background: rgba(229,72,77,0.12); border: 1px solid rgba(229,72,77,0.3); color: #ff9a9d; padding: 9px 12px; border-radius: 7px; font-size: 13px; margin-bottom: 14px; }
.demo-hint { margin-top: 22px; padding-top: 18px; border-top: 1px dashed var(--ink-border); font-size: 12px; color: var(--text-muted); line-height: 1.6; }
.demo-hint code { color: var(--sig-medium); }

/* ---------- Seal (signature element) ---------- */
.seal {
  width: 30px; height: 30px; border-radius: 50%;
  border: 2px solid var(--brass);
  display: inline-flex; align-items: center; justify-content: center;
  font-family: var(--font-display); font-weight: 600; font-size: 14px; color: var(--brass);
  flex-shrink: 0;
  position: relative;
}
.seal::before {
  content: ''; position: absolute; inset: -5px; border-radius: 50%;
  border: 1px dotted rgba(201,162,75,0.4);
}
.seal-sm { width: 20px; height: 20px; border-width: 1.5px; font-size: 10px; }
.seal-sm::before { inset: -3px; }
.seal--critical { border-color: var(--sig-critical); color: var(--sig-critical); }
.seal--critical::before { border-color: rgba(229,72,77,0.4); }
.seal--high { border-color: var(--sig-high); color: var(--sig-high); }
.seal--high::before { border-color: rgba(245,165,36,0.4); }
.seal--ok { border-color: var(--sig-good); color: var(--sig-good); }
.seal--ok::before { border-color: rgba(63,191,127,0.4); }

/* ---------- App shell ---------- */
#app-view { display: none; min-height: 100vh; }
.topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 28px; border-bottom: 1px solid var(--ink-border);
  background: rgba(15,21,38,0.7); backdrop-filter: blur(6px);
  position: sticky; top: 0; z-index: 10;
}
.brand { display: flex; align-items: center; gap: 12px; }
.brand-text .t1 { font-size: 16px; }
.brand-text .t2 { font-size: 11px; color: var(--text-muted); letter-spacing: 0.08em; text-transform: uppercase; }
.who { display: flex; align-items: center; gap: 12px; font-size: 13px; color: var(--text-secondary); }
.who .role-pill { background: var(--ink-600); border: 1px solid var(--ink-border); padding: 3px 9px; border-radius: 20px; font-size: 11px; color: var(--brass); letter-spacing: 0.03em; }

.tabs { display: flex; gap: 4px; padding: 10px 24px 0; border-bottom: 1px solid var(--ink-border); }
.tab {
  background: none; border: none; color: var(--text-secondary); font-family: var(--font-body);
  padding: 10px 16px; font-size: 13.5px; cursor: pointer; border-bottom: 2px solid transparent; font-weight: 500;
}
.tab:hover { color: var(--text-primary); }
.tab.active { color: var(--brass); border-bottom-color: var(--brass); }

main { padding: 26px 28px 60px; max-width: 1180px; margin: 0 auto; }
.view { display: none; }
.view.active { display: block; }

.view-header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 18px; flex-wrap: wrap; gap: 10px;}
.view-header h2 { font-size: 21px; }
.view-header p { color: var(--text-secondary); font-size: 13px; margin: 4px 0 0; }

/* ---------- Cards / grid ---------- */
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 14px; margin-bottom: 26px; }
.card {
  background: var(--ink-800); border: 1px solid var(--ink-border); border-top: 3px solid var(--brass);
  border-radius: var(--radius); padding: 18px; cursor: pointer; transition: transform .12s ease, border-color .12s ease;
}
.card:hover { transform: translateY(-2px); border-color: var(--text-muted); }
.card .card-label { font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); margin-bottom: 10px; }
.card .card-value { font-family: var(--font-display); font-size: 30px; font-weight: 600; }
.card .card-sub { font-size: 12px; color: var(--text-secondary); margin-top: 6px; }
.card.warn { border-top-color: var(--sig-high); }
.card.warn .card-value { color: var(--sig-high); }
.card.critical { border-top-color: var(--sig-critical); }
.card.critical .card-value { color: var(--sig-critical); }
.card.good .card-value { color: var(--sig-good); }

.panel { background: var(--ink-800); border: 1px solid var(--ink-border); border-radius: var(--radius); overflow: hidden; margin-bottom: 20px; }
.panel-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--ink-border); }
.panel-head h3 { font-size: 15px; }

table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); font-weight: 600; padding: 10px 18px; border-bottom: 1px solid var(--ink-border); }
td { padding: 12px 18px; border-bottom: 1px solid rgba(42,53,84,0.5); vertical-align: middle; }
tr:last-child td { border-bottom: none; }
tr:hover td { background: rgba(201,162,75,0.03); }
.muted { color: var(--text-muted); }
.mono-cell { font-family: var(--font-mono); font-size: 12px; color: var(--text-secondary); }

.badge { display: inline-block; padding: 3px 9px; border-radius: 20px; font-size: 11px; font-weight: 600; letter-spacing: 0.02em; }
.badge-active { background: rgba(63,191,127,0.14); color: var(--sig-good); }
.badge-invited { background: rgba(245,165,36,0.14); color: var(--sig-high); }
.badge-suspended, .badge-deactivated { background: rgba(229,72,77,0.14); color: var(--sig-critical); }
.badge-critical { background: rgba(229,72,77,0.16); color: var(--sig-critical); }
.badge-high { background: rgba(245,165,36,0.16); color: var(--sig-high); }
.badge-medium { background: rgba(79,184,166,0.16); color: var(--sig-medium); }
.badge-low { background: rgba(107,122,153,0.2); color: var(--sig-low); }
.badge-connected { background: rgba(63,191,127,0.14); color: var(--sig-good); }
.badge-not_configured { background: rgba(107,122,153,0.16); color: var(--text-muted); }

.issue-row { display: flex; gap: 12px; padding: 14px 18px; border-bottom: 1px solid rgba(42,53,84,0.5); align-items: flex-start; }
.issue-row:last-child { border-bottom: none; }
.issue-body { flex: 1; }
.issue-reason { font-size: 13.5px; margin-bottom: 3px; }
.issue-meta { font-size: 11.5px; color: var(--text-muted); }
.issue-action { font-size: 12px; color: var(--sig-medium); margin-top: 4px; }

.toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; padding: 12px 18px; border-bottom: 1px solid var(--ink-border); }
.toolbar input, .toolbar select { background: transparent; border: 1px solid var(--ink-border); color: var(--text-primary); border-radius: 6px; padding: 7px 10px; font-size: 12.5px; font-family: var(--font-body); }

.empty-state { padding: 40px 20px; text-align: center; color: var(--text-muted); font-size: 13.5px; }
.toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: var(--ink-700); border: 1px solid var(--brass); color: var(--text-primary); padding: 10px 18px; border-radius: 8px; font-size: 13px; z-index: 100; display: none; box-shadow: 0 10px 30px rgba(0,0,0,0.4); }

.modal-backdrop { position: fixed; inset: 0; background: rgba(5,8,15,0.7); display: none; align-items: center; justify-content: center; z-index: 50; padding: 20px; }
.modal { background: var(--ink-800); border: 1px solid var(--ink-border); border-top: 3px solid var(--brass); border-radius: var(--radius); padding: 24px; width: 100%; max-width: 420px; }
.modal h3 { margin-bottom: 16px; font-size: 17px; }
.modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 20px; }

.two-col { display: grid; grid-template-columns: 1.3fr 1fr; gap: 20px; align-items: start; }
@media (max-width: 800px) { .two-col { grid-template-columns: 1fr; } }


.pv11-root {
  min-height: 100vh;
  color: var(--text-primary);
}
.pv11-root .tabs { margin-top: 0; margin-bottom: 24px; }
.pv11-root .modal-backdrop { position: fixed; inset: 0; z-index: 50; display: none; }
      `}</style>
      <div className="tabs">
    <button className={"tab " + (tab === "dashboard" ? "active" : "")} onClick={() => setTab("dashboard")}>Dashboard</button>
    <button className={"tab " + (tab === "users" ? "active" : "")} onClick={() => setTab("users")}>Users</button>
    <button className={"tab " + (tab === "audit" ? "active" : "")} onClick={() => setTab("audit")}>Audit &amp; Security</button>
    <button className={"tab " + (tab === "dataquality" ? "active" : "")} onClick={() => setTab("dataquality")}>Data Quality</button>
    <button className={"tab " + (tab === "policies" ? "active" : "")} onClick={() => setTab("policies")}>Policies</button>
    <button className={"tab " + (tab === "sessions" ? "active" : "")} onClick={() => setTab("sessions")}>My Sessions</button>
    <button className={"tab " + (tab === "system" ? "active" : "")} onClick={() => setTab("system")}>System</button>
  </div>
<main>

    <!-- DASHBOARD -->
    <section className={"view " + (tab === "dashboard" ? "active" : "")} id="view-dashboard">
      <div className="view-header"><h2>Administration &amp; Governance</h2><p>Who can access what, what changed, and whether the data is trustworthy.</p></div>
      <div className="grid" id="dashboard-cards"></div>
      <div className="two-col">
        <div className="panel">
          <div className="panel-head"><h3>Recent activity</h3></div>
          <div id="dashboard-recent-audit"></div>
        </div>
        <div className="panel">
          <div className="panel-head"><h3>Top data quality issues</h3></div>
          <div id="dashboard-top-issues"></div>
        </div>
      </div>
    </section>

    <!-- USERS -->
    <section className={"view " + (tab === "users" ? "active" : "")} id="view-users">
      <div className="view-header">
        <div><h2>User Management</h2><p>Internal accounts scoped to your institution (and department, if applicable).</p></div>
        <button className="btn btn-primary" id="invite-user-btn">+ Invite user</button>
      </div>
      <div className="panel">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last login</th><th>Actions</th></tr></thead>
          <tbody id="users-tbody"></tbody>
        </table>
      </div>
    </section>

    <!-- AUDIT -->
    <section className={"view " + (tab === "audit" ? "active" : "")} id="view-audit">
      <div className="view-header"><h2>Audit &amp; Security Events</h2><p>Append-only. Nothing here can be edited or deleted — see /api/admin/audit.</p></div>
      <div className="panel">
        <div className="toolbar">
          <select id="audit-filter-mode"><option value="all">All audit events</option><option value="security">Security events only</option></select>
          <input id="audit-filter-action" placeholder="filter by action, e.g. user.role_changed" />
          <button className="btn btn-ghost" id="audit-refresh-btn">Refresh</button>
        </div>
        <table>
          <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
          <tbody id="audit-tbody"></tbody>
        </table>
      </div>
    </section>

    <!-- DATA QUALITY -->
    <section className={"view " + (tab === "dataquality" ? "active" : "")} id="view-dataquality">
      <div className="view-header"><h2>Data Quality</h2><p>Real, computed issues — click through to the underlying record, don't just fix the report.</p></div>
      <div className="grid" id="dq-cards"></div>
      <div className="panel"><div id="dq-issues"></div></div>
    </section>

    <!-- POLICIES -->
    <section className={"view " + (tab === "policies" ? "active" : "")} id="view-policies">
      <div className="view-header">
        <div><h2>Placement Policy Center</h2><p>Every policy is versioned; changing one supersedes the last, never overwrites it.</p></div>
        <button className="btn btn-primary" id="new-policy-btn">+ New policy version</button>
      </div>
      <div className="panel">
        <table>
          <thead><tr><th>Key</th><th>Active version</th><th>Effective date</th><th>Config</th></tr></thead>
          <tbody id="policies-tbody"></tbody>
        </table>
      </div>
    </section>

    <!-- SESSIONS -->
    <section className={"view " + (tab === "sessions" ? "active" : "")} id="view-sessions">
      <div className="view-header"><h2>My Active Sessions</h2><p>Database-backed bearer tokens — revoking one here takes effect on its very next request.</p></div>
      <div className="panel">
        <table>
          <thead><tr><th>Device</th><th>Created</th><th>Last active</th><th></th></tr></thead>
          <tbody id="sessions-tbody"></tbody>
        </table>
      </div>
    </section>

    <!-- SYSTEM -->
    <section className={"view " + (tab === "system" ? "active" : "")} id="view-system">
      <div className="view-header"><h2>System Health &amp; Integrations</h2><p>Real checks only — anything not wired up says so plainly.</p></div>
      <div className="two-col">
        <div className="panel">
          <div className="panel-head"><h3>Health</h3></div>
          <div id="system-health"></div>
        </div>
        <div className="panel">
          <div className="panel-head"><h3>Integrations</h3></div>
          <div id="system-integrations"></div>
        </div>
      </div>
    </section>

  </main>
<!-- Invite user modal -->
<div className="modal-backdrop" id="invite-modal-backdrop">
  <div className="modal">
    <h3>Invite a user</h3>
    <div className="field"><label>Name</label><input id="invite-name" /></div>
    <div className="field"><label>Email</label><input id="invite-email" type="email" /></div>
    <div className="field"><label>Role</label>
      <select id="invite-role">
        <option value="TPO_HEAD">TPO Head</option>
        <option value="PLACEMENT_OFFICER">Placement Officer</option>
        <option value="DEPARTMENT_COORDINATOR">Department Coordinator</option>
        <option value="FACULTY">Faculty</option>
        <option value="MANAGEMENT">Management</option>
        <option value="STUDENT">Student</option>
      </select>
    </div>
    <div className="modal-actions">
      <button className="btn btn-ghost" id="invite-cancel-btn">Cancel</button>
      <button className="btn btn-primary" id="invite-submit-btn">Send invite</button>
    </div>
  </div>
</div>

<!-- New policy modal -->
<div className="modal-backdrop" id="policy-modal-backdrop">
  <div className="modal">
    <h3>New policy version</h3>
    <div className="field"><label>Policy key</label><input id="policy-key" placeholder="e.g. multiple_offer_policy" /></div>
    <div className="field"><label>Config (JSON)</label><input id="policy-config" placeholder='{"maxActiveOffers":1}' /></div>
    <div className="field"><label>Reason</label><input id="policy-reason" placeholder="why is this changing?" /></div>
    <div className="modal-actions">
      <button className="btn btn-ghost" id="policy-cancel-btn">Cancel</button>
      <button className="btn btn-primary" id="policy-submit-btn">Publish version</button>
    </div>
  </div>
</div>


    </div>
  );
}
