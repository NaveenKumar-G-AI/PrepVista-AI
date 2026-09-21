import type { ProofSnapshot } from '../api/types.js';

export interface ProofHistoryTimelineProps {
  history: ProofSnapshot[];
  onSelect?: (snapshot: ProofSnapshot) => void;
}

const STATUS_SHORT: Record<string, string> = {
  STRONGLY_VERIFIED: 'Strongly verified',
  VERIFIED: 'Verified',
  CONDITIONALLY_VERIFIED: 'Conditionally verified',
  EMERGING_EVIDENCE: 'Emerging evidence',
  NOT_VERIFIED: 'Not verified',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Section 30 — a ledger of transitions, not a generic dot-timeline: each
 *  line reads like an entry in a log, since that is what it actually is. */
export function ProofHistoryTimeline({ history, onSelect }: ProofHistoryTimelineProps) {
  if (!history.length) return null;

  return (
    <section className="proof-root" style={{ marginTop: 20 }}>
      <h2 className="proof-display" style={{ fontSize: 18, margin: '0 0 10px' }}>Proof history</h2>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, borderTop: '1px solid var(--proof-line)' }}>
        {history.map((snap) => {
          const verified = snap.status === 'VERIFIED' || snap.status === 'STRONGLY_VERIFIED';
          return (
            <li key={snap.id} style={{ borderBottom: '1px solid var(--proof-line)' }}>
              <button
                type="button"
                onClick={() => onSelect?.(snap)}
                style={{
                  width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  background: 'none', border: 'none', cursor: onSelect ? 'pointer' : 'default',
                  padding: '10px 4px', fontFamily: 'var(--proof-font-body)', color: 'var(--proof-ink)',
                }}
              >
                <span className="proof-numeric" style={{ color: 'var(--proof-ink-soft)', fontSize: 13, width: 64, textAlign: 'left' }}>
                  {formatDate(snap.createdAt)}
                </span>
                <span style={{ flex: 1, textAlign: 'left', color: verified ? 'var(--proof-verified)' : 'var(--proof-ink)' }}>
                  {STATUS_SHORT[snap.status] ?? snap.status}
                </span>
                <span className="proof-numeric" style={{ fontSize: 12, color: 'var(--proof-ink-soft)' }}>
                  {`${snap.confidence} confidence`}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
