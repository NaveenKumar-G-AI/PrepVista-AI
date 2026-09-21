import { useState } from 'react';
import { Blueprint, PressureMode } from '../types';

interface Props {
  blueprints: Blueprint[];
  onStart: (blueprintId: string, pressureMode: PressureMode) => void;
  starting: boolean;
}

const PRESSURE_LABELS: Record<PressureMode, string> = {
  NORMAL: 'Normal',
  COMPETITIVE: 'Competitive',
  STRICT: 'Strict',
  HIGH_PRESSURE: 'High pressure',
};

const DIMENSIONS = ['Accuracy', 'Speed', 'Decision making', 'Time management', 'Consistency', 'Recovery', 'Endurance'];

export function SimulationStart({ blueprints, onStart, starting }: Props) {
  const [selectedId, setSelectedId] = useState(blueprints[0]?.id ?? '');
  const selected = blueprints.find((b) => b.id === selectedId);
  const [pressure, setPressure] = useState<PressureMode>(selected?.pressureMode ?? 'NORMAL');

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16 text-bone">
      <p className="readout mb-2 text-xs uppercase tracking-[0.3em] text-brasslight">Feature 9</p>
      <h1 className="font-display text-4xl font-semibold leading-tight md:text-5xl">Real-World Simulation</h1>
      <p className="mt-4 max-w-xl font-body text-slate">
        No topic hints. Mixed aptitude. Time-bound. Your performance will be analyzed across seven dimensions, not
        just a single score.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {DIMENSIONS.map((d) => (
          <span key={d} className="rounded-full border border-inkline px-3 py-1 text-xs text-slate">
            {d}
          </span>
        ))}
      </div>

      <div className="mt-10 grid gap-3">
        {blueprints.map((bp) => (
          <button
            key={bp.id}
            onClick={() => {
              setSelectedId(bp.id);
              setPressure(bp.pressureMode);
            }}
            className={`rounded-xl border px-5 py-4 text-left transition-colors
              ${bp.id === selectedId ? 'border-brass bg-brass/10' : 'border-inkline hover:border-slate'}
            `}
          >
            <div className="flex items-baseline justify-between">
              <span className="font-display text-lg text-bone">{bp.name}</span>
              <span className="readout text-sm text-slate">{Math.round(bp.durationSeconds / 60)} min</span>
            </div>
            <p className="mt-1 text-sm text-slate">{bp.questionCount} mixed questions, difficulty controlled</p>
          </button>
        ))}
      </div>

      <div className="mt-8">
        <p className="mb-2 text-xs uppercase tracking-widest text-slate">Pressure</p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(PRESSURE_LABELS) as PressureMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setPressure(mode)}
              className={`rounded-full border px-4 py-1.5 text-sm transition-colors
                ${pressure === mode ? 'border-brass text-brasslight' : 'border-inkline text-slate hover:border-slate'}
              `}
            >
              {PRESSURE_LABELS[mode]}
            </button>
          ))}
        </div>
      </div>

      <button
        disabled={!selectedId || starting}
        onClick={() => onStart(selectedId, pressure)}
        className="mt-10 w-full rounded-lg bg-brass px-6 py-4 font-display text-lg font-semibold text-ink transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {starting ? 'Starting…' : 'Start Simulation'}
      </button>
    </div>
  );
}
