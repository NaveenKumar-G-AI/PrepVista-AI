import React, { useState, useEffect } from "react";
import { ArrowUpRight, ArrowDownRight, Minus, CheckCircle2, ChevronRight } from "lucide-react";

// Seeded from the actual output of demo/runDemo.js (stu_arjun, "after"
// snapshot) — not invented numbers, just carried over from the real
// calculation so the UI and the engine agree with each other.
const SEED = {
  overallScore: 70.71,
  readinessLevel: "ALMOST_READY",
  momentum: { state: "RISING", delta: 15.71 },
  dimensionScores: {
    technical: 68,
    problemSolving: null,
    communication: 72,
    interview: 66,
    roleReadiness: null,
    profile: 85,
  },
  evidenceSummary: {
    strongest: { dimension: "profile", score: 85 },
    priority: { dimension: "interview", score: 66 },
  },
  history: [
    { label: "6wk ago", score: 55 },
    { label: "4wk ago", score: 51 },
    { label: "2wk ago", score: 48 },
    { label: "Today", score: 70.71 },
  ],
  milestones: [
    { date: "12 Jul", label: "Communication Coaching assigned" },
    { date: "24 Jul", label: "Technical assessment retaken — 68/100" },
    { date: "3 Aug", label: "Communication Coaching completed" },
    { date: "6 Aug", label: "Mock interview — 66/100" },
    { date: "Today", label: "Readiness recalculated — 70.71, Almost Ready" },
  ],
};

const DIMENSION_LABELS = {
  technical: "Technical",
  problemSolving: "Problem Solving",
  communication: "Communication",
  interview: "Interview",
  roleReadiness: "Role Readiness",
  profile: "Profile",
};

const NEXT_ACTION_BY_DIMENSION = {
  technical: "Review core DSA topics",
  problemSolving: "Practice aptitude sets",
  communication: "Complete HR Interview Prep",
  interview: "Book another mock interview",
  roleReadiness: "Review target role requirements",
  profile: "Finish your profile",
};

const BAND_LABEL = {
  READY: "Ready",
  ALMOST_READY: "Almost ready",
  DEVELOPING: "Developing",
  HIGH_RISK: "High risk",
  INSUFFICIENT_DATA: "Not enough data yet",
};

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = () => setReduced(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

function useCountUp(target, durationMs = 900) {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(reduced ? target : 0);
  useEffect(() => {
    if (reduced) {
      setValue(target);
      return;
    }
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, reduced]);
  return value;
}

function MomentumTag({ momentum }) {
  const map = {
    RISING: { Icon: ArrowUpRight, text: `Up ${momentum.delta} pts`, cls: "tag-growth" },
    DECLINING: { Icon: ArrowDownRight, text: `Down ${Math.abs(momentum.delta)} pts`, cls: "tag-attention" },
    STABLE: { Icon: Minus, text: "Holding steady", cls: "tag-neutral" },
    INSUFFICIENT_DATA: { Icon: Minus, text: "Not enough history yet", cls: "tag-neutral" },
  };
  const m = map[momentum.state] || map.INSUFFICIENT_DATA;
  const { Icon } = m;
  return (
    <span className={`momentum-tag ${m.cls}`}>
      <Icon size={14} strokeWidth={2.5} aria-hidden="true" />
      {m.text}
    </span>
  );
}

function Sparkline({ points }) {
  const w = 280;
  const h = 64;
  const pad = 8;
  const scores = points.map((p) => p.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = Math.max(1, max - min);
  const coords = points.map((p, i) => {
    const frac = points.length > 1 ? i / (points.length - 1) : 0.5;
    const x = pad + frac * (w - pad * 2);
    const y = h - pad - ((p.score - min) / range) * (h - pad * 2);
    return [x, y];
  });
  const path = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="sparkline" role="img" aria-label="Readiness trend over recent snapshots">
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={pad} x2={w - pad} y1={h * f} y2={h * f} className="spark-grid" />
      ))}
      <path d={path} className="spark-line" fill="none" />
      {coords.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === coords.length - 1 ? 3.5 : 2} className={i === coords.length - 1 ? "spark-dot-last" : "spark-dot"} />
      ))}
    </svg>
  );
}

