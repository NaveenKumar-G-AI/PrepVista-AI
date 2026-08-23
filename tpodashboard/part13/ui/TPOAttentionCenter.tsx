// ui/TPOAttentionCenter.tsx
//
// USAGE
//   const { data } = useSWR('/api/proactive/tpo/attention-center', fetcher);
//   const signals = data ? Object.values(data).flat() : [];
//   <TPOAttentionCenter
//     signals={signals}
//     onAcknowledge={(id) => fetch(`/api/proactive/signals/${id}/actions`, {
//       method: 'POST', body: JSON.stringify({ action: 'acknowledge' }),
//     })}
//     onSnooze={(id, hours) => fetch(`/api/proactive/signals/${id}/actions`, {
//       method: 'POST', body: JSON.stringify({ action: 'snooze', hours }),
//     })}
//     onResolve={(id, evidence) => fetch(`/api/proactive/signals/${id}/actions`, {
//       method: 'POST', body: JSON.stringify({ action: 'resolve', resolutionEvidence: evidence }),
//     })}
//   />
//
// No demo/mock data lives in this file on purpose — an empty `signals`
// array renders the real empty state below, not a fabricated example.

import { useMemo, useState, type CSSProperties } from 'react';
import type { ProactiveSignal, Severity } from '../services/signals/types';
import './theme.css';

type Tab = 'CRITICAL' | 'HIGH' | 'TODAY' | 'NEW' | 'SNOOZED' | 'RESOLVED' | 'POSITIVE';
const TABS: Tab[] = ['CRITICAL', 'HIGH', 'TODAY', 'NEW', 'SNOOZED', 'RESOLVED', 'POSITIVE'];

const SEVERITY_LABEL: Record<Severity, string> = { CRITICAL: 'Critical', HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low', INFO: 'Info' };

interface Props {
  signals: ProactiveSignal[];
  onAcknowledge: (id: string) => void;
  onSnooze: (id: string, hours: number) => void;
  onResolve: (id: string, resolutionEvidence: string) => void;
}

export default function TPOAttentionCenter({ signals, onAcknowledge, onSnooze, onResolve }: Props) {
  const [tab, setTab] = useState<Tab>('CRITICAL');

  const buckets = useMemo(() => {
    const isOpen = (s: ProactiveSignal) => s.status === 'NEW' || s.status === 'ACKNOWLEDGED' || s.status === 'IN_PROGRESS';
    const dueSoon = (s: ProactiveSignal) => {
      if (!s.expiresAt) return false;
      const ms = new Date(s.expiresAt).getTime() - Date.now();
      return ms >= 0 && ms <= 24 * 3600 * 1000;
    };
    const risk = signals.filter((s) => s.polarity === 'RISK');
    const positive = signals.filter((s) => s.polarity === 'POSITIVE');

    const result: Record<Tab, ProactiveSignal[]> = {
      CRITICAL: risk.filter((s) => isOpen(s) && s.severity === 'CRITICAL'),
      HIGH: risk.filter((s) => isOpen(s) && s.severity === 'HIGH'),
      TODAY: risk.filter((s) => isOpen(s) && dueSoon(s)),
      NEW: risk.filter((s) => s.status === 'NEW'),
      SNOOZED: risk.filter((s) => s.status === 'SNOOZED'),
      RESOLVED: risk.filter((s) => s.status === 'RESOLVED'),
      POSITIVE: positive,
    };
    return result;
  }, [signals]);

  const active = buckets[tab];

  return (
    <div className="radar-root" style={{ minHeight: '100%', padding: '28px 24px' }}>
      <Header buckets={buckets} />
      <Tabs tab={tab} setTab={setTab} buckets={buckets} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
        {active.length === 0 ? (
          <EmptyState tab={tab} />
        ) : (
          active.map((s) => <SignalCard key={s.id} signal={s} onAcknowledge={onAcknowledge} onSnooze={onSnooze} onResolve={onResolve} />)
        )}
      </div>
    </div>
  );
}

function Header({ buckets }: { buckets: Record<Tab, ProactiveSignal[]> }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <RadarMark />
        <div>
          <div style={{ fontSize: 13, color: 'var(--radar-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            PrepVista &middot; Continuous Placement Radar
          </div>
          <div style={{ fontSize: 22, fontWeight: 600 }}>Good morning</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 20 }}>
        <CountPill label="Critical" count={buckets.CRITICAL.length} color="var(--sev-critical)" />
        <CountPill label="High" count={buckets.HIGH.length} color="var(--sev-high)" />
        <CountPill label="Positive" count={buckets.POSITIVE.length} color="var(--sev-positive)" />
      </div>
    </div>
  );
}

function RadarMark() {
  return (
    <div
      aria-hidden
      style={{
        width: 32,
        height: 32,
        borderRadius: '50%',
        border: '1px solid var(--radar-border)',
        position: 'relative',
        overflow: 'hidden',
        background: 'radial-gradient(circle, var(--radar-accent-soft) 0%, transparent 70%)',
        flexShrink: 0,
      }}
    >
      <div
        className="radar-sweep-indicator"
        style={{
          position: 'absolute',
          inset: 0,
          background: 'conic-gradient(from 0deg, var(--radar-accent) 0deg, transparent 55deg, transparent 360deg)',
          opacity: 0.6,
        }}
      />
    </div>
  );
}

