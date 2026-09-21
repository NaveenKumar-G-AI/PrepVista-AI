'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, ConfidenceBadge, Eyebrow, ReadinessStateBadge, WhyExplain } from '@/components/ui';
import { ReadinessDial } from '@/components/ReadinessDial';
import { FailurePointTimeline } from '@/components/FailurePointTimeline';
import { ReadinessMatrix } from '@/components/ReadinessMatrix';
import { NextBestAction } from '@/components/NextBestAction';
import type { SimulationResult } from '@/lib/db/schema';

export default function ResultPage({ params }: { params: { attemptId: string } }) {
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [notReady, setNotReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    async function poll() {
      const res = await fetch(`/api/attempts/${params.attemptId}/result`);
      if (cancelled) return;
      if (res.ok) {
        const data = await res.json();
        setResult(data.result);
        return;
      }
      attempts += 1;
      if (attempts < 10) {
        setTimeout(poll, 600);
      } else {
        setNotReady(true);
      }
    }
    poll();
    return () => {
      cancelled = true;
    };
  }, [params.attemptId]);

  if (notReady) {
    return <p className="text-text-3">This attempt has not finished evaluating yet. Return to the dashboard and check back shortly.</p>;
  }
  if (!result) {
    return <p className="text-text-3">Scoring your simulation…</p>;
  }

  const dialColor = result.readinessState === 'simulation_ready' || result.readinessState === 'verified_ready' ? 'text-ready' : result.readinessState === 'near_ready' ? 'text-signal' : 'text-caution';

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Eyebrow>SIMULATION COMPLETE</Eyebrow>
        <h1 className="text-2xl font-semibold tracking-tightest text-text-1">{result.simulationTitle}</h1>
      </div>

      {!result.usedAsEvidence && (
        <div className="rounded-lg border border-caution/30 bg-caution/10 p-4 text-sm text-caution">{result.usedAsEvidenceReason}</div>
      )}

      <Card className="flex flex-col items-center gap-4 text-center">
        <ReadinessDial value={result.simulatedReadiness} threshold={result.targetReadinessThreshold} colorClass={dialColor} />
        <div className="flex items-center gap-3">
          <ReadinessStateBadge state={result.readinessState} />
          <span className="text-text-3">·</span>
          <span className="text-sm text-text-2">
            Evidence confidence: <ConfidenceBadge confidence={result.evidenceConfidence} />
          </span>
        </div>
        {result.gap > 0 && <p className="text-sm text-text-3">{result.gap} points below your target threshold.</p>}
        {result.proofRecommended && <p className="font-medium text-ready">Proof recommended — your evidence is strong enough to pursue verification.</p>}
      </Card>

      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <Eyebrow>STRONGEST AREA</Eyebrow>
          <div className="text-lg font-medium text-text-1">{result.strongestArea?.label ?? '—'}</div>
        </Card>
        <Card>
          <Eyebrow>PRIMARY BOTTLENECK</Eyebrow>
          <div className="text-lg font-medium text-text-1">{result.primaryBottleneck?.label ?? 'None detected'}</div>
        </Card>
      </div>

      <Card>
        <Eyebrow>FAILURE-POINT TIMELINE</Eyebrow>
        <div className="mt-3">
          <FailurePointTimeline stages={result.stageEvaluations} />
        </div>
      </Card>

      <Card>
        <Eyebrow>READINESS MATRIX</Eyebrow>
        <div className="mt-3">
          <ReadinessMatrix dimensions={result.dimensions} />
        </div>
      </Card>

      <Card className="flex flex-col gap-1">
        <WhyExplain question="Why did performance drop?">
          <ul className="flex flex-col gap-2">
            {result.explanations.map((e, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-text-3">{i + 1}.</span>
                <span>{e}</span>
              </li>
            ))}
          </ul>
        </WhyExplain>
        <WhyExplain question="What would have happened?">
          <p>{result.interpretation}</p>
        </WhyExplain>
        {result.aiDebrief && (
          <WhyExplain question="Personalized debrief">
            <p>{result.aiDebrief}</p>
          </WhyExplain>
        )}
      </Card>

      <NextBestAction action={result.nextBestAction} href="/path" hrefLabel="Continue to Path" />

      <div className="flex justify-between text-sm">
        <button onClick={() => router.push('/simulations')} className="text-text-2 hover:text-text-1">
          ← Run another simulation
        </button>
        <button onClick={() => router.push('/simulations/history')} className="text-signal hover:underline">
          View history →
        </button>
      </div>
    </div>
  );
}
