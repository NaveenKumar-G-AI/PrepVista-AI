import { useState } from 'react';
import type { NextBestMove, Recommendation, ValueTier, NotNowReason } from '../types';
import { tokens, tierColor, notNowReasonLabel } from '../tokens';

const NOT_NOW_REASONS: NotNowReason[] = ['too_expensive', 'too_time_consuming', 'not_relevant', 'wrong_timing', 'need_information', 'personal_reason'];

/** spec #47: the instrument-dial value gauge — the one deliberately
 * distinctive visual element on this card. Flat, thin-stroke, no glow/
 * animation loop beyond the needle settling into place, so it reads as a
 * calm instrument rather than a "futuristic AI dashboard" (spec #66). */
function ValueGauge({ tier }: { tier: ValueTier }) {
  const angle = tier === 'high' ? 25 : tier === 'medium' ? 90 : 155;
  const rad = (angle * Math.PI) / 180;
  const cx = 60, cy = 64, needleR = 42, pivotR = 4;
  const nx = cx + needleR * Math.cos(rad);
  const ny = cy - needleR * Math.sin(rad);
  const color = tierColor[tier];

  const tick = (deg: number) => {
    const r1 = 44, r2 = 50;
    const a = (deg * Math.PI) / 180;
    return { x1: cx + r1 * Math.cos(a), y1: cy - r1 * Math.sin(a), x2: cx + r2 * Math.cos(a), y2: cy - r2 * Math.sin(a) };
  };
  const t1 = tick(155), t2 = tick(90), t3 = tick(25);

  return (
    <svg width="120" height="76" viewBox="0 0 120 76" aria-hidden="true">
      <path d="M 10 64 A 50 50 0 0 1 110 64" fill="none" stroke={tokens.color.line} strokeWidth="2" strokeLinecap="round" />
      <line x1={t1.x1} y1={t1.y1} x2={t1.x2} y2={t1.y2} stroke={tokens.color.line} strokeWidth="2" />
      <line x1={t2.x1} y1={t2.y1} x2={t2.x2} y2={t2.y2} stroke={tokens.color.line} strokeWidth="2" />
      <line x1={t3.x1} y1={t3.y1} x2={t3.x2} y2={t3.y2} stroke={tokens.color.line} strokeWidth="2" />
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={color} strokeWidth="2.5" strokeLinecap="round" style={{ transition: 'all 400ms ease' }} />
      <circle cx={cx} cy={cy} r={pivotR} fill={color} />
    </svg>
  );
}

export interface NextBestMoveCardProps {
  move: NextBestMove;
  recommendation?: Recommendation | null;
  onStart?: () => void;
  onNotNow?: (reason: NotNowReason) => void;
}

export function NextBestMoveCard({ move, recommendation, onStart, onNotNow }: NextBestMoveCardProps) {
  const [showWhy, setShowWhy] = useState(false);
  const [showNotNow, setShowNotNow] = useState(false);

  return (
    <section style={styles.card}>
      <div style={styles.eyebrow}>Next best move</div>

      <div style={styles.header}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={styles.title}>{move.title}</h2>
          <p style={styles.reasoning}>{move.reasoning}</p>
        </div>
        <div style={styles.gaugeWrap}>
          <ValueGauge tier={move.tier} />
          <div style={{ ...styles.tierLabel, color: tierColor[move.tier] }}>{move.tier.toUpperCase()} VALUE</div>
        </div>
      </div>

      {move.blockedByConstraints && (
        <div style={styles.constraintNote}>This doesn't currently fit your available time — see the plan note below.</div>
      )}

      {move.evidence.length > 0 && (
        <ul style={styles.evidenceList}>
          {move.evidence.map((e, i) => (
            <li key={i} style={styles.evidenceItem}>{e}</li>
          ))}
        </ul>
      )}

      <div style={styles.actions}>
        <button type="button" style={styles.primaryButton} onClick={onStart}>Start</button>
        <button type="button" style={styles.textButton} onClick={() => setShowWhy((v) => !v)}>
          {showWhy ? 'Hide reasoning' : 'Why this?'}
        </button>
        <button type="button" style={styles.textButton} onClick={() => setShowNotNow(true)}>Not now</button>
      </div>

      {showWhy && <WhyThisPanel move={move} recommendation={recommendation} />}
      {showNotNow && (
        <NotNowPicker
          onCancel={() => setShowNotNow(false)}
          onPick={(reason) => { setShowNotNow(false); onNotNow?.(reason); }}
        />
      )}
    </section>
  );
}

