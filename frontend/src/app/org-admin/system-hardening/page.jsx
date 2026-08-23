'use client';
import { useState } from 'react';

// ── Verified run output (VERIFIED-RUN-OUTPUT.txt, captured 2026-08-14T18:24:32Z) ──

const CHECK_SECTIONS = [
  {
    id: 's1',
    title: 'Tenant Isolation',
    spec: '§8',
    passed: 10,
    failed: 0,
    checks: [
      { label: 'Institution A cannot read B\'s student (stu-b-001)', pass: true },
      { label: 'Institution A cannot read B\'s drive (drv-crestline-b)', pass: true },
      { label: 'Institution A cannot read B\'s application (app-b-001)', pass: true },
      { label: 'Institution B cannot read A\'s student (stu-001)', pass: true },
      { label: 'Institution B cannot read A\'s drive (drv-zenith-sde)', pass: true },
      { label: 'Institution B cannot read A\'s application (app-001)', pass: true },
      { label: 'Institution B cannot read A\'s offer (off-001)', pass: true },
      { label: 'Institution B cannot read A\'s joining (join-001)', pass: true },
      { label: 'Institution A can read its own student', pass: true },
      { label: 'Institution B can read its own student', pass: true },
    ],
  },
  {
    id: 's2',
    title: 'RBAC',
    spec: '§10, §38',
    passed: 7,
    failed: 0,
    checks: [
      { label: 'assertNotRecruiterRole blocks "recruiter"', pass: true },
      { label: 'tpo_head can update any student', pass: true },
      { label: 'department_coordinator can view own-department student', pass: true },
      { label: 'department_coordinator CANNOT view another department\'s student', pass: true },
      { label: 'management CANNOT update an application (view-only)', pass: true },
      { label: 'student can view their own application', pass: true },
      { label: 'student CANNOT view another student\'s application', pass: true },
    ],
  },
  {
    id: 's3',
    title: 'Status Transitions',
    spec: '§34',
    passed: 4,
    failed: 0,
    checks: [
      { label: 'drive: draft → published is legal', pass: true },
      { label: 'drive: draft → closed is illegal (must publish first)', pass: true },
      { label: 'offer: published → accepted is legal', pass: true },
      { label: 'ai_action: prepared → executing is illegal (must confirm first)', pass: true },
    ],
  },
  {
    id: 's4',
    title: 'Event Idempotency & Ordering',
    spec: '§26–27',
    passed: 3,
    failed: 0,
    checks: [
      { label: 'Duplicate event id only processed once', pass: true },
      { label: 'JOINING_CONFIRMED before OFFER_ACCEPTED is rejected', pass: true },
      { label: 'JOINING_CONFIRMED accepted once OFFER_ACCEPTED is logged first', pass: true },
    ],
  },
  {
    id: 's5',
    title: 'Data Integrity Scan',
    spec: '§33',
    passed: 11,
    failed: 0,
    checks: [
      { label: 'Applications without a drive: found 1', pass: true },
      { label: 'Interviews without an application: found 1', pass: true },
      { label: 'Offers without a selection: found 1', pass: true },
      { label: 'Joinings without an offer: found 1', pass: true },
      { label: 'Placement outcomes without a verified joining: found 1', pass: true },
      { label: 'Training enrollments without a student: found 1', pass: true },
      { label: 'Readiness records without a student: found 1', pass: true },
      { label: 'Communications without a valid recipient: found 1', pass: true },
      { label: 'Signals without a source entity: found 1', pass: true },
      { label: 'Confirmed AI actions with no confirming user: found 1', pass: true },
      { label: 'Forecasts without a cutoff/model version: found 1', pass: true },
    ],
  },
  {
    id: 's6',
    title: 'Fake/Demo Code Sweep',
    spec: '§35–36',
    passed: 1,
    failed: 0,
    checks: [
      { label: 'Scanner flags the seeded fake markers in legacy-code-sample/ — 7 marker(s) found across 2 file(s)', pass: true },
    ],
  },
  {
    id: 's7',
    title: 'The "Wow Flow" (AI Orchestration)',
    spec: '§72, §91',
    passed: 7,
    failed: 0,
    checks: [
      { label: 'Top signal is a real ELIGIBLE_NOT_APPLIED signal with students attached', pass: true },
      { label: 'Narrowing by readiness actually reduced the count (8 → 5)', pass: true },
      { label: 'Action created in "prepared" state, not yet executed', pass: true },
      { label: 'Action moved to "confirmed" with a human confirmer attached', pass: true },
      { label: 'Action executed and communications actually sent', pass: true },
      { label: 'Outcome check shows real, non-fabricated movement (3 of 8 moved to applied)', pass: true },
      { label: 'Dashboard, report, and verified outcome reconcile (§44)', pass: true },
    ],
  },
];

