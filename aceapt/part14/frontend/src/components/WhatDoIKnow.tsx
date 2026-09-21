import { useEffect, useState } from 'react';

import { api, WhatDoIKnowResponse } from '../lib/api';
import { deriveStrip } from '../lib/evidenceStrip';
import { EvidenceStrip } from './EvidenceStrip';
import { Card, ErrorState, LoadingRows, StateBadge } from './ui';

const BUCKET_ORDER = ['Strong mastery', 'Developing', 'Familiar', 'Transfer gap', 'Retention gap', 'Difficulty gap', 'Not enough data yet', 'Not started'];

const BUCKET_COPY: Record<string, string> = {
  'Strong mastery': 'Holds up independently, across difficulty and (where tested) across time.',
  Developing: 'Building toward independent, consistent performance.',
  Familiar: 'Recognised, but not yet tested independently.',
  'Transfer gap': 'Solid on familiar questions — drops on unfamiliar ones testing the same concept.',
  'Retention gap': 'Was solid — a later check shows it hasn’t stuck.',
  'Difficulty gap': 'Solid at lower difficulty — not yet proven at hard.',
  'Not enough data yet': 'Too few attempts on record to say anything definite.',
  'Not started': 'No attempts recorded yet.',
};

export function WhatDoIKnow({ studentId, onOpenSkill }: { studentId: string; onOpenSkill: (skillId: string) => void }) {
  const [data, setData] = useState<WhatDoIKnowResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    setData(null);
    api
      .getWhatDoIKnow(studentId)
      .then(setData)
      .catch((e) => setError(e.message));
  };

  useEffect(load, [studentId]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <LoadingRows count={5} />;

  const nonEmptyBuckets = BUCKET_ORDER.filter((b) => data.buckets[b]?.length);

  return (
    <div>
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-widest text-ink-400">{data.student.name}</p>
        <h2 className="mt-1 text-2xl font-semibold text-ink-900">What do I really know?</h2>
        <p className="mt-2 max-w-2xl text-sm text-ink-600">Not how many questions were completed — what actually held up under independent, varied, and delayed testing.</p>
      </header>

      <div className="space-y-9">
        {nonEmptyBuckets.map((bucket) => (
          <section key={bucket}>
            <div className="mb-3 flex items-baseline gap-3">
              <h3 className="text-sm font-semibold text-ink-900">{bucket}</h3>
              <span className="font-mono text-xs text-ink-400">{data.buckets[bucket].length}</span>
            </div>
            <p className="mb-3 text-xs text-ink-600">{BUCKET_COPY[bucket]}</p>
            <div className="space-y-2.5">
              {data.buckets[bucket].map(({ skill, analysis }) => (
                <Card key={skill.id} className="px-5 py-4 transition-colors hover:border-ink-400">
                  <button onClick={() => onOpenSkill(skill.id)} className="flex w-full items-center justify-between gap-6 text-left">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2.5">
                        <span className="font-medium text-ink-900">{skill.name}</span>
                        <StateBadge state={analysis.state} label={analysis.displayLabel} />
                      </div>
                      <p className="mt-1 truncate text-sm text-ink-600">{analysis.confidenceReason}</p>
                    </div>
                    <EvidenceStrip dims={deriveStrip(analysis)} size="sm" />
                  </button>
                </Card>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
