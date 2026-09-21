import { useState } from 'react';
import { api, type DevIdentity } from '../api/client';
import type { RecommendationOutcome, SessionMode } from '../types';
import { StatusDot } from './StatusDot';

export function RecommendationPlayground({ identity, mode }: { identity: DevIdentity; mode: SessionMode }) {
  const [percentage, setPercentage] = useState(25);
  const [answerType, setAnswerType] = useState<'EXACT' | 'APPROXIMATE_OK'>('EXACT');
  const [hasOptions, setHasOptions] = useState(true);
  const [outcome, setOutcome] = useState<RecommendationOutcome | null>(null);
  const [loading, setLoading] = useState(false);

  async function check() {
    setLoading(true);
    try {
      const result = await api.post<RecommendationOutcome>('/api/recommendations/strategy', identity, {
        context: { attributes: { percentage }, answerType, hasOptions },
        mode,
        standardMethodStats: { accuracy: 0.9, medianTimeMs: 18000 },
      });
      setOutcome(result);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-line bg-white p-6">
      <h3 className="font-display text-xl text-ink">Try a question</h3>
      <p className="mt-1 text-sm text-inksoft">
        See what the recommendation engine would suggest, right now, in <span className="font-medium">{mode.replace(/_/g, ' ').toLowerCase()}</span>{' '}
        mode.
      </p>

      <div className="mt-5 flex flex-wrap items-end gap-4">
        <div>
          <label className="mb-1 block text-sm text-inksoft">Percentage asked for</label>
          <input
            type="number"
            className="w-24 rounded-lg border border-line bg-white px-3 py-2 font-mono text-[15px] focus:border-focus focus:outline-none"
            value={percentage}
            onChange={(e) => setPercentage(Number(e.target.value))}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-inksoft">Answer type</label>
          <select
            className="rounded-lg border border-line bg-white px-3 py-2 text-[15px] focus:border-focus focus:outline-none"
            value={answerType}
            onChange={(e) => setAnswerType(e.target.value as 'EXACT' | 'APPROXIMATE_OK')}
          >
            <option value="EXACT">Exact answer required</option>
            <option value="APPROXIMATE_OK">Approximate is fine</option>
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-ink">
          <input type="checkbox" checked={hasOptions} onChange={(e) => setHasOptions(e.target.checked)} />
          Has multiple-choice options
        </label>
        <button onClick={check} disabled={loading} className="rounded-full bg-ink px-5 py-2 text-sm text-paper hover:opacity-90 disabled:opacity-50">
          {loading ? 'Checking…' : 'Check'}
        </button>
      </div>

      {outcome && (
        <div className="mt-5 border-t border-line pt-5">
          {!outcome.allowed ? (
            <p className="text-[15px] text-inksoft">{outcome.reason}</p>
          ) : outcome.recommended ? (
            <div>
              <div className="flex items-center gap-3">
                <span className="font-display text-lg text-ink">{outcome.recommended.canonicalName}</span>
                <StatusDot state={outcome.recommended.trustState} />
              </div>
              <p className="mt-1 text-[15px] text-inksoft">{outcome.recommended.rationale}</p>
            </div>
          ) : (
            <p className="text-[15px] text-inksoft">{outcome.reason ?? 'Nothing to recommend here yet — the standard method is a safe default.'}</p>
          )}
        </div>
      )}
    </div>
  );
}