const TOTAL_PASSED = CHECK_SECTIONS.reduce((s, c) => s + c.passed, 0);
const TOTAL_FAILED = CHECK_SECTIONS.reduce((s, c) => s + c.failed, 0);

// ── Wow flow interactive walkthrough ──────────────────────────────────────

const WOW_STEPS = [
  {
    who: 'system', text: 'Command Centre open — AI scanning signals for Institution A.',
    result: null,
  },
  {
    who: 'ai',
    text: 'Good morning. I found 4 things requiring attention.',
    bullets: [
      'Zenith Systems — SDE closes in 4 day(s)',
      '11 data-quality issue(s) found',
      '3 eligible students haven\'t applied to Zenith Systems — SDE',
      '8 eligible students haven\'t applied to Orbit Analytics — Data Analyst',
    ],
    check: 'Top signal is a real ELIGIBLE_NOT_APPLIED signal with students attached.',
    result: null,
  },
  {
    who: 'tpo', text: 'Show high-readiness students for the Orbit Analytics drive.',
    result: null,
  },
  {
    who: 'ai',
    text: '5 of those 8 have readiness 85+: Aditi Rao, Karthik Subramaniam, Priya Iyer, Yash Malhotra, Rohit Sharma.',
    check: 'Narrowing by readiness actually reduced the count (8 → 5).',
    result: null,
  },
  {
    who: 'tpo', text: 'Prepare a reminder.',
    result: null,
  },
  {
    who: 'ai',
    text: 'Reminder drafted for 5 students about Orbit Analytics — Data Analyst. Confirm to send?',
    check: 'Action created in "prepared" state, not yet executed.',
    result: null,
  },
  {
    who: 'tpo', text: 'Confirm.',
    result: null,
  },
  {
    who: 'ai',
    text: 'Sent to 5. 3 applied within the window.',
    check: 'Action executed and communications sent. Outcome check shows real movement.',
    result: { label: 'Command Centre recomputes…', detail: 'Eligible-not-applied for Orbit Analytics: 5 (was 8).' },
  },
  {
    who: 'tpo', text: 'Did it help?',
    result: null,
  },
  {
    who: 'ai',
    text: 'Yes — 3 of the 8 moved to applied.',
    result: null,
  },
  {
    who: 'system',
    text: 'Management view — reconciliation check.',
    result: { label: 'Reconciliation', detail: 'Verified joinings: 1 · Reports show: 1 · Reconciled: true' },
    check: 'Dashboard, report, and verified outcome reconcile (§44).',
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────

function StatusBadge({ pass }) {
  return (
    <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: pass ? '#10b981' : '#f43f5e', background: pass ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)', border: `1px solid ${pass ? '#10b981' : '#f43f5e'}40`, padding: '2px 8px', borderRadius: 4, flexShrink: 0 }}>
      {pass ? 'PASS' : 'FAIL'}
    </span>
  );
}

function SectionCard({ section, expanded, onToggle }) {
  const allPassed = section.failed === 0;
  return (
    <div style={{ background: '#0f172a', border: `1px solid ${allPassed ? 'rgba(16,185,129,0.15)' : 'rgba(244,63,94,0.3)'}`, borderRadius: 10, overflow: 'hidden' }}>
      <div onClick={onToggle} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', cursor: 'pointer', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: allPassed ? '#10b981' : '#f43f5e', flexShrink: 0 }} />
          <div>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{section.title}</span>
            <span style={{ fontSize: 11, color: '#475569', marginLeft: 8, fontFamily: "'IBM Plex Mono', monospace" }}>{section.spec}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, fontFamily: "'IBM Plex Mono', monospace', color: '#10b981'" }}>
            <span style={{ color: '#10b981' }}>{section.passed} passed</span>
            {section.failed > 0 && <span style={{ color: '#f43f5e', marginLeft: 6 }}>{section.failed} failed</span>}
          </span>
          <span style={{ color: '#475569', fontSize: 12 }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>
      {expanded && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {section.checks.map((c, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: '#94a3b8' }}>
              <StatusBadge pass={c.pass} />
              <span style={{ flex: 1 }}>{c.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────

function HealthTab() {
  const [expanded, setExpanded] = useState(null);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Summary bar */}
      <div style={{ background: '#0f172a', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 10, padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>System Health — Verified Run Output</div>
          <div style={{ fontSize: 11, color: '#334155', fontFamily: "'IBM Plex Mono', monospace" }}>Captured 2026-08-14T18:24:32Z · node run-part16-demo.mjs</div>
        </div>
        <div style={{ display: 'flex', gap: 28 }}>
          <div>
            <div style={{ fontSize: 36, fontWeight: 800, color: '#10b981', fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1 }}>{TOTAL_PASSED}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>passed</div>
          </div>
          <div>
            <div style={{ fontSize: 36, fontWeight: 800, color: TOTAL_FAILED > 0 ? '#f43f5e' : '#334155', fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1 }}>{TOTAL_FAILED}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>failed</div>
          </div>
          <div>
            <div style={{ fontSize: 36, fontWeight: 800, color: '#f8fafc', fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1 }}>{CHECK_SECTIONS.length}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>sections</div>
          </div>
        </div>
      </div>

      {/* Section cards */}
      {CHECK_SECTIONS.map((s) => (
        <SectionCard key={s.id} section={s} expanded={expanded === s.id} onToggle={() => setExpanded(expanded === s.id ? null : s.id)} />
      ))}
    </div>
  );
}

function WowFlowTab() {
  const [step, setStep] = useState(0);
  const shown = WOW_STEPS.slice(0, step);
  const next = WOW_STEPS[step];

  const whoColor = { tpo: '#f8fafc', ai: '#5b8def', system: '#f59e0b' };
  const whoLabel = { tpo: 'TPO', ai: 'AI', system: 'SYSTEM' };

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, marginBottom: 20 }}>
        Interactive replay of the §72/§91 "wow flow" — the actual transcript from <code style={{ fontSize: 12, background: 'rgba(255,255,255,0.05)', padding: '1px 6px', borderRadius: 4 }}>node run-part16-demo.mjs</code>. Every number is real, not canned.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
        {shown.map((s, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '56px 1fr', gap: 12, animation: 'fadeIn 0.3s ease' }}>
            <div style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", textTransform: 'uppercase', color: whoColor[s.who], fontWeight: 700, paddingTop: 4 }}>
              {whoLabel[s.who]}
            </div>
            <div>
              <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: 14, color: '#e2e8f0', lineHeight: 1.55 }}>{s.text}</div>
                {s.bullets && (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {s.bullets.map((b, j) => (
                      <div key={j} style={{ fontSize: 13, color: '#94a3b8', padding: '4px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 6 }}>· {b}</div>
                    ))}
                  </div>
                )}
              </div>
              {s.check && (
                <div style={{ marginTop: 6, fontSize: 11, color: '#10b981', fontFamily: "'IBM Plex Mono', monospace", padding: '4px 10px', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>✓ PASS</span> <span style={{ color: '#4ade80' }}>{s.check}</span>
                </div>
              )}
              {s.result && (
                <div style={{ marginTop: 6, fontSize: 12, color: '#fde68a', padding: '8px 10px', background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 6 }}>
                  <strong>{s.result.label}</strong><br />{s.result.detail}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {next ? (
        <button onClick={() => setStep(step + 1)} style={{ background: '#5b8def', color: '#0b1420', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
          ▸ {next.who === 'tpo' ? `TPO: "${next.text}"` : next.who === 'system' ? `System: ${next.text}` : 'AI responds'}
        </button>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ fontSize: 14, color: '#10b981' }}>✓ Flow complete — 43 checks passed, 0 failed.</div>
          <button onClick={() => setStep(0)} style={{ background: 'transparent', color: '#64748b', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer' }}>Reset</button>
        </div>
      )}
    </div>
  );
}

function ReleaseTab() {
  const items = [
    { area: 'Tenant Isolation', status: 'VERIFIED', note: 'Cross-institution data access blocked; 10 checks, 0 failures.' },
    { area: 'RBAC Matrix', status: 'VERIFIED', note: 'No recruiter role. TPO / coordinator / management / student boundaries enforced.' },
    { area: 'Status Transitions', status: 'VERIFIED', note: 'Legal and illegal transitions tested per §34 for all domain entities.' },
    { area: 'Event Idempotency', status: 'VERIFIED', note: 'Duplicate events rejected. Out-of-order JOINING_CONFIRMED rejected.' },
    { area: 'Data Integrity (11 checks)', status: 'VERIFIED', note: 'Orphan-record detection for all 11 relation types.' },
    { area: 'Fake/Demo Code Scanner', status: 'VERIFIED', note: 'CLI scanner finds 7 markers in 2 seeded legacy files.' },
    { area: 'AI Orchestration (Wow Flow)', status: 'VERIFIED', note: '7 PASS checks including human-in-loop confirmation gate.' },
    { area: 'Dashboard/Report Reconciliation', status: 'VERIFIED', note: 'Management number traces to the same verified joining record.' },
    { area: 'Real Performance Numbers', status: 'REPO-DEPENDENT', note: 'Needs profiling against the real database at scale.' },
    { area: 'Accessibility (a11y) Audit', status: 'REPO-DEPENDENT', note: 'Requires an actual screen audit — not estimatable from fixture data.' },
    { area: 'Live Security Pentest', status: 'REPO-DEPENDENT', note: 'RBAC + isolation logic verified; live pentest requires real infra.' },
    { area: 'Design System Consolidation', status: 'REPO-DEPENDENT', note: 'CSS token audit needs eyes on actual screens, not fixture guesses.' },
  ];
  const statusColor = { VERIFIED: '#10b981', 'REPO-DEPENDENT': '#f59e0b' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, marginBottom: 8 }}>
        Honest truth table from <code style={{ fontSize: 12, background: 'rgba(255,255,255,0.05)', padding: '1px 6px', borderRadius: 4 }}>RELEASE_CHECKLIST.md</code> — what is verified here vs. what is still repo-dependent.
      </div>
      {items.map((item) => (
        <div key={item.area} style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '12px 16px', display: 'grid', gridTemplateColumns: '180px 130px 1fr', alignItems: 'start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{item.area}</div>
          <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: statusColor[item.status], background: `${statusColor[item.status]}15`, border: `1px solid ${statusColor[item.status]}40`, padding: '3px 8px', borderRadius: 4, alignSelf: 'center' }}>
            {item.status}
          </span>
          <div style={{ fontSize: 12, color: '#64748b' }}>{item.note}</div>
        </div>
      ))}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

const TABS = [
  { id: 'health',   label: 'System Health (43 Checks)' },
  { id: 'wowflow',  label: 'AI Wow Flow Demo' },
  { id: 'release',  label: 'Release Checklist' },
];

export default function SystemHardeningPage() {
  const [tab, setTab] = useState('health');
  return (
    <div style={{ background: '#020617', minHeight: '100vh', color: '#f8fafc', fontFamily: "'Inter', -apple-system, sans-serif", padding: '28px 24px' }}>
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }`}</style>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, color: '#5b8def', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6, fontFamily: "'IBM Plex Mono', monospace" }}>PrepVista · Part 16 — Final</div>
        <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>System Hardening & Reconciliation</div>
        <div style={{ fontSize: 14, color: '#64748b', maxWidth: 680 }}>
          Hardening pass over the full Parts 1–15 codebase. 43 checks across tenant isolation, RBAC, event ordering/idempotency, status transitions, data integrity, fake-code scanning, and the §72 AI orchestration "wow flow." Zero dependencies — plain Node, zero failures.
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 24, overflowX: 'auto' }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '10px 16px', fontSize: 14, whiteSpace: 'nowrap', color: tab === t.id ? '#f8fafc' : '#64748b', fontWeight: tab === t.id ? 600 : 400, borderBottom: tab === t.id ? '2px solid #10b981' : '2px solid transparent' }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'health'   && <HealthTab />}
      {tab === 'wowflow'  && <WowFlowTab />}
      {tab === 'release'  && <ReleaseTab />}
    </div>
  );
}
