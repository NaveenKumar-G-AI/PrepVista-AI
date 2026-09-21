'use client';

import { useEffect, useState } from 'react';
import { Button } from './ui';
import type { SanitizedItem } from '@/lib/db/schema';

const KIND_LABEL: Record<string, string> = {
  multiple_choice: 'Multiple choice',
  decision: 'Decision point',
  free_response: 'Written response',
};

export function ScenarioView({
  item,
  onSubmit,
  submitting,
}: {
  item: SanitizedItem;
  onSubmit: (payload: { selectedOptionId?: string; freeText?: string }) => void;
  submitting: boolean;
}) {
  const [selectedOptionId, setSelectedOptionId] = useState<string | undefined>();
  const [freeText, setFreeText] = useState('');

  // Reset local answer state whenever a new item arrives.
  useEffect(() => {
    setSelectedOptionId(undefined);
    setFreeText('');
  }, [item.id]);

  const canSubmit = item.kind === 'free_response' ? freeText.trim().length > 0 : !!selectedOptionId;

  function handleSubmit() {
    if (!canSubmit || submitting) return;
    onSubmit(item.kind === 'free_response' ? { freeText: freeText.trim() } : { selectedOptionId });
  }

  return (
    <div className="card-rise" key={item.id}>
      <div className="mb-4 flex items-center justify-between">
        <span className="eyebrow">{KIND_LABEL[item.kind]}</span>
        {item.transfer && <span className="rounded-full bg-signal-dim px-2 py-0.5 text-[11px] font-medium text-signal">Transfer</span>}
      </div>

      <p className="text-lg leading-relaxed text-text-1">{item.prompt}</p>

      {(item.kind === 'multiple_choice' || item.kind === 'decision') && item.options && (
        <div className="mt-6 flex flex-col gap-2.5" role="radiogroup" aria-label={item.prompt}>
          {item.options.map((opt) => {
            const active = selectedOptionId === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setSelectedOptionId(opt.id)}
                className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                  active ? 'border-signal bg-signal-dim/30 text-text-1' : 'border-line bg-raised/40 text-text-2 hover:border-text-3 hover:text-text-1'
                }`}
              >
                <span
                  className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border ${active ? 'border-signal' : 'border-text-3'}`}
                  aria-hidden
                >
                  {active && <span className="h-2 w-2 rounded-full bg-signal" />}
                </span>
                {opt.text}
              </button>
            );
          })}
        </div>
      )}

      {item.kind === 'free_response' && (
        <div className="mt-6">
          {item.guidance && <p className="mb-2 text-xs text-text-3">{item.guidance}</p>}
          <textarea
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            rows={5}
            placeholder="Type your response…"
            className="w-full rounded-lg border border-line bg-raised/40 p-3 text-sm text-text-1 placeholder:text-text-3 focus:border-signal focus:outline-none"
          />
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
          {submitting ? 'Submitting…' : 'Submit answer'}
        </Button>
      </div>
    </div>
  );
}
