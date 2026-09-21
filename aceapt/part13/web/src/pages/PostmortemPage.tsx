import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { Explanation, SimulationPostmortem } from "../lib/types";

function SegmentTrace({ pm }: { pm: SimulationPostmortem }) {
  const points = [
    { label: "First 25%", value: pm.degradation.firstQuarterAccuracy },
    { label: "Middle 50%", value: pm.degradation.middleHalfAccuracy },
    { label: "Final 25%", value: pm.degradation.finalQuarterAccuracy },
  ];
  if (points.every((p) => p.value === null)) {
    return <p className="text-sm text-paper-500">Not enough questions in this simulation to trace a timeline.</p>;
  }

  const W = 560;
  const H = 140;
  const padX = 50;
  const padY = 20;
  const xs = [padX, W / 2, W - padX];
  const yFor = (v: number) => padY + (1 - v / 100) * (H - padY * 2);
  const path = points
    .map((p, i) => (p.value !== null ? `${i === 0 ? "M" : "L"} ${xs[i]} ${yFor(p.value)}` : ""))
    .filter(Boolean)
    .join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      {[0, 50, 100].map((g) => (
        <line key={g} x1={padX} x2={W - padX} y1={yFor(g)} y2={yFor(g)} stroke="#1A2537" strokeWidth="1" strokeDasharray={g === 0 ? undefined : "2 5"} />
      ))}
      <path d={path} fill="none" stroke={pm.degradation.hasDegradation ? "#E0667A" : "#4FD1A5"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) =>
        p.value !== null ? (
          <g key={p.label}>
            <circle cx={xs[i]} cy={yFor(p.value)} r="4" fill="#0B1220" stroke={pm.degradation.hasDegradation ? "#E0667A" : "#4FD1A5"} strokeWidth="2" />
            <text x={xs[i]} y={yFor(p.value) - 12} textAnchor="middle" fontSize="12" fontFamily="IBM Plex Mono, monospace" fill="#EDF1F7">
              {p.value.toFixed(0)}%
            </text>
            <text x={xs[i]} y={H - 2} textAnchor="middle" fontSize="10" fill="#8794A8" fontFamily="IBM Plex Sans, sans-serif">
              {p.label}
            </text>
          </g>
        ) : null
      )}
    </svg>
  );
}

function QuadrantBreakdown({ pm }: { pm: SimulationPostmortem }) {
  const b = pm.speedAccuracy.buckets;
  const cells = [
    { key: "HIGH_ACCURACY_HIGH_SPEED", label: "Correct · on pace", tone: "text-signal-ready" },
    { key: "HIGH_ACCURACY_LOW_SPEED", label: "Correct · slow", tone: "text-signal-developing" },
    { key: "LOW_ACCURACY_HIGH_SPEED", label: "Wrong · rushed", tone: "text-signal-developing" },
    { key: "LOW_ACCURACY_LOW_SPEED", label: "Wrong · slow", tone: "text-signal-risk" },
  ] as const;
  return (
    <div className="grid grid-cols-2 gap-3">
      {cells.map((c) => (
        <div key={c.key} className="rounded-lg border border-ink-600 px-3 py-2.5">
          <div className={`data-figure text-xl ${c.tone}`}>{(b[c.key] ?? 0).toFixed(0)}%</div>
          <div className="text-xs text-paper-500 mt-0.5">{c.label}</div>
        </div>
      ))}
    </div>
  );
}

export default function PostmortemPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<{ postmortem: SimulationPostmortem; explanation: Explanation } | null>(null);

  useEffect(() => {
    if (!id) return;
    api.get<{ postmortem: SimulationPostmortem; explanation: Explanation }>(`/simulations/${id}/postmortem`).then(setData);
  }, [id]);

  if (!data) return <div className="text-center text-paper-500 py-24 text-sm">Loading postmortem…</div>;
  const { postmortem: pm, explanation } = data;

  return (
    <div className="max-w-3xl mx-auto pb-16">
      <div className="label-caps mb-2">What happened</div>
      <h1 className="font-display text-2xl font-semibold text-paper-100 mb-6">Simulation Postmortem</h1>

      <div className="panel p-5 mb-6">
        <p className="text-sm text-paper-300 leading-relaxed whitespace-pre-line">{explanation.text}</p>
      </div>

      <div className="panel p-6 mb-6">
        <div className="label-caps mb-4">Performance across the assessment</div>
        <SegmentTrace pm={pm} />
        {pm.degradation.supportingSignals.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm text-paper-500">
            {pm.degradation.supportingSignals.map((s) => (
              <li key={s}>— {s}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div className="panel p-6">
          <div className="label-caps mb-4">Speed vs. accuracy</div>
          <QuadrantBreakdown pm={pm} />
        </div>

        <div className="panel p-6">
          <div className="label-caps mb-4">Time allocation</div>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="data-figure text-2xl text-paper-100">{Math.round(pm.timeAllocation.avgTimePerQuestionSeconds)}s</span>
            <span className="text-xs text-paper-500">avg / question</span>
          </div>
          {pm.timeAllocation.sinkObservations.length > 0 ? (
            <ul className="space-y-2 text-sm text-paper-300">
              {pm.timeAllocation.sinkObservations.map((s) => (
                <li key={s} className="text-signal-developing">
                  ! {s}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-paper-500">No major time sinks detected.</p>
          )}
        </div>

        <div className="panel p-6">
          <div className="label-caps mb-4">Topic switching</div>
          {pm.topicSwitching.switchCount > 0 ? (
            <>
              <div className="flex items-baseline gap-3 mb-2">
                <div>
                  <div className="data-figure text-xl text-paper-100">{pm.topicSwitching.steadyStateAccuracy?.toFixed(0) ?? "—"}%</div>
                  <div className="text-xs text-paper-500">same-topic</div>
                </div>
                <span className="text-paper-500">→</span>
                <div>
                  <div className={`data-figure text-xl ${pm.topicSwitching.hasGap ? "text-signal-risk" : "text-paper-100"}`}>
                    {pm.topicSwitching.postSwitchAccuracy?.toFixed(0) ?? "—"}%
                  </div>
                  <div className="text-xs text-paper-500">after switch</div>
                </div>
              </div>
              <p className="text-sm text-paper-500">{pm.topicSwitching.switchCount} topic transitions</p>
            </>
          ) : (
            <p className="text-sm text-paper-500">No topic transitions in this simulation.</p>
          )}
        </div>

        <div className="panel p-6">
          <div className="label-caps mb-4">Recovery</div>
          {pm.recovery.postErrorRecoveryRate !== null ? (
            <>
              <div className="data-figure text-2xl text-paper-100 mb-1">{pm.recovery.postErrorRecoveryRate}%</div>
              <p className="text-sm text-paper-500">
                correct immediately after a mistake, across {pm.recovery.errorEventCount} mistake
                {pm.recovery.errorEventCount === 1 ? "" : "s"}
              </p>
            </>
          ) : (
            <p className="text-sm text-paper-500">No mistakes to measure recovery from.</p>
          )}
        </div>
      </div>

      <Link to="/" className="text-sm text-paper-300 hover:text-signal-ready transition-colors">
        ← Back to readiness
      </Link>
    </div>
  );
}
