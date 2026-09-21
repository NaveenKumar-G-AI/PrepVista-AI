import React, { useEffect, useState } from 'react';
import { speedApi } from '../api/speedApi';
import { ScopeKey, SpeedProfile, TrainingMode } from '../types/speed';

export interface SpeedTrainingSetupProps {
  scope: ScopeKey;
  skillLabel: string;
  onStart: (mode: TrainingMode) => void;
}

const MODES: { value: TrainingMode; label: string; blurb: string }[] = [
  { value: 'FLUENCY', label: 'Fluency', blurb: 'Repeated known operations - reduce unnecessary execution time.' },
  { value: 'RECOGNITION', label: 'Recognition', blurb: 'Rapidly identify question type.' },
  { value: 'STRATEGY', label: 'Strategy', blurb: 'Rapid method selection.' },
  { value: 'CALCULATION', label: 'Calculation', blurb: 'Mental/math execution speed.' },
  { value: 'READING', label: 'Reading', blurb: 'Extract relevant information faster.' },
  { value: 'BALANCED', label: 'Balanced', blurb: 'Speed and accuracy together - the safe default.' },
  { value: 'DECISION', label: 'Decision', blurb: 'Attempt / skip / return judgment.' },
];

/** Spec 52: always previews the student's own current evidence before a
 * session starts, rather than opening straight into a blind timer. */
export function SpeedTrainingSetup({ scope, skillLabel, onStart }: SpeedTrainingSetupProps) {
  const [profile, setProfile] = useState<SpeedProfile | null | undefined>(undefined);
  const [selected, setSelected] = useState<TrainingMode>('BALANCED');

  useEffect(() => {
    let cancelled = false;
    speedApi
      .getProfile(scope)
      .then((p) => !cancelled && setProfile(p))
      .catch(() => !cancelled && setProfile(null));
    return () => {
      cancelled = true;
    };
  }, [scope.scopeType, scope.scopeId]);

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="text-lg font-semibold text-slate-900">Speed training - {skillLabel}</h2>

      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
        {profile === undefined && <p className="text-slate-400">Loading your current pace...</p>}
        {profile === null && <p className="text-slate-500">Not enough attempts yet to show a baseline - we'll build one as you go.</p>}
        {profile && (
          <p className="text-slate-700">
            Your current pace is <span className="font-mono font-semibold">{Math.round(profile.averageMs / 1000)}s</span> at{' '}
            <span className="font-semibold">{Math.round(profile.accuracy * 100)}%</span> accuracy
            {profile.confidence === 'LOW' && <span className="text-slate-400"> (still early evidence)</span>}.
          </p>
        )}
      </div>

      <fieldset className="mt-5">
        <legend className="text-xs font-medium uppercase tracking-wide text-slate-400">Choose a focus</legend>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {MODES.map((mode) => (
            <label
              key={mode.value}
              className={`cursor-pointer rounded-lg border p-3 transition ${
                selected === mode.value ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <input type="radio" name="mode" value={mode.value} checked={selected === mode.value} onChange={() => setSelected(mode.value)} className="sr-only" />
              <p className="text-sm font-medium text-slate-800">{mode.label}</p>
              <p className="mt-0.5 text-xs text-slate-500">{mode.blurb}</p>
            </label>
          ))}
        </div>
      </fieldset>

      <button
        type="button"
        onClick={() => onStart(selected)}
        className="mt-5 w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 sm:w-auto"
      >
        Start session
      </button>
    </div>
  );
}

export default SpeedTrainingSetup;
