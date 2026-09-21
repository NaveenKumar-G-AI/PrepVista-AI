'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Timer } from '@/components/Timer';
import { StageProgress } from '@/components/StageProgress';
import { ScenarioView } from '@/components/ScenarioView';
import { Button } from '@/components/ui';
import type { SanitizedItem } from '@/lib/db/schema';

interface RuntimeView {
  attemptId: string;
  status: string;
  done: boolean;
  stage: { index: number; total: number; title: string; purpose: string; timeBudgetSeconds: number; itemIndex: number; itemsInStage: number } | null;
  item: SanitizedItem | null;
  progress: { completedItems: number; totalItems: number };
  timeRemainingSeconds: number;
  totalDurationSeconds: number;
  rules: string[];
}

export default function RuntimePage({ params }: { params: { attemptId: string } }) {
  const { attemptId } = params;
  const router = useRouter();
  const [view, setView] = useState<RuntimeView | null>(null);
  const [simTitle, setSimTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const completingRef = useRef(false);

  const goToResult = useCallback(() => router.push(`/attempts/${attemptId}/result`), [attemptId, router]);

  const complete = useCallback(async () => {
    if (completingRef.current) return;
    completingRef.current = true;
    try {
      await fetch(`/api/attempts/${attemptId}/complete`, { method: 'POST' });
    } finally {
      goToResult();
    }
  }, [attemptId, goToResult]);

  useEffect(() => {
    fetch(`/api/attempts/${attemptId}`)
      .then((r) => r.json())
      .then((data) => {
        setSimTitle(data.simulationTitle);
        if (data.view.done) {
          complete();
          return;
        }
        setView(data.view);
      })
      .catch(() => setError('Could not load this simulation. Check your connection and try again.'));
  }, [attemptId, complete]);

  async function submit(payload: { selectedOptionId?: string; freeText?: string }) {
    if (!view?.item) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/attempts/${attemptId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: view.item.id, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.shouldComplete) {
          complete();
          return;
        }
        setError(data.error || 'Something went wrong submitting that answer. Your previous answers are safe — try again.');
        setSubmitting(false);
        return;
      }
      if (data.view.done) {
        complete();
        return;
      }
      setView(data.view);
      setSubmitting(false);
    } catch {
      setError('Network issue submitting that answer. Your previous answers are safe — try again.');
      setSubmitting(false);
    }
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md text-center">
        <p className="text-text-2">{error}</p>
        <Button className="mt-4" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!view || !view.stage || !view.item) {
    return <p className="text-text-3">Loading simulation…</p>;
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <div className="flex items-center justify-between">
        <StageProgress currentIndex={view.stage.index} total={view.stage.total} />
        <Timer initialSeconds={view.timeRemainingSeconds} onExpire={complete} />
      </div>

      <div>
        <div className="eyebrow mb-1">
          {simTitle} · STAGE {view.stage.index + 1} / {view.stage.total}
        </div>
        <h2 className="text-xl font-medium text-text-1">{view.stage.title}</h2>
        <p className="mt-1 text-sm text-text-3">{view.stage.purpose}</p>
      </div>

      <ScenarioView item={view.item} onSubmit={submit} submitting={submitting} />

      <div className="text-center font-data text-xs text-text-3">
        {view.progress.completedItems} / {view.progress.totalItems} items completed
      </div>
    </div>
  );
}
