import React, { useEffect, useState } from 'react';
import { speedApi } from '../api/speedApi';
import { BottleneckAssessment, FrontierPoint, SafeSpeedZone, ScopeKey, SpeedHistoryPoint, SpeedProfile } from '../types/speed';
import { BottleneckCard } from './BottleneckCard';
import { SpeedHistory } from './SpeedHistory';

export interface SpeedDashboardProps {
  scope: ScopeKey;
  skillLabel: string;
  /** Optional - the host app may already have weekly history computed
   * elsewhere; pass it in rather than Feature 50 re-deriving it. */
  history?: SpeedHistoryPoint[];
  onStartTraining?: () => void;
  onTrainBottleneck?: (type: BottleneckAssessment['type']) => void;
}

/** Spec 70: "MY SPEED" - current average, previous, accuracy, status, and
 * focus, all in one place, always framed against the student's own history. */
export function SpeedDashboard({ scope, skillLabel, history = [], onStartTraining, onTrainBottleneck }: SpeedDashboardProps) {
  const [profile, setProfile] = useState<SpeedProfile | null | undefined>(undefined);
  const [bottleneck, setBottleneck] = useState<BottleneckAssessment | null>(null);
  const [frontier, setFrontier] = useState<FrontierPoint[]>([]);
  const [safeZone, setSafeZone] = useState<SafeSpeedZone | null>(null);

  useEffect(() => {
    let cancelled = false;
    speedApi
      .getProfile(scope)
      .then((p) => !cancelled && setProfile(p))
      .catch(() => !cancelled && setProfile(null));
    speedApi
      .getBottlenecks(scope)
      .then((r) => !cancelled && setBottleneck(r.top))
      .catch(() => undefined);
    speedApi
      .getFrontier(scope)
      .then((r) => {
        if (cancelled) return;
        setFrontier(r.frontier);
        setSafeZone(r.safeZone);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [scope.scopeType, scope.scopeId]);

  const previous = history.length >= 2 ? history[history.length - 2] : null;
  const latest = history.length >= 1 ? history[history.length - 1] : null;
  const changeSec = previous && latest ? latest.avgSec - previous.avgSec : null;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">My speed - {skillLabel}</p>

        {profile === undefined && <p className="mt-2 text-sm text-slate-400">Loading...</p>}
        {profile === null && <p className="mt-2 text-sm text-slate-500">Start a session to build your first baseline.</p>}

        {profile && (
          <div className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-3">
            <div>
              <p className="text-xs text-slate-400">Current average</p>
              <p className="font-mono text-3xl font-semibold text-slate-900 tabular-nums">{Math.round(profile.averageMs / 1000)}s</p>
            </div>
            {changeSec !== null && (
              <div>
                <p className="text-xs text-slate-400">Change</p>
                <p className={`font-mono text-lg tabular-nums ${changeSec <= 0 ? 'text-emerald-700' : 'text-slate-600'}`}>
                  {changeSec <= 0 ? '' : '+'}
                  {changeSec}s
                </p>
              </div>
            )}
            <div>
              <p className="text-xs text-slate-400">Accuracy</p>
              <p className="font-mono text-lg tabular-nums text-slate-800">{Math.round(profile.accuracy * 100)}%</p>
            </div>
          </div>
        )}

        {onStartTraining && (
          <button
            type="button"
            onClick={onStartTraining}
            className="mt-5 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            Start speed training
          </button>
        )}
      </div>

      {bottleneck && <BottleneckCard bottleneck={bottleneck} onTrain={onTrainBottleneck ? () => onTrainBottleneck(bottleneck.type) : undefined} />}

      {frontier.length > 0 && <SpeedAccuracyFrontierChart frontier={frontier} safeZone={safeZone} />}

      <SpeedHistory points={history} />
    </div>
  );
}

/** Spec 110-111: the accuracy-vs-speed frontier, with the safe zone shaded
 * in rather than merely stated. Only renders once there's enough evidence
 * (gated upstream by computeSpeedAccuracyFrontier) - never a decorative
 * chart drawn from thin air. */
function SpeedAccuracyFrontierChart({ frontier, safeZone }: { frontier: FrontierPoint[]; safeZone: SafeSpeedZone | null }) {
  const width = 280;
  const height = 120;
  const padding = 8;
  const times = frontier.map((p) => p.avgTimeMs);
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const timeRange = Math.max(1, maxTime - minTime);

  const x = (t: number) => padding + ((t - minTime) / timeRange) * (width - padding * 2);
  const y = (acc: number) => height - padding - acc * (height - padding * 2);

  const guardrailY = safeZone ? y(safeZone.guardrail) : null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Speed vs. accuracy</p>

      {safeZone ? (
        <p className="mt-1 text-sm text-slate-600">
          Your reliable speed zone is{' '}
          <span className="font-mono font-semibold text-slate-800">
            {Math.round(safeZone.minMs / 1000)}–{Math.round(safeZone.maxMs / 1000)}s
          </span>{' '}
          - accuracy generally holds above your {Math.round(safeZone.guardrail * 100)}% guardrail in this range.
        </p>
      ) : (
        <p className="mt-1 text-sm text-slate-500">Not enough evidence yet to highlight a reliable zone.</p>
      )}

      <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 w-full" role="img" aria-label="Accuracy plotted against response time, with your reliable speed zone shaded">
        {safeZone && (
          <rect x={x(safeZone.minMs)} y={padding} width={x(safeZone.maxMs) - x(safeZone.minMs)} height={height - padding * 2} fill="#0f766e" opacity={0.08} />
        )}
        {guardrailY != null && <line x1={padding} y1={guardrailY} x2={width - padding} y2={guardrailY} stroke="#94a3b8" strokeDasharray="3,3" strokeWidth="1" />}
        <path
          d={frontier.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.avgTimeMs).toFixed(1)},${y(p.accuracy).toFixed(1)}`).join(' ')}
          fill="none"
          stroke="#0f766e"
          strokeWidth="1.5"
          opacity={0.5}
        />
        {frontier.map((p) => (
          <circle key={p.avgTimeMs} cx={x(p.avgTimeMs)} cy={y(p.accuracy)} r="3.5" fill="#0f766e" />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-xs text-slate-400">
        <span>{Math.round(minTime / 1000)}s</span>
        <span>faster ← → slower</span>
        <span>{Math.round(maxTime / 1000)}s</span>
      </div>
    </div>
  );
}

export default SpeedDashboard;
