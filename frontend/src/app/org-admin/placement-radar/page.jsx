'use client';
import { useMemo, useState } from 'react';

// ── Mock Data
const MOCK_SIGNALS = [
  {
    id: 'sig-001',
    type: 'APPLICATION_DEADLINE_APPROACHING',
    category: 'pipeline',
    title: 'Applications for ABC Technologies close in 9h',
    summary: "83 eligible students haven't applied. 23 are high-readiness (75+).",
    severity: 'CRITICAL',
    polarity: 'RISK',
    status: 'NEW',
    evidence: { eligible: 198, applied: 115, unapplied: 83, hoursLeft: 9 },
    evidenceMeta: { isStale: false },
    recommendedAction: { label: 'Send Reminder' },
    expiresAt: new Date(Date.now() + 9 * 3600 * 1000).toISOString(),
  },
  {
    id: 'sig-002',
    type: 'INTERVIEW_RESULT_PENDING',
    category: 'pipeline',
    title: '12 interview results pending for 24h+',
    summary: 'Results expected from Infosys, TCS and 3 others. Students are waiting.',
    severity: 'HIGH',
    polarity: 'RISK',
    status: 'NEW',
    evidence: { pending: 12, companies: 5 },
    evidenceMeta: { isStale: false },
    recommendedAction: { label: 'Chase Companies' },
    expiresAt: null,
  },
  {
    id: 'sig-003',
    type: 'OFFER_EXPIRY_WARNING',
    category: 'pipeline',
    title: '7 offers expire within 48 hours',
    summary: 'Students may lose offers if joining confirmations are not collected.',
    severity: 'HIGH',
    polarity: 'RISK',
    status: 'ACKNOWLEDGED',
    evidence: { expiring: 7, hoursWindow: 48 },
    evidenceMeta: { isStale: false },
    recommendedAction: { label: 'Notify Students' },
    expiresAt: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
  },
  {
    id: 'sig-004',
    type: 'DEPARTMENT_CONVERSION_GAP',
    category: 'institutional',
    title: 'ECE interview conversion is 10 pts below median',
    summary: 'ECE progression: 56.7% vs institutional median of 66.7%. Root cause analysis recommended.',
    severity: 'MEDIUM',
    polarity: 'RISK',
    status: 'NEW',
    evidence: { dept: 'ECE', rate: '56.7%', median: '66.7%', gap: 10 },
    evidenceMeta: { isStale: false },
    recommendedAction: null,
    expiresAt: null,
  },
  {
    id: 'sig-005',
    type: 'DATA_QUALITY_WARNING',
    category: 'institutional',
    title: '7 joining records unverified',
    summary: 'Treat placement totals as provisional until verification is complete.',
    severity: 'MEDIUM',
    polarity: 'RISK',
    status: 'NEW',
    evidence: { unverified: 7 },
    evidenceMeta: { isStale: true },
    recommendedAction: { label: 'Review Records' },
    expiresAt: null,
  },
  {
    id: 'sig-006',
    type: 'PLACEMENT_MILESTONE',
    category: 'positive',
    title: 'CSE batch crosses 80% placement milestone',
    summary: 'The earliest the batch has hit 80% in 3 years — 247 of 308 students placed.',
    severity: 'INFO',
    polarity: 'POSITIVE',
    status: 'NEW',
    evidence: { placed: 247, total: 308, pct: '80.2%' },
    evidenceMeta: { isStale: false },
    recommendedAction: null,
    expiresAt: null,
  },
  {
    id: 'sig-007',
    type: 'RECRUITER_RELATIONSHIP_POSITIVE',
    category: 'positive',
    title: 'Google return intent confirmed for next cycle',
    summary: 'Recruiter contact confirmed intent to participate in the 2027 hiring cycle.',
    severity: 'INFO',
    polarity: 'POSITIVE',
    status: 'NEW',
    evidence: { company: 'Google', cycle: '2027' },
    evidenceMeta: { isStale: false },
    recommendedAction: null,
    expiresAt: null,
  },
];

const MOCK_STUDENT_ITEMS = [
  { id: 'st-001', title: 'Application deadline today: ABC Technologies', summary: 'You are eligible for the Software Engineer role. Applications close in 9 hours.' },
  { id: 'st-002', title: 'Interview result pending', summary: 'Your Infosys interview result has been pending for 26h. Expect an update soon.' },
];

