// ui/ManagementIntelligencePanel.tsx
//
// USAGE
//   const { data } = useSWR('/api/proactive/management/intelligence', fetcher);
//   <ManagementIntelligencePanel briefing={data} />
//
// Strategic, aggregate, evidence-backed &mdash; no operational noise, no
// acknowledge/snooze controls. Management acts through the TPO, not
// through this screen (section 73).

import './theme.css';
import type { ManagementBriefing } from '../services/briefings/briefingGenerator';

export default function ManagementIntelligencePanel({ briefing }: { briefing: ManagementBriefing }) {
  return (
    <div className="radar-root" style={{ minHeight: '100%', padding: '24px 20px' }}>
      <div style={{ fontSize: 13, color: 'var(--radar-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Strategic</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
        {briefing.strategicSignals.length === 0 ? (
          <div style={{ color: 'var(--radar-text-faint)', fontSize: 14, padding: '16px 0' }}>No strategic risks flagged this period.</div>
        ) : (
          briefing.strategicSignals.map((s) => (
            <div
              key={s.signalId}
              style={{
                background: 'var(--radar-surface)',
                border: '1px solid var(--radar-border)',
                borderLeft: `3px solid var(--sev-${s.severity.toLowerCase()})`,
                borderRadius: 8,
                padding: '14px 16px',
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600 }}>{s.title}</div>
              <div style={{ fontSize: 13, color: 'var(--radar-text-muted)', marginTop: 4 }}>{s.summary}</div>
            </div>
          ))
        )}
      </div>

      {briefing.positiveHighlights.length > 0 && (
        <>
          <div
            style={{
              fontSize: 13,
              color: 'var(--radar-text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginTop: 24,
            }}
          >
            Positive
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            {briefing.positiveHighlights.map((s) => (
              <div
                key={s.signalId}
                style={{
                  background: 'var(--radar-surface)',
                  border: '1px solid var(--radar-border)',
                  borderLeft: '3px solid var(--sev-positive)',
                  borderRadius: 8,
                  padding: '14px 16px',
                  fontSize: 14,
                }}
              >
                {s.title}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