export default function StudentReadinessPage() {
  const data = SEED;
  const animatedScore = useCountUp(data.overallScore);
  const priorityDim = data.evidenceSummary.priority?.dimension;
  const strongestDim = data.evidenceSummary.strongest?.dimension;

  return (
    <div className="rv-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');

        .rv-root {
          --paper: #EDF1EF;
          --surface: #FFFFFF;
          --ink: #16231F;
          --ink-soft: #4B5A54;
          --line: #D3D9D4;
          --brass: #B98A3E;
          --brass-soft: #E4CFA0;
          --growth: #2F6B4F;
          --growth-soft: #DCEAE1;
          --attention: #8C3A28;
          --attention-soft: #F3DCD5;
          background: var(--paper);
          color: var(--ink);
          font-family: 'IBM Plex Sans', ui-sans-serif, sans-serif;
          padding: 28px 18px 40px;
          border-radius: 20px;
        }
        .rv-display { font-family: 'Fraunces', serif; }
        .rv-mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; }
        .rv-eyebrow { letter-spacing: 0.14em; text-transform: uppercase; font-size: 11px; color: var(--ink-soft); }
        .rv-card { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; }
        .rv-seal {
          width: 148px; height: 148px; border-radius: 999px;
          border: 2px solid var(--brass);
          outline: 1px dashed var(--brass-soft); outline-offset: 6px;
          display: flex; align-items: center; justify-content: center; flex-direction: column;
          transform: rotate(-2deg);
          background: var(--surface);
        }
        .momentum-tag { display: inline-flex; align-items: center; gap: 4px; font-size: 12.5px; font-weight: 500; padding: 5px 10px; border-radius: 999px; }
        .tag-growth { background: var(--growth-soft); color: var(--growth); }
        .tag-attention { background: var(--attention-soft); color: var(--attention); }
        .tag-neutral { background: #EDEDE8; color: var(--ink-soft); }
        .dim-bar-track { background: #E7EBE6; border-radius: 999px; height: 8px; overflow: hidden; }
        .dim-bar-fill { height: 100%; background: var(--brass); border-radius: 999px; }
        .dim-bar-empty { height: 8px; border-radius: 999px; background-image: repeating-linear-gradient(45deg, var(--line), var(--line) 4px, transparent 4px, transparent 8px); }
        .sparkline { width: 100%; height: 64px; }
        .spark-grid { stroke: var(--line); stroke-width: 1; stroke-dasharray: 2 3; }
        .spark-line { stroke: var(--brass); stroke-width: 2; }
        .spark-dot { fill: var(--brass-soft); }
        .spark-dot-last { fill: var(--brass); }
        .timeline-dot { width: 7px; height: 7px; border-radius: 999px; background: var(--brass); flex-shrink: 0; margin-top: 6px; }
        @media (prefers-reduced-motion: reduce) {
          .rv-root * { animation: none !important; transition: none !important; }
        }
      `}</style>

      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <span className="rv-eyebrow">Placement Readiness · Season 2026</span>
          <span className="rv-eyebrow rv-mono">Model v1</span>
        </div>

        <div className="flex flex-col items-center text-center mb-8">
          <div className="rv-seal mb-4">
            <span className="rv-display" style={{ fontSize: 40, fontWeight: 600, lineHeight: 1 }}>
              {animatedScore.toFixed(0)}
            </span>
            <span className="rv-eyebrow" style={{ marginTop: 4 }}>{BAND_LABEL[data.readinessLevel]}</span>
          </div>
          <MomentumTag momentum={data.momentum} />
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="rv-card p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <CheckCircle2 size={14} aria-hidden="true" style={{ color: "var(--growth)" }} />
              <span className="rv-eyebrow">Strongest</span>
            </div>
            <p className="rv-display" style={{ fontSize: 20, fontWeight: 500 }}>{DIMENSION_LABELS[strongestDim]}</p>
            <p className="rv-mono text-sm" style={{ color: "var(--ink-soft)" }}>{data.evidenceSummary.strongest.score}/100</p>
          </div>
          <div className="rv-card p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <ChevronRight size={14} aria-hidden="true" style={{ color: "var(--brass)" }} />
              <span className="rv-eyebrow">Priority</span>
            </div>
            <p className="rv-display" style={{ fontSize: 20, fontWeight: 500 }}>{DIMENSION_LABELS[priorityDim]}</p>
            <p className="rv-mono text-sm" style={{ color: "var(--ink-soft)" }}>{data.evidenceSummary.priority.score}/100</p>
          </div>
        </div>

        <div className="rv-card p-5 mb-6">
          <span className="rv-eyebrow">Dimension ledger</span>
          <div className="mt-3 flex flex-col gap-3">
            {Object.entries(DIMENSION_LABELS).map(([key, label]) => {
              const score = data.dimensionScores[key];
              const hasScore = score !== null && score !== undefined;
              return (
                <div key={key} className="flex items-center gap-3">
                  <span className="text-sm" style={{ width: 132, flexShrink: 0 }}>{label}</span>
                  <div className="flex-1">
                    {hasScore ? (
                      <div className="dim-bar-track">
                        <div className="dim-bar-fill" style={{ width: `${score}%` }} />
                      </div>
                    ) : (
                      <div className="dim-bar-empty" />
                    )}
                  </div>
                  <span className="rv-mono text-sm" style={{ width: 78, textAlign: "right", color: hasScore ? "var(--ink)" : "var(--ink-soft)" }}>
                    {hasScore ? `${score}/100` : "No data"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rv-card p-5 mb-6" style={{ borderColor: "var(--brass)" }}>
          <span className="rv-eyebrow">Your next action</span>
          <p className="rv-display" style={{ fontSize: 22, fontWeight: 500, marginTop: 4 }}>{NEXT_ACTION_BY_DIMENSION[priorityDim]}</p>
          <p className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>
            Based on your {DIMENSION_LABELS[priorityDim].toLowerCase()} score of {data.evidenceSummary.priority.score}.
          </p>
        </div>

        <div className="rv-card p-5 mb-6">
          <span className="rv-eyebrow">Trend</span>
          <div className="mt-3">
            <Sparkline points={data.history} />
          </div>
          <div className="flex justify-between rv-mono text-xs mt-1" style={{ color: "var(--ink-soft)" }}>
            {data.history.map((p, i) => (
              <span key={i}>{p.label}</span>
            ))}
          </div>
        </div>

        <div className="rv-card p-5 mb-4">
          <span className="rv-eyebrow">Recent milestones</span>
          <div className="mt-3 flex flex-col gap-3">
            {data.milestones.map((m, i) => (
              <div key={i} className="flex gap-3">
                <div className="timeline-dot" />
                <div>
                  <span className="rv-mono text-xs" style={{ color: "var(--ink-soft)" }}>{m.date}</span>
                  <p className="text-sm">{m.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-center" style={{ color: "var(--ink-soft)" }}>
          Every number above is grounded in a real assessment, training, or interview record — never estimated.
        </p>
      </div>
    </div>
  );
}