const MOCK_MANAGEMENT_BRIEFING = {
  strategicSignals: [
    { signalId: 'mg-001', title: 'Overall placement on track: 74.3% placed', summary: 'Season 2026 is tracking 3.1 pts ahead of the same date last year.', severity: 'INFO' },
    { signalId: 'mg-002', title: 'ECE department conversion gap needs attention', summary: 'Interview conversion is 10 pts below institutional median. Recommend TPO review.', severity: 'HIGH' },
  ],
  positiveHighlights: [
    { signalId: 'mg-003', title: 'CSE batch hits 80% placement milestone' },
    { signalId: 'mg-004', title: 'Google confirms return for 2027 cycle' },
  ],
};

// ── Severity colours (from theme.css)
const SEVERITY_COLOR = {
  CRITICAL: '#f0483e',
  HIGH: '#f2914a',
  MEDIUM: '#e8b93f',
  LOW: '#6b7a90',
  INFO: '#4c5a6e',
  POSITIVE: '#3fb68a',
};
const SEVERITY_SOFT = {
  CRITICAL: 'rgba(240,72,62,0.12)',
  HIGH: 'rgba(242,145,74,0.12)',
  MEDIUM: 'rgba(232,185,63,0.12)',
  LOW: 'rgba(107,122,144,0.12)',
  INFO: 'rgba(76,90,110,0.12)',
  POSITIVE: 'rgba(63,182,138,0.12)',
};

const ALL_TABS = ['CRITICAL', 'HIGH', 'TODAY', 'NEW', 'SNOOZED', 'RESOLVED', 'POSITIVE'];

const EMPTY_STATE_COPY = {
  CRITICAL: 'No critical signals open. Nothing needs you right now.',
  HIGH: 'No high-priority signals open.',
  TODAY: 'Nothing with a deadline in the next 24 hours.',
  NEW: 'No new signals since your last visit.',
  SNOOZED: 'Nothing snoozed.',
  RESOLVED: 'No resolved signals in range yet.',
  POSITIVE: 'No positive developments detected yet this period.',
};

function useBuckets(signals) {
  return useMemo(() => {
    const isOpen = (s) => ['NEW', 'ACKNOWLEDGED', 'IN_PROGRESS'].includes(s.status);
    const dueSoon = (s) => {
      if (!s.expiresAt) return false;
      const ms = new Date(s.expiresAt).getTime() - Date.now();
      return ms >= 0 && ms <= 24 * 3600 * 1000;
    };
    const risk = signals.filter((s) => s.polarity === 'RISK');
    const positive = signals.filter((s) => s.polarity === 'POSITIVE');
    return {
      CRITICAL: risk.filter((s) => isOpen(s) && s.severity === 'CRITICAL'),
      HIGH: risk.filter((s) => isOpen(s) && s.severity === 'HIGH'),
      TODAY: risk.filter((s) => isOpen(s) && dueSoon(s)),
      NEW: risk.filter((s) => s.status === 'NEW'),
      SNOOZED: risk.filter((s) => s.status === 'SNOOZED'),
      RESOLVED: risk.filter((s) => s.status === 'RESOLVED'),
      POSITIVE: positive,
    };
  }, [signals]);
}

