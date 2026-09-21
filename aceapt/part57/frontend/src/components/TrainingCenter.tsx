import { useState } from 'react';
import { api, type DevIdentity } from '../api/client';
import type { ShortcutSummary, TrainingActivityType, TrainingPrompt } from '../types';

const ACTIVITIES: { type: TrainingActivityType; label: string; blurb: string }[] = [
  { type: 'RECALL', label: 'Recall', blurb: 'Name the strategy with no options shown.' },
  { type: 'SELECTION', label: 'Selection', blurb: 'Pick the best method from a short list.' },
  { type: 'APPLICATION', label: 'Application', blurb: 'Apply the method to a worked example.' },
  { type: 'VERIFICATION', label: 'Verification', blurb: 'Decide if the method actually applies here.' },
  { type: 'TRANSFER', label: 'Transfer', blurb: 'Recognise it in an unfamiliar phrasing.' },
  { type: 'PRESSURE', label: 'Pressure', blurb: 'Retrieve it quickly, against a timer.' },
  { type: 'RETENTION', label: 'Retention', blurb: 'Recall it again after time has passed.' },
];

export function TrainingCenter({ identity, candidates }: { identity: DevIdentity; candidates: ShortcutSummary[] }) {
  const [shortcutId, setShortcutId] = useState(candidates[0]?.shortcutId ?? '');
  const [activity, setActivity] = useState<TrainingActivityType>('RECALL');
  const [prompt, setPrompt] = useState<TrainingPrompt | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<'correct' | 'incorrect' | null>(null);

  async function start() {
    if (!shortcutId) return;
    setLastResult(null);
    setRevealed(false);
    const result = await api.post<TrainingPrompt>('/api/training/start', identity, { activityType: activity, shortcutId });
    setPrompt(result);
  }

  async function submit(correct: boolean) {
    if (!prompt) return;
    setSubmitting(true);
    try {
      await api.post('/api/training/submit', identity, {
        activityType: prompt.activityType,
        shortcutId: prompt.shortcutId,
        promptRef: prompt.promptRef,
        response: { selfReported: correct },
        correct,
      });
      setLastResult(correct ? 'correct' : 'incorrect');
    } finally {
      setSubmitting(false);
    }
  }

  if (candidates.length === 0) {
    return <p className="text-[15px] text-inksoft">Save a shortcut first — training drills use its own examples.</p>;
  }

  return (
    <div className="rounded-xl border border-line bg-white p-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="mb-1 block text-sm text-inksoft">Shortcut</label>
          <select
            className="rounded-lg border border-line bg-white px-3 py-2 text-[15px] focus:border-focus focus:outline-none"
            value={shortcutId}
            onChange={(e) => setShortcutId(e.target.value)}
          >
            {candidates.map((c) => (
              <option key={c.shortcutId} value={c.shortcutId}>
                {c.canonicalName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm text-inksoft">Drill</label>
          <select
            className="rounded-lg border border-line bg-white px-3 py-2 text-[15px] focus:border-focus focus:outline-none"
            value={activity}
            onChange={(e) => setActivity(e.target.value as TrainingActivityType)}
          >
            {ACTIVITIES.map((a) => (
              <option key={a.type} value={a.type}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
        <button onClick={start} className="rounded-full bg-ink px-5 py-2 text-sm text-paper hover:opacity-90">
          Start
        </button>
      </div>

      <p className="mt-3 text-sm text-inksoft">{ACTIVITIES.find((a) => a.type === activity)?.blurb}</p>

      {prompt && (
        <div className="mt-6 rounded-lg bg-paper p-5">
          <p className="text-[15px] text-ink">{prompt.prompt.instructions}</p>

          {prompt.prompt.options && (
            <ul className="mt-3 space-y-1.5">
              {prompt.prompt.options.map((opt) => (
                <li key={opt} className="rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink">
                  {opt}
                </li>
              ))}
            </ul>
          )}

          {prompt.prompt.example && (
            <div className="mt-3 font-mono text-sm text-inksoft">
              {revealed ? (
                <>
                  x = {prompt.prompt.example.input.x ?? JSON.stringify(prompt.prompt.example.input)}
                  {prompt.prompt.example.expectedOutput != null && <> → {prompt.prompt.example.expectedOutput}</>}
                </>
              ) : (
                <button onClick={() => setRevealed(true)} className="text-focus hover:underline">
                  Reveal the example
                </button>
              )}
            </div>
          )}

          {lastResult === null ? (
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => submit(true)}
                disabled={submitting}
                className="rounded-full bg-verified px-4 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-50"
              >
                Got it right
              </button>
              <button
                onClick={() => submit(false)}
                disabled={submitting}
                className="rounded-full border border-line px-4 py-1.5 text-sm text-ink hover:bg-white disabled:opacity-50"
              >
                Got it wrong
              </button>
            </div>
          ) : (
            <p className={`mt-4 text-sm ${lastResult === 'correct' ? 'text-verified' : 'text-caution'}`}>
              Logged. {lastResult === 'correct' ? 'Nice.' : 'Worth another pass later.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
