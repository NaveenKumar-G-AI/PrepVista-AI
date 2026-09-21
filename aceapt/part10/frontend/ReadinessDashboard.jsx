import React, { useState } from 'react';
import { TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';

/**
 * Feature 10 - Readiness Forecast Dashboard (SS43 Student Dashboard,
 * SS44 Readiness Map, SS45 Trajectory Visualization).
 *
 * Ships with the SS63 demo narrative baked in as default data (toggle
 * BEFORE/AFTER to see the actual before/after numbers the engine
 * computed - see src/demo/runEndToEndDemo.ts). To wire to real data,
 * replace the `DEMO` object below with forecast objects fetched from
 * GET /forecasts/current (src/api/routes.ts) and drop the toggle.
 *
 * Design note: no existing ACEAPT design system was available to match
 * (SS44 says "use existing design language" - there wasn't one to
 * read), so this uses an instrument/navigation-panel metaphor instead
 * of a generic SaaS dashboard: readiness as a gauge reading, confidence
 * as the width of a "signal cone" around the needle (wider = less
 * certain, so confidence is felt, not just labeled), trajectory as an
 * observed-vs-forecast track. Swap the COLORS/fonts below for ACEAPT's
 * real tokens once you have them.
 */

const COLORS = {
  bg: '#12161C',
  surface: '#1A2029',
  surfaceRaised: '#212836',
  border: '#2B3340',
  borderSoft: '#232A35',
  textPrimary: '#EDEAE2',
  textMuted: '#8891A0',
  textFaint: '#5B6472',
  brass: '#D6A15A',
  teal: '#56B4C8',
  sage: '#82B896',
  brick: '#C56A5E',
};

const FONT_DISPLAY = "'Space Grotesk', ui-sans-serif, system-ui, sans-serif";
const FONT_BODY = "'Inter', ui-sans-serif, system-ui, sans-serif";
const FONT_MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

const DEMO = {
  BEFORE: {
    readiness: 68.8,
    target: 85,
    daysRemaining: 14,
    trajectory: 'SLOWING',
    momentum: 'STABLE',
    confidence: 'HIGH',
    targetStatus: 'AT_RISK',
    estWeeks: 9.8,
    primaryBottleneck: 'Data Interpretation',
    strengths: ['An improving readiness trend'],
    risks: [
      { label: 'Time Management', severity: 'MEDIUM' },
      { label: 'Endurance', severity: 'HIGH' },
    ],
    skills: [
      { name: 'Arithmetic', value: 72 },
      { name: 'Logical Reasoning', value: 88 },
      { name: 'Data Interpretation', value: 70 },
      { name: 'Time Management', value: 51 },
    ],
    history: [58, 61, 64, 65, 67, 67],
    forecastNext: 68.8,
    explanation:
      "Your current readiness is 68.8%, with a target of 85%. Recent strengths include an improving readiness trend. Right now, data interpretation is the biggest factor limiting readiness. Areas to watch: time management, endurance. The system's confidence in this forecast is currently high.",
  },
  AFTER: {
    readiness: 84,
    target: 85,
    daysRemaining: 3,
    trajectory: 'UPWARD',
    momentum: 'SLOWING',
    confidence: 'HIGH',
    targetStatus: 'ON_TRACK',
    estWeeks: 1.3,
    primaryBottleneck: 'Data Interpretation',
    strengths: ['An improving readiness trend'],
    risks: [],
    skills: [
      { name: 'Arithmetic', value: 72 },
      { name: 'Logical Reasoning', value: 88 },
      { name: 'Data Interpretation', value: 79 },
      { name: 'Time Management', value: 74 },
    ],
    history: [58, 61, 64, 65, 67, 67, 74, 78, 81],
    forecastNext: 84,
    explanation:
      "Your current readiness is 84%, with a target of 85%. Recent strengths include an improving readiness trend. Right now, data interpretation is the biggest factor limiting readiness. The system's confidence in this forecast is currently high.",
  },
};

const RISK_SLOTS = ['Time Management', 'Endurance', 'Retention', 'Early Warning'];

const TRAJECTORY_META = {
  UPWARD: { label: 'Upward', Icon: TrendingUp, color: COLORS.sage },
  STABLE: { label: 'Stable', Icon: Minus, color: COLORS.teal },
  SLOWING: { label: 'Slowing', Icon: TrendingUp, color: COLORS.brass },
  REGRESSING: { label: 'Regressing', Icon: TrendingDown, color: COLORS.brick },
  UNSTABLE: { label: 'Unstable', Icon: AlertTriangle, color: COLORS.brick },
  INSUFFICIENT_EVIDENCE: { label: 'Insufficient evidence', Icon: Minus, color: COLORS.textFaint },
};

const TARGET_STATUS_META = {
  ON_TRACK: { label: 'On track', color: COLORS.sage },
  AT_RISK: { label: 'At risk', color: COLORS.brass },
  BEHIND: { label: 'Behind', color: COLORS.brick },
  INSUFFICIENT_EVIDENCE: { label: 'Insufficient evidence', color: COLORS.textFaint },
};

const CONFIDENCE_CONE_DEGREES = { HIGH: 4, MEDIUM: 10, LOW: 20, INSUFFICIENT_EVIDENCE: 34 };

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

const GAUGE_START = 135;
const GAUGE_SWEEP = 270;
const valueToAngle = (v) => GAUGE_START + (Math.max(0, Math.min(100, v)) / 100) * GAUGE_SWEEP;

function ReadinessGauge({ value, target, confidence }) {
  const cx = 150, cy = 145, r = 105, coneR = 82;
  const needleAngle = valueToAngle(value);
  const targetAngle = valueToAngle(target);
  const cone = CONFIDENCE_CONE_DEGREES[confidence] ?? 20;
  const inner = polarToCartesian(cx, cy, r - 12, targetAngle);
  const outer = polarToCartesian(cx, cy, r + 14, targetAngle);

  return (
    <svg viewBox="0 0 300 250" className="w-full h-auto">
      <path d={describeArc(cx, cy, r, GAUGE_START, GAUGE_START + GAUGE_SWEEP)} fill="none" stroke={COLORS.border} strokeWidth={14} strokeLinecap="round" />
      <path d={describeArc(cx, cy, r, GAUGE_START, needleAngle)} fill="none" stroke={COLORS.brass} strokeWidth={14} strokeLinecap="round" />
      <path
        d={describeArc(cx, cy, coneR, needleAngle - cone, needleAngle + cone)}
        fill="none"
        stroke={COLORS.brass}
        strokeOpacity={0.3}
        strokeWidth={18}
        strokeLinecap="round"
      />
      <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke={COLORS.teal} strokeWidth={3} strokeLinecap="round" />
      <text x={cx} y={cy - 12} textAnchor="middle" fontSize={46} fontWeight={600} fill={COLORS.textPrimary} style={{ fontFamily: FONT_DISPLAY }}>
        {value}
        <tspan fontSize={20} dx={2} fill={COLORS.textMuted}>%</tspan>
      </text>
      <text x={cx} y={cy + 16} textAnchor="middle" fontSize={11} fill={COLORS.textFaint} style={{ fontFamily: FONT_MONO, letterSpacing: 2 }}>
        READINESS
      </text>
      <text x={cx} y={cy + 42} textAnchor="middle" fontSize={12} fill={COLORS.teal} style={{ fontFamily: FONT_MONO }}>
        TARGET {target}%
      </text>
    </svg>
  );
}

function TrajectoryStrip({ history, forecastNext, target }) {
  const width = 640, height = 160, padL = 8, padR = 100, padT = 18, padB = 22;
  const allValues = [...history, forecastNext, target, 40];
  const minV = Math.min(...allValues);
  const maxV = Math.max(...allValues, 100);
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const n = history.length;
  const xFor = (i) => padL + (i / n) * innerW;
  const yFor = (v) => padT + innerH - ((v - minV) / (maxV - minV)) * innerH;

  const observedPts = history.map((v, i) => `${xFor(i).toFixed(1)},${yFor(v).toFixed(1)}`).join(' ');
  const forecastX = xFor(n);
  const forecastY = yFor(forecastNext);
  const lastX = xFor(n - 1);
  const lastY = yFor(history[n - 1]);
  const targetY = yFor(target);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
      <line x1={padL} y1={targetY} x2={width - padR + 60} y2={targetY} stroke={COLORS.teal} strokeDasharray="2 5" strokeWidth={1} />
      <text x={width - padR + 66} y={targetY + 4} fontSize={11} fill={COLORS.teal} style={{ fontFamily: FONT_MONO }}>
        TARGET {target}%
      </text>

      <polyline points={observedPts} fill="none" stroke={COLORS.brass} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {history.map((v, i) => (
        <circle key={i} cx={xFor(i)} cy={yFor(v)} r={3.5} fill={COLORS.brass} />
      ))}

      <line x1={lastX} y1={lastY} x2={forecastX} y2={forecastY} stroke={COLORS.teal} strokeWidth={2.5} strokeDasharray="5 4" strokeLinecap="round" />
      <circle cx={forecastX} cy={forecastY} r={5} fill={COLORS.bg} stroke={COLORS.teal} strokeWidth={2.5} />
      <text x={forecastX + 10} y={forecastY + 4} fontSize={11} fill={COLORS.teal} style={{ fontFamily: FONT_MONO }}>
        FORECAST
      </text>

      <text x={padL} y={height - 4} fontSize={10} fill={COLORS.textFaint} style={{ fontFamily: FONT_MONO, letterSpacing: 1 }}>
        OBSERVED -&gt; PROJECTED (NOT GUARANTEED)
      </text>
    </svg>
  );
}