function SignalCard({ signal, onAcknowledge, onSnooze, onResolve }) {
  const [resolving, setResolving] = useState(false);
  const [note, setNote] = useState('');
  const isPositive = signal.polarity === 'POSITIVE';
  const color = isPositive ? SEVERITY_COLOR.POSITIVE : (SEVERITY_COLOR[signal.severity] || '#8b96a5');
  const soft = isPositive ? SEVERITY_SOFT.POSITIVE : (SEVERITY_SOFT[signal.severity] || 'rgba(0,0,0,0.12)');

  return (
    <div style={{ background: '#171d24', border: '1px solid #2a333d', borderLeft: `3px solid ${color}`, borderRadius: 8, padding: '16px 18px' }}>
      {!isPositive && (
        <span style={{ fontSize: 11, color, background: soft, padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: "'JetBrains Mono', monospace" }}>
          {signal.severity}
        </span>
      )}
      <div style={{ fontSize: 15, fontWeight: 600, marginTop: 6 }}>{signal.title}</div>
      <div style={{ fontSize: 13, color: '#8b96a5', marginTop: 4 }}>{signal.summary}</div>

      {Object.keys(signal.evidence).length > 0 && (
        <div style={{ display: 'flex', gap: 18, marginTop: 12, flexWrap: 'wrap' }}>
          {Object.entries(signal.evidence).map(([key, value]) => (
            <div key={key}>
              <div style={{ fontSize: 15, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em' }}>{String(value)}</div>
              <div style={{ fontSize: 11, color: '#5b6572' }}>{key.replace(/_/g, ' ')}</div>
            </div>
          ))}
        </div>
      )}

      {signal.evidenceMeta.isStale && (
        <div style={{ fontSize: 12, color: '#e8b93f', marginTop: 8 }}>
          Intelligence may be delayed — underlying data has not refreshed recently.
        </div>
      )}

      {!isPositive && (
        <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          {signal.recommendedAction && (
            <button style={{ background: '#5b8def', color: '#0b1420', border: 'none', borderRadius: 6, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              {signal.recommendedAction.label}
            </button>
          )}
          {signal.status === 'NEW' && (
            <button style={{ background: 'transparent', color: '#8b96a5', border: '1px solid #2a333d', borderRadius: 6, padding: '7px 12px', fontSize: 12, cursor: 'pointer' }} onClick={() => onAcknowledge(signal.id)}>
              Acknowledge
            </button>
          )}
          {!['SNOOZED', 'RESOLVED'].includes(signal.status) && (
            <button style={{ background: 'transparent', color: '#8b96a5', border: '1px solid #2a333d', borderRadius: 6, padding: '7px 12px', fontSize: 12, cursor: 'pointer' }} onClick={() => onSnooze(signal.id)}>
              Snooze 4h
            </button>
          )}
          {!resolving ? (
            <button style={{ background: 'transparent', color: '#8b96a5', border: '1px solid #2a333d', borderRadius: 6, padding: '7px 12px', fontSize: 12, cursor: 'pointer' }} onClick={() => setResolving(true)}>
              Resolve
            </button>
          ) : (
            <span style={{ display: 'flex', gap: 6 }}>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What fixed it?" style={{ background: '#1e252d', border: '1px solid #2a333d', borderRadius: 6, padding: '6px 8px', fontSize: 12, color: '#edeff2' }} />
              <button style={{ background: '#5b8def', color: '#0b1420', border: 'none', borderRadius: 6, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }} onClick={() => { onResolve(signal.id, note); setResolving(false); }}>
                Confirm
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function TPOAttentionCenter({ signals, onAcknowledge, onSnooze, onResolve }) {
  const [tab, setTab] = useState('CRITICAL');
  const buckets = useBuckets(signals);
  const active = buckets[tab] || [];

  return (
    <div style={{ minHeight: '100%', padding: '28px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div aria-hidden style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid #2a333d', position: 'relative', overflow: 'hidden', background: 'radial-gradient(circle, rgba(91,141,239,0.14) 0%, transparent 70%)', flexShrink: 0 }}>
            <div className="radar-sweep-indicator" style={{ position: 'absolute', inset: 0, background: 'conic-gradient(from 0deg, #5b8def 0deg, transparent 55deg, transparent 360deg)', opacity: 0.6 }} />
          </div>
          <div>
            <div style={{ fontSize: 13, color: '#8b96a5', letterSpacing: '0.06em', textTransform: 'uppercase' }}>PrepVista · Continuous Placement Radar</div>
            <div style={{ fontSize: 22, fontWeight: 600 }}>Good morning</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 20 }}>
          {[['Critical', buckets.CRITICAL.length, '#f0483e'], ['High', buckets.HIGH.length, '#f2914a'], ['Positive', buckets.POSITIVE.length, '#3fb68a']].map(([label, count, color]) => (
            <div key={label} style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 24, color: color, lineHeight: 1, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em' }}>{count}</div>
              <div style={{ fontSize: 11, color: '#8b96a5', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #2a333d', overflowX: 'auto' }}>
        {ALL_TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '10px 14px', fontSize: 13, whiteSpace: 'nowrap', color: tab === t ? '#edeff2' : '#8b96a5', borderBottom: tab === t ? '2px solid #5b8def' : '2px solid transparent' }}>
            {t.charAt(0) + t.slice(1).toLowerCase()} · {(buckets[t] || []).length}
          </button>
        ))}
      </div>

      {/* Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
        {active.length === 0 ? (
          <div style={{ color: '#5b6572', fontSize: 14, padding: '24px 4px' }}>{EMPTY_STATE_COPY[tab]}</div>
        ) : (
          active.map((s) => <SignalCard key={s.id} signal={s} onAcknowledge={onAcknowledge} onSnooze={onSnooze} onResolve={onResolve} />)
        )}
      </div>
    </div>
  );
}

const PANEL_TABS = [
  ['tpo', 'TPO Attention Center'],
  ['student', 'Student Attention'],
  ['management', 'Management Intelligence'],
];

export default function PlacementRadarPage() {
  const [signals, setSignals] = useState(MOCK_SIGNALS);
  const [panelTab, setPanelTab] = useState('tpo');

  const handleAcknowledge = (id) => setSignals((prev) => prev.map((s) => s.id === id ? { ...s, status: 'ACKNOWLEDGED' } : s));
  const handleSnooze = (id) => setSignals((prev) => prev.map((s) => s.id === id ? { ...s, status: 'SNOOZED' } : s));
  const handleResolve = (id) => setSignals((prev) => prev.map((s) => s.id === id ? { ...s, status: 'RESOLVED' } : s));

  return (
    <div style={{ background: '#0f1419', minHeight: '100vh', color: '#edeff2', fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <style>{`
        @keyframes radar-sweep { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .radar-sweep-indicator { animation: radar-sweep 6s linear infinite; }
        @media (prefers-reduced-motion: reduce) { .radar-sweep-indicator { animation: none; } }
      `}</style>

      {/* Panel selector */}
      <div style={{ borderBottom: '1px solid #2a333d', padding: '0 24px', display: 'flex', gap: 4 }}>
        {PANEL_TABS.map(([id, label]) => (
          <button key={id} onClick={() => setPanelTab(id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '14px 16px', fontSize: 14, fontWeight: panelTab === id ? 600 : 400, color: panelTab === id ? '#edeff2' : '#8b96a5', borderBottom: panelTab === id ? '2px solid #5b8def' : '2px solid transparent' }}>
            {label}
          </button>
        ))}
      </div>

      {panelTab === 'tpo' && (
        <TPOAttentionCenter signals={signals} onAcknowledge={handleAcknowledge} onSnooze={handleSnooze} onResolve={handleResolve} />
      )}

      {panelTab === 'student' && (
        <div style={{ padding: '24px 20px' }}>
          <div style={{ fontSize: 13, color: '#8b96a5', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Important</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            {MOCK_STUDENT_ITEMS.length === 0 ? (
              <div style={{ color: '#5b6572', fontSize: 14, padding: '16px 0' }}>Nothing needs your attention right now.</div>
            ) : (
              MOCK_STUDENT_ITEMS.map((item) => (
                <div key={item.id} style={{ background: '#171d24', border: '1px solid #2a333d', borderLeft: '3px solid #5b8def', borderRadius: 8, padding: '14px 16px' }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{item.title}</div>
                  <div style={{ fontSize: 13, color: '#8b96a5', marginTop: 4 }}>{item.summary}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {panelTab === 'management' && (
        <div style={{ padding: '24px 20px' }}>
          <div style={{ fontSize: 13, color: '#8b96a5', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Strategic</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            {MOCK_MANAGEMENT_BRIEFING.strategicSignals.map((s) => (
              <div key={s.signalId} style={{ background: '#171d24', border: '1px solid #2a333d', borderLeft: `3px solid ${SEVERITY_COLOR[s.severity] || '#8b96a5'}`, borderRadius: 8, padding: '14px 16px' }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{s.title}</div>
                <div style={{ fontSize: 13, color: '#8b96a5', marginTop: 4 }}>{s.summary}</div>
              </div>
            ))}
          </div>
          {MOCK_MANAGEMENT_BRIEFING.positiveHighlights.length > 0 && (
            <>
              <div style={{ fontSize: 13, color: '#8b96a5', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 24 }}>Positive</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                {MOCK_MANAGEMENT_BRIEFING.positiveHighlights.map((s) => (
                  <div key={s.signalId} style={{ background: '#171d24', border: '1px solid #2a333d', borderLeft: '3px solid #3fb68a', borderRadius: 8, padding: '14px 16px', fontSize: 14 }}>
                    {s.title}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
