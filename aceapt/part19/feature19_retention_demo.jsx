import { useState, useMemo } from 'react';
import { RotateCcw } from 'lucide-react';

const COLORS = {
  bg: '#12141C',
  panel: '#181B26',
  panelAlt: '#20242F',
  border: '#2A2E3D',
  text: '#EDEAE2',
  textDim: '#8890A0',
  amber: '#E8A23D',
  rose: '#C1666B',
  roseDim: '#7C4B4F',
  slate: '#6E86A3',
};

const STEPS = [
  {
    id: 'day1',
    dayLabel: 'Day 1',
    title: 'Mastered',
    stage: 'MASTERED',
    risk: 'STABLE',
    strength: 'Insufficient evidence',
    tone: 'amber',
    trace: 86,
    log: 'Student masters Percentages. Feature 14 hands off a mastery record — Feature 19 starts tracking retention from here.',
  },
  {
    id: 'day7',
    dayLabel: 'Day 7',
    title: 'Recall check',
    stage: 'RETAINED',
    risk: 'STABLE',
    strength: 'Insufficient evidence',
    tone: 'amber',
    trace: 84,
    log: 'Quick recall check, untimed: correct. Delayed retrieval confirmed — stage advances MASTERED \u2192 RETAINED.',
  },
  {
    id: 'day21',
    dayLabel: 'Day 21',
    title: 'Mixed check',
    stage: 'RETAINED',
    risk: 'MONITOR',
    strength: 'Moderate',
    tone: 'rose',
    trace: 32,
    log: 'Mixed retention check \u2014 percentages shows up unlabeled, solved a different way. Student misses it. Recent success has dropped from baseline: weakening detected.',
  },
  {
    id: 'react1',
    dayLabel: 'Reactivate',
    title: 'Recall prompt',
    stage: 'RETAINED',
    risk: 'AT RISK',
    strength: 'Moderate',
    tone: 'rose',
    trace: 18,
    log: 'Level 1 \u2014 blind recall prompt, no hint. Student struggles again. Escalating one level, not jumping to the top: minimum necessary intervention.',
  },
  {
    id: 'react2',
    dayLabel: 'Reactivate',
    title: 'Small hint',
    stage: 'RETAINED',
    risk: 'WEAKENING',
    strength: 'Moderate',
    tone: 'slate',
    trace: 54,
    log: 'Level 2 \u2014 a small hint, not the method. Student solves it. Repair held \u2014 moving straight to verification, not more levels.',
  },
  {
    id: 'verify',
    dayLabel: 'Verify',
    title: 'Similar + transfer',
    stage: 'RETAINED',
    risk: 'MONITOR',
    strength: 'Moderate',
    tone: 'slate',
    trace: 74,
    log: 'A similar question, then a transfer question in a new context. Both correct. Transfer verified.',
  },
  {
    id: 'stable',
    dayLabel: 'Stabilized',
    title: 'Retained again',
    stage: 'TRANSFERABLE',
    risk: 'STABLE',
    strength: 'Moderate',
    tone: 'amber',
    trace: 90,
    log: 'Reactivation complete. Retention risk resets to stable and stage advances to TRANSFERABLE.',
  },
];

const TONE_COLOR = { amber: COLORS.amber, rose: COLORS.rose, slate: COLORS.slate };
const W = 640;
const H = 168;
const PAD = 34;
const xFor = i => PAD + (i * (W - PAD * 2)) / (STEPS.length - 1);
const yFor = v => H - 26 - (v / 100) * (H - 60);

function bucketForRisk(risk) {
  if (risk === 'STABLE') return 'Stable';
  if (risk === 'MONITOR' || risk === 'WEAKENING') return 'Weakening';
  return 'Needs recall';
}

function StateRow({ label, value, color }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '9px 0',
        borderBottom: `1px solid ${COLORS.border}`,
      }}
    >
      <span style={{ fontSize: 12, color: COLORS.textDim }}>{label}</span>
      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 500, color: color || COLORS.text }}>
        {value}
      </span>
    </div>
  );
}