/** spec #48: WHY THIS PANEL — goal connection, evidence, risk, alternatives,
 * confidence, unknowns, in plain language. */
function WhyThisPanel({ move, recommendation }: { move: NextBestMove; recommendation?: Recommendation | null }) {
  return (
    <div style={styles.whyPanel}>
      <WhyRow label="Goal connection" value={move.reasoning} />
      {move.evidence.length > 0 && <WhyRow label="Evidence" value={move.evidence.join(' · ')} />}
      {recommendation && recommendation.confidence && <WhyRow label="Confidence" value={recommendation.confidence} />}
      {recommendation && recommendation.risks.length > 0 && <WhyRow label="Risk" value={recommendation.risks.join(' · ')} />}
      {move.alternatives.length > 0 && (
        <WhyRow label="Alternatives considered" value={move.alternatives.map((a) => `${a.title} (${a.tier})`).join(' · ')} />
      )}
      {recommendation && recommendation.unknowns.length > 0 && <WhyRow label="Unknowns" value={recommendation.unknowns.join(' · ')} />}
      {recommendation && !recommendation.generatedByLLM && (
        <div style={styles.templateNote}>This explanation was generated from the deterministic engine directly (the narrative model was unavailable).</div>
      )}
    </div>
  );
}

function WhyRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.whyRow}>
      <div style={styles.whyLabel}>{label}</div>
      <div style={styles.whyValue}>{value}</div>
    </div>
  );
}

/** spec #49: "NOT NOW" reason chips. */
function NotNowPicker({ onPick, onCancel }: { onPick: (r: NotNowReason) => void; onCancel: () => void }) {
  return (
    <div style={styles.whyPanel}>
      <div style={{ ...styles.whyLabel, marginBottom: 8 }}>Why not now?</div>
      <div style={styles.chipRow}>
        {NOT_NOW_REASONS.map((r) => (
          <button key={r} type="button" style={styles.chip} onClick={() => onPick(r)}>
            {notNowReasonLabel[r]}
          </button>
        ))}
      </div>
      <button type="button" style={{ ...styles.textButton, marginTop: 10 }} onClick={onCancel}>Cancel</button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: tokens.color.card, border: `1px solid ${tokens.color.line}`, borderRadius: tokens.radius.lg,
    padding: 24, fontFamily: tokens.font.body, color: tokens.color.ink,
  },
  eyebrow: { fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: tokens.color.inkMuted, marginBottom: 10 },
  header: { display: 'flex', gap: 20, alignItems: 'flex-start', justifyContent: 'space-between' },
  title: { fontSize: 20, fontWeight: 650, margin: 0, lineHeight: 1.3 },
  reasoning: { fontSize: 14, color: tokens.color.inkMuted, marginTop: 8, lineHeight: 1.5 },
  gaugeWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 },
  tierLabel: { fontFamily: tokens.font.mono, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', marginTop: -4 },
  constraintNote: {
    marginTop: 14, fontSize: 13, color: tokens.color.risk, background: '#FBF2F0', border: `1px solid ${tokens.color.risk}33`,
    borderRadius: tokens.radius.sm, padding: '8px 12px',
  },
  evidenceList: { margin: '14px 0 0', paddingLeft: 18, fontSize: 13, color: tokens.color.inkMuted },
  evidenceItem: { marginBottom: 4 },
  actions: { display: 'flex', gap: 10, alignItems: 'center', marginTop: 20 },
  primaryButton: {
    background: tokens.color.signal, color: '#fff', border: 'none', borderRadius: tokens.radius.sm,
    padding: '9px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  textButton: { background: 'transparent', border: 'none', color: tokens.color.signal, fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: '9px 4px' },
  whyPanel: { marginTop: 16, paddingTop: 16, borderTop: `1px solid ${tokens.color.line}` },
  whyRow: { display: 'flex', gap: 14, padding: '6px 0', fontSize: 13, alignItems: 'baseline' },
  whyLabel: { width: 150, flexShrink: 0, color: tokens.color.inkMuted, fontWeight: 600 },
  whyValue: { color: tokens.color.ink, lineHeight: 1.5 },
  templateNote: { fontSize: 12, color: tokens.color.inkMuted, marginTop: 8, fontStyle: 'italic' },
  chipRow: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  chip: {
    background: tokens.color.surface, border: `1px solid ${tokens.color.line}`, borderRadius: 999,
    padding: '6px 14px', fontSize: 13, color: tokens.color.ink, cursor: 'pointer',
  },
};