function CountPill({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div className="radar-numeral" style={{ fontSize: 24, color, lineHeight: 1 }}>
        {count}
      </div>
      <div style={{ fontSize: 11, color: 'var(--radar-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
    </div>
  );
}

function Tabs({ tab, setTab, buckets }: { tab: Tab; setTab: (t: Tab) => void; buckets: Record<Tab, ProactiveSignal[]> }) {
  return (
    <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--radar-border)', overflowX: 'auto' }}>
      {TABS.map((t) => (
        <button
          key={t}
          onClick={() => setTab(t)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '10px 14px',
            fontSize: 13,
            fontFamily: 'var(--font-body)',
            whiteSpace: 'nowrap',
            color: tab === t ? 'var(--radar-text)' : 'var(--radar-text-muted)',
            borderBottom: tab === t ? '2px solid var(--radar-accent)' : '2px solid transparent',
          }}
        >
          {t.charAt(0) + t.slice(1).toLowerCase()} &middot; {buckets[t].length}
        </button>
      ))}
    </div>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  const copy: Record<Tab, string> = {
    CRITICAL: 'No critical signals open. Nothing needs you right now.',
    HIGH: 'No high-priority signals open.',
    TODAY: 'Nothing with a deadline in the next 24 hours.',
    NEW: 'No new signals since your last visit.',
    SNOOZED: 'Nothing snoozed.',
    RESOLVED: 'No resolved signals in range yet.',
    POSITIVE: 'No positive developments detected yet this period.',
  };
  return <div style={{ color: 'var(--radar-text-faint)', fontSize: 14, padding: '24px 4px' }}>{copy[tab]}</div>;
}

function SignalCard({
  signal,
  onAcknowledge,
  onSnooze,
  onResolve,
}: {
  signal: ProactiveSignal;
  onAcknowledge: (id: string) => void;
  onSnooze: (id: string, hours: number) => void;
  onResolve: (id: string, resolutionEvidence: string) => void;
}) {
  const [resolving, setResolving] = useState(false);
  const [note, setNote] = useState('');
  const isPositive = signal.polarity === 'POSITIVE';
  const sevVar = isPositive ? '--sev-positive' : `--sev-${signal.severity.toLowerCase()}`;

  return (
    <div
      style={{
        background: 'var(--radar-surface)',
        border: '1px solid var(--radar-border)',
        borderLeft: `3px solid var(${sevVar})`,
        borderRadius: 8,
        padding: '16px 18px',
      }}
    >
      {!isPositive && (
        <span
          className="radar-numeral"
          style={{
            fontSize: 11,
            color: `var(${sevVar})`,
            background: `var(${sevVar}-soft)`,
            padding: '2px 8px',
            borderRadius: 4,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {SEVERITY_LABEL[signal.severity]}
        </span>
      )}
      <div style={{ fontSize: 15, fontWeight: 600, marginTop: 6 }}>{signal.title}</div>
      <div style={{ fontSize: 13, color: 'var(--radar-text-muted)', marginTop: 4 }}>{signal.summary}</div>

      {Object.keys(signal.evidence).length > 0 && (
        <div style={{ display: 'flex', gap: 18, marginTop: 12, flexWrap: 'wrap' }}>
          {Object.entries(signal.evidence).map(([key, value]) => (
            <div key={key}>
              <div className="radar-numeral" style={{ fontSize: 15 }}>
                {String(value)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--radar-text-faint)' }}>{key.replace(/_/g, ' ')}</div>
            </div>
          ))}
        </div>
      )}

      {signal.evidenceMeta.isStale && (
        <div style={{ fontSize: 12, color: 'var(--sev-medium)', marginTop: 8 }}>
          Intelligence may be delayed &mdash; underlying data hasn&apos;t refreshed recently.
        </div>
      )}

      {!isPositive && (
        <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          {signal.recommendedAction && <button style={primaryBtn}>{signal.recommendedAction.label}</button>}
          {signal.status === 'NEW' && (
            <button style={ghostBtn} onClick={() => onAcknowledge(signal.id)}>
              Acknowledge
            </button>
          )}
          {signal.status !== 'SNOOZED' && signal.status !== 'RESOLVED' && (
            <button style={ghostBtn} onClick={() => onSnooze(signal.id, 4)}>
              Snooze 4h
            </button>
          )}
          {!resolving ? (
            <button style={ghostBtn} onClick={() => setResolving(true)}>
              Resolve
            </button>
          ) : (
            <span style={{ display: 'flex', gap: 6 }}>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What fixed it?"
                style={{
                  background: 'var(--radar-surface-raised)',
                  border: '1px solid var(--radar-border)',
                  borderRadius: 6,
                  padding: '6px 8px',
                  fontSize: 12,
                  color: 'var(--radar-text)',
                }}
              />
              <button
                style={primaryBtn}
                onClick={() => {
                  onResolve(signal.id, note);
                  setResolving(false);
                }}
              >
                Confirm
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

const primaryBtn: CSSProperties = {
  background: 'var(--radar-accent)',
  color: '#0b1420',
  border: 'none',
  borderRadius: 6,
  padding: '7px 12px',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
};

const ghostBtn: CSSProperties = {
  background: 'transparent',
  color: 'var(--radar-text-muted)',
  border: '1px solid var(--radar-border)',
  borderRadius: 6,
  padding: '7px 12px',
  fontSize: 12,
  cursor: 'pointer',
};
