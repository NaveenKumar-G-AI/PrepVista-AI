import React from 'react';

export interface RoleReadinessHistoryEntry {
  readinessState: 'NOT_ASSESSED' | 'EARLY_STAGE' | 'DEVELOPING' | 'APPROACHING_READY' | 'READY' | 'STRONGLY_READY';
  readinessScore: number;
  calculatedAt: string; // ISO-8601
}

export interface RoleReadinessHistoryProps {
  /** Must come from SnapshotRepository.getHistory() — real historical snapshots only, never synthesized (Phase 34). */
  history: RoleReadinessHistoryEntry[];
}

const STATE_COLOR: Record<RoleReadinessHistoryEntry['readinessState'], string> = {
  NOT_ASSESSED: '#94a3b8',
  EARLY_STAGE: '#d97706',
  DEVELOPING: '#d97706',
  APPROACHING_READY: '#2563eb',
  READY: '#16a34a',
  STRONGLY_READY: '#16a34a',
};

function formatState(state: string): string {
  return state.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export default function RoleReadinessHistory({ history }: RoleReadinessHistoryProps) {
  if (history.length === 0) {
    return (
      <div style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif', color: '#64748b', fontSize: 14 }}>
        No readiness history yet — check back after the first assessment.
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif', maxWidth: 420 }}>
      {history.map((entry, i) => {
        const isLast = i === history.length - 1;
        const date = new Date(entry.calculatedAt);
        return (
          <div key={entry.calculatedAt} style={{ display: 'flex', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: STATE_COLOR[entry.readinessState],
                  marginTop: 4,
                  flexShrink: 0,
                }}
              />
              {!isLast && <div style={{ width: 2, flex: 1, background: '#e2e8f0', minHeight: 24 }} />}
            </div>
            <div style={{ paddingBottom: isLast ? 0 : 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
                {formatState(entry.readinessState)} <span style={{ color: '#64748b', fontWeight: 400 }}>· {entry.readinessScore}/100</span>
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                {date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