function RiskLights({ risks }) {
  const severityColor = { HIGH: COLORS.brick, MEDIUM: COLORS.brass, LOW: COLORS.sage };
  return (
    <div className="flex flex-wrap gap-2">
      {RISK_SLOTS.map((slot) => {
        const risk = risks.find((r) => r.label === slot) ?? null;
        const color = risk ? severityColor[risk.severity] : COLORS.textFaint;
        return (
          <div
            key={slot}
            className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{ background: COLORS.surface, border: `1px solid ${COLORS.borderSoft}` }}
          >
            <span
              className="inline-block rounded-full"
              style={{
                width: 9,
                height: 9,
                background: risk ? color : 'transparent',
                border: `1.5px solid ${color}`,
                boxShadow: risk ? `0 0 8px ${color}` : 'none',
              }}
            />
            <span className="text-xs" style={{ fontFamily: FONT_MONO, color: risk ? COLORS.textPrimary : COLORS.textFaint }}>
              {slot.toUpperCase()}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SkillBars({ skills }) {
  return (
    <div className="space-y-3">
      {skills.map((s) => (
        <div key={s.name}>
          <div className="flex justify-between mb-1">
            <span className="text-xs" style={{ color: COLORS.textMuted, fontFamily: FONT_BODY }}>
              {s.name}
            </span>
            <span className="text-xs" style={{ color: COLORS.textPrimary, fontFamily: FONT_MONO }}>
              {s.value}%
            </span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: COLORS.border }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${s.value}%`, background: s.value < 60 ? COLORS.brick : s.value < 75 ? COLORS.brass : COLORS.sage }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function Toggle({ state, onChange }) {
  return (
    <div className="relative inline-flex p-1 rounded-full" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
      {['BEFORE', 'AFTER'].map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className="relative z-10 px-4 py-1.5 text-xs rounded-full transition-colors"
          style={{
            fontFamily: FONT_MONO,
            letterSpacing: 1,
            color: state === opt ? COLORS.bg : COLORS.textMuted,
            background: state === opt ? COLORS.brass : 'transparent',
            fontWeight: 600,
          }}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

export default function ReadinessDashboard({ onViewPlan } = {}) {
  const [state, setState] = useState('BEFORE');
  const data = DEMO[state];
  const trajMeta = TRAJECTORY_META[data.trajectory] ?? TRAJECTORY_META.INSUFFICIENT_EVIDENCE;
  const targetMeta = TARGET_STATUS_META[data.targetStatus] ?? TARGET_STATUS_META.INSUFFICIENT_EVIDENCE;
  const TrajIcon = trajMeta.Icon;

  return (
    <div className="w-full rounded-2xl p-5 sm:p-8" style={{ background: COLORS.bg, fontFamily: FONT_BODY }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');`}</style>

      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <div className="text-xs mb-1" style={{ fontFamily: FONT_MONO, color: COLORS.textFaint, letterSpacing: 2 }}>
            ACEAPT / FEATURE 10
          </div>
          <h2 className="text-xl font-semibold" style={{ color: COLORS.textPrimary, fontFamily: FONT_DISPLAY }}>
            Readiness Forecast
          </h2>
        </div>
        <Toggle state={state} onChange={setState} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 mb-6">
        {/* Gauge panel */}
        <div className="lg:col-span-2 rounded-xl p-5 flex flex-col items-center" style={{ background: COLORS.surface, border: `1px solid ${COLORS.borderSoft}` }}>
          <ReadinessGauge value={data.readiness} target={data.target} confidence={data.confidence} />
          <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
            <span
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs"
              style={{ background: COLORS.surfaceRaised, color: trajMeta.color, fontFamily: FONT_MONO }}
            >
              <TrajIcon size={12} /> {trajMeta.label.toUpperCase()}
            </span>
            <span
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs"
              style={{ background: COLORS.surfaceRaised, color: targetMeta.color, fontFamily: FONT_MONO }}
            >
              {targetMeta.label.toUpperCase()}
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs" style={{ background: COLORS.surfaceRaised, color: COLORS.textMuted, fontFamily: FONT_MONO }}>
              CONF: {data.confidence}
            </span>
          </div>
          <div className="text-xs mt-3 text-center" style={{ color: COLORS.textFaint, fontFamily: FONT_MONO }}>
            {data.estWeeks != null ? `~${data.estWeeks} wks to target at current pace` : 'Not enough evidence to estimate time-to-target'} &middot; {data.daysRemaining}d remaining
          </div>
        </div>

        {/* Evidence ledger */}
        <div className="lg:col-span-3 rounded-xl p-5" style={{ background: COLORS.surface, border: `1px solid ${COLORS.borderSoft}` }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
            <div>
              <div className="text-xs mb-2" style={{ fontFamily: FONT_MONO, color: COLORS.sage, letterSpacing: 1 }}>
                WHAT'S IMPROVING
              </div>
              <ul className="space-y-1.5">
                {data.strengths.map((s) => (
                  <li key={s} className="flex items-start gap-2 text-sm" style={{ color: COLORS.textPrimary }}>
                    <CheckCircle2 size={15} style={{ color: COLORS.sage, marginTop: 2, flexShrink: 0 }} />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-xs mb-2" style={{ fontFamily: FONT_MONO, color: COLORS.brick, letterSpacing: 1 }}>
                WHAT'S LIMITING YOU
              </div>
              <ul className="space-y-1.5">
                <li className="flex items-start gap-2 text-sm" style={{ color: COLORS.textPrimary }}>
                  <AlertTriangle size={15} style={{ color: COLORS.brick, marginTop: 2, flexShrink: 0 }} />
                  {data.primaryBottleneck} (primary bottleneck)
                </li>
                {data.risks.map((r) => (
                  <li key={r.label} className="flex items-start gap-2 text-sm" style={{ color: COLORS.textPrimary }}>
                    <AlertTriangle size={15} style={{ color: COLORS.brass, marginTop: 2, flexShrink: 0 }} />
                    {r.label}
                  </li>
                ))}
                {data.risks.length === 0 && (
                  <li className="text-sm" style={{ color: COLORS.textFaint }}>
                    No active risk signals right now.
                  </li>
                )}
              </ul>
            </div>
          </div>

          <div
            className="rounded-lg p-4 flex items-center justify-between gap-4"
            style={{ background: COLORS.surfaceRaised, border: `1px solid ${COLORS.border}` }}
          >
            <div>
              <div className="text-xs mb-1" style={{ fontFamily: FONT_MONO, color: COLORS.textFaint, letterSpacing: 1 }}>
                CURRENT PRIORITY
              </div>
              <div className="text-sm" style={{ color: COLORS.textPrimary }}>
                Improve time allocation on {data.primaryBottleneck.toLowerCase()} during mixed assessments.
              </div>
            </div>
            <button
              onClick={() => (onViewPlan ? onViewPlan(data) : null)}
              className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs whitespace-nowrap flex-shrink-0"
              style={{ background: COLORS.brass, color: COLORS.bg, fontFamily: FONT_MONO, fontWeight: 600 }}
            >
              VIEW PLAN <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Trajectory strip */}
      <div className="rounded-xl p-5 mb-6" style={{ background: COLORS.surface, border: `1px solid ${COLORS.borderSoft}` }}>
        <div className="text-xs mb-2" style={{ fontFamily: FONT_MONO, color: COLORS.textFaint, letterSpacing: 1 }}>
          TRAJECTORY
        </div>
        <TrajectoryStrip history={data.history} forecastNext={data.forecastNext} target={data.target} />
      </div>

      {/* Bottom row: skill readout + risk lights */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 mb-6">
        <div className="lg:col-span-3 rounded-xl p-5" style={{ background: COLORS.surface, border: `1px solid ${COLORS.borderSoft}` }}>
          <div className="text-xs mb-3" style={{ fontFamily: FONT_MONO, color: COLORS.textFaint, letterSpacing: 1 }}>
            READINESS MAP
          </div>
          <SkillBars skills={data.skills} />
        </div>
        <div className="lg:col-span-2 rounded-xl p-5" style={{ background: COLORS.surface, border: `1px solid ${COLORS.borderSoft}` }}>
          <div className="text-xs mb-3" style={{ fontFamily: FONT_MONO, color: COLORS.textFaint, letterSpacing: 1 }}>
            RISK SIGNALS
          </div>
          <RiskLights risks={data.risks} />
        </div>
      </div>

      {/* Explanation */}
      <div className="rounded-xl p-5" style={{ background: COLORS.surfaceRaised, border: `1px solid ${COLORS.border}` }}>
        <div className="text-xs mb-2" style={{ fontFamily: FONT_MONO, color: COLORS.textFaint, letterSpacing: 1 }}>
          WHY THIS FORECAST
        </div>
        <p className="text-sm leading-relaxed" style={{ color: COLORS.textMuted }}>
          {data.explanation}
        </p>
      </div>
    </div>
  );
}
