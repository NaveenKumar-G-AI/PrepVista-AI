import { useState } from 'react';
import type { VerificationFactor } from '../api/types.js';

export interface EvidenceBreakdownProps {
  factors: VerificationFactor[];
}

/** Section 28 — meaningful evidence only, no decorative charts. Section 29
 *  — clicking a dimension explains what was measured, why it matters, and
 *  what to improve, using the same deterministic explanation the backend
 *  already computed (never invented client-side). */
export function EvidenceBreakdown({ factors }: EvidenceBreakdownProps) {
  const [openName, setOpenName] = useState<string | null>(null);

  return (
    <section className="proof-root" style={{ marginTop: 20 }}>
      <h2 className="proof-display" style={{ fontSize: 18, margin: '0 0 12px' }}>Evidence</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
        {factors.map((f) => {
          const open = openName === f.name;
          return (
            <div
              key={f.name}
              style={{
                border: `1px solid ${f.meetsRequirement ? 'var(--proof-verified)' : 'var(--proof-line)'}`,
                borderRadius: 'var(--proof-radius)',
                background: 'var(--proof-paper-raised)',
                overflow: 'hidden',
              }}
            >
              <button
                type="button"
                onClick={() => setOpenName(open ? null : f.name)}
                aria-expanded={open}
                style={{
                  width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer',
                  padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  color: 'var(--proof-ink)', fontFamily: 'var(--proof-font-body)',
                }}
              >
                <span>
                  <span aria-hidden="true" style={{ marginRight: 8, color: f.meetsRequirement ? 'var(--proof-verified)' : 'var(--proof-gap)' }}>
                    {f.meetsRequirement ? '✓' : '⚠'}
                  </span>
                  {f.name}
                </span>
                <span className="proof-numeric" style={{ fontSize: 13, color: 'var(--proof-ink-soft)' }}>
                  {`${(f.score * 100).toFixed(0)}%`}
                </span>
              </button>
              {open && (
                <div style={{ padding: '0 14px 14px', color: 'var(--proof-ink-soft)', fontSize: 13.5 }}>
                  <p style={{ margin: '0 0 6px' }}>{f.explanation}</p>
                  <p className="proof-numeric" style={{ margin: 0, fontSize: 12 }}>
                    {`Target: ${(f.threshold * 100).toFixed(0)}%`}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