function DashboardBar({ label, count, max, color }) {
  const pct = count > 0 ? Math.max(10, Math.round((count / max) * 100)) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 100, flexShrink: 0, fontSize: 12, color: COLORS.textDim }}>{label}</span>
      <div style={{ flex: 1, height: 8, background: COLORS.panelAlt, borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.4s ease' }} />
      </div>
      <span style={{ width: 14, textAlign: 'right', fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", color: COLORS.textDim }}>
        {count}
      </span>
    </div>
  );
}

function btnStyle({ variant, disabled }) {
  const base = {
    fontFamily: "'IBM Plex Sans', sans-serif",
    fontSize: 13,
    fontWeight: 500,
    padding: '9px 18px',
    borderRadius: 8,
    cursor: disabled ? 'default' : 'pointer',
    border: `1px solid ${COLORS.border}`,
    background: 'transparent',
    color: COLORS.text,
    transition: 'all 0.15s ease',
    opacity: disabled ? 0.35 : 1,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  };
  if (variant === 'primary' && !disabled) {
    return { ...base, background: COLORS.amber, borderColor: COLORS.amber, color: '#241804' };
  }
  return base;
}

export default function Feature19Demo() {
  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;
  const visible = STEPS.slice(0, stepIndex + 1);

  const bandCounts = useMemo(() => {
    const base = { Strong: 1, Stable: 1, Weakening: 1, 'Needs recall': 0 };
    base[bucketForRisk(step.risk)] += 1;
    return base;
  }, [step]);
  const maxBand = Math.max(1, ...Object.values(bandCounts));

  return (
    <div
      style={{
        background: COLORS.bg,
        color: COLORS.text,
        borderRadius: 16,
        padding: '28px 28px 24px',
        fontFamily: "'IBM Plex Sans', sans-serif",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600&family=IBM+Plex+Sans:wght@400;500&family=IBM+Plex+Mono:wght@400;500&display=swap');
        @keyframes f19fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes f19pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>

      <div
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 11,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: COLORS.textDim,
          marginBottom: 10,
        }}
      >
        Feature 19 &middot; Retention intelligence
      </div>
      <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 24, fontWeight: 600, margin: '0 0 6px' }}>
        Does the knowledge survive?
      </h2>
      <p style={{ fontSize: 14, lineHeight: 1.6, color: COLORS.textDim, margin: '0 0 22px', maxWidth: 540 }}>
        Percentages, one student, three weeks. Step through what ACEAPT does when a mastered concept gets checked again later.
      </p>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        role="img"
        aria-label="Retention signal strength for Percentages across the demo timeline"
      >
        <title>Retention trace</title>
        {[0, 25, 50, 75, 100].map(v => (
          <line key={v} x1={PAD} x2={W - PAD} y1={yFor(v)} y2={yFor(v)} stroke={COLORS.border} strokeWidth="1" />
        ))}
        <polyline
          points={visible.map((s, i) => `${xFor(i)},${yFor(s.trace)}`).join(' ')}
          fill="none"
          stroke={COLORS.amber}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {visible.map((s, i) => (
          <circle
            key={s.id}
            cx={xFor(i)}
            cy={yFor(s.trace)}
            r={i === stepIndex ? 7 : 4}
            fill={TONE_COLOR[s.tone]}
            stroke={COLORS.bg}
            strokeWidth="2"
            style={i === stepIndex ? { animation: 'f19pulse 1.6s ease-in-out infinite' } : undefined}
          />
        ))}
        {STEPS.map((s, i) => (
          <text
            key={s.id}
            x={xFor(i)}
            y={H - 4}
            textAnchor="middle"
            fontFamily="'IBM Plex Mono', monospace"
            fontSize="10"
            fill={i <= stepIndex ? COLORS.textDim : COLORS.border}
          >
            {s.dayLabel}
          </text>
        ))}
      </svg>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginTop: 18 }}>
        <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 16 }}>
          <div
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 10,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: COLORS.textDim,
              marginBottom: 10,
            }}
          >
            Log
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {visible.map((s, i) => (
              <div
                key={s.id}
                style={{
                  fontSize: 13,
                  lineHeight: 1.55,
                  color: i === stepIndex ? COLORS.text : COLORS.textDim,
                  opacity: i === stepIndex ? 1 : 0.6,
                  animation: i === stepIndex ? 'f19fade 0.35s ease' : undefined,
                }}
              >
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: TONE_COLOR[s.tone], marginRight: 8 }}>
                  {s.dayLabel} &middot; {s.title}
                </span>
                {s.log}
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 16 }}>
          <div
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 10,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: COLORS.textDim,
              marginBottom: 6,
            }}
          >
            Percentages &middot; knowledge state
          </div>
          <StateRow label="Stage" value={step.stage} />
          <StateRow label="Risk" value={step.risk} color={TONE_COLOR[step.tone]} />
          <StateRow label="Strength" value={step.strength} />
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 20 }}>
        <button
          type="button"
          onClick={() => setStepIndex(i => Math.max(0, i - 1))}
          disabled={isFirst}
          style={btnStyle({ disabled: isFirst })}
        >
          &larr; Back
        </button>
        <button
          type="button"
          onClick={() => setStepIndex(i => Math.min(STEPS.length - 1, i + 1))}
          disabled={isLast}
          style={btnStyle({ variant: 'primary', disabled: isLast })}
        >
          {isLast ? 'Done' : 'Next \u2192'}
        </button>
        <button type="button" onClick={() => setStepIndex(0)} style={btnStyle({})}>
          <RotateCcw size={13} aria-hidden="true" /> Replay
        </button>
        <div style={{ marginLeft: 'auto', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: COLORS.textDim }}>
          Step {stepIndex + 1} / {STEPS.length}
        </div>
      </div>

      <div style={{ marginTop: 24, paddingTop: 18, borderTop: `1px solid ${COLORS.border}` }}>
        <div
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 10,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: COLORS.textDim,
            marginBottom: 12,
          }}
        >
          Knowledge health &middot; this student
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <DashboardBar label="Strong" count={bandCounts.Strong} max={maxBand} color={COLORS.amber} />
          <DashboardBar label="Stable" count={bandCounts.Stable} max={maxBand} color={COLORS.slate} />
          <DashboardBar label="Weakening" count={bandCounts.Weakening} max={maxBand} color={COLORS.roseDim} />
          <DashboardBar label="Needs recall" count={bandCounts['Needs recall']} max={maxBand} color={COLORS.rose} />
        </div>
      </div>

      {isLast && (
        <div
          style={{
            marginTop: 22,
            paddingTop: 18,
            borderTop: `1px solid ${COLORS.border}`,
            textAlign: 'center',
            animation: 'f19fade 0.6s ease',
          }}
        >
          <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 15, margin: 0, color: COLORS.text }}>
            ACEAPT does not only teach.
          </p>
          <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 15, margin: '2px 0 0', color: COLORS.amber }}>
            ACEAPT verifies whether knowledge remains available over time.
          </p>
        </div>
      )}
    </div>
  );
}
