'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Card, ConfidenceBadge, Eyebrow, ReadinessStateBadge } from '@/components/ui';
import type { PathState, ReadinessState, EvidenceConfidence } from '@/lib/db/schema';

interface DashboardData {
  student: { id: string; name: string };
  target: { id: string; name: string; readinessThreshold: number };
  allTargets: { id: string; name: string }[];
  path: PathState | null;
  readiness: { simulatedReadiness: number; evidenceConfidence: EvidenceConfidence; readinessState: ReadinessState; gap: number; proofRecommended: boolean } | null;
  totalAttempts: number;
  inProgressAttemptId: string | null;
  simulationCount: number;
  primarySimulationId: string | null;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [switching, setSwitching] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/dashboard')
      .then((r) => r.json())
      .then(setData);
  }, []);

  async function switchTarget(targetId: string) {
    setSwitching(true);
    await fetch('/api/student/target', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetId }) });
    const res = await fetch('/api/dashboard');
    setData(await res.json());
    setSwitching(false);
  }

  if (!data) {
    return <p className="text-text-3">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Eyebrow>ACEAPT · FEATURE 31</Eyebrow>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-3xl font-semibold tracking-tightest text-text-1">Readiness Simulator</h1>
          <select
            value={data.target.id}
            disabled={switching}
            onChange={(e) => switchTarget(e.target.value)}
            className="rounded-lg border border-line bg-raised px-3 py-2 text-sm text-text-1 focus:border-signal focus:outline-none"
            aria-label="Current target"
          >
            {data.allTargets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-2 max-w-xl text-text-2">Don&apos;t wait for the real opportunity to discover your weakness. Experience it now, for <strong className="text-text-1">{data.target.name}</strong>.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <Eyebrow>CURRENT BOTTLENECK</Eyebrow>
          {data.path ? (
            <>
              <div className="text-xl font-medium text-text-1">{data.path.currentBottleneck.label}</div>
              <p className="mt-2 text-sm leading-relaxed text-text-2">{data.path.currentBottleneck.reason}</p>
            </>
          ) : (
            <p className="text-sm text-text-2">No simulation evidence yet. Run your first readiness simulation to establish a baseline bottleneck.</p>
          )}
        </Card>

        <Card>
          <Eyebrow>READINESS SNAPSHOT</Eyebrow>
          {data.readiness ? (
            <div className="flex items-center justify-between">
              <div>
                <div className="font-data text-3xl text-text-1">{data.readiness.simulatedReadiness}%</div>
                <div className="mt-1 flex items-center gap-2 text-xs text-text-3">
                  <span>Evidence:</span>
                  <ConfidenceBadge confidence={data.readiness.evidenceConfidence} />
                </div>
              </div>
              <ReadinessStateBadge state={data.readiness.readinessState} />
            </div>
          ) : (
            <p className="text-sm text-text-2">More evidence needed — run a simulation to generate your first readiness estimate.</p>
          )}
        </Card>
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-lg font-medium text-text-1">{data.simulationCount} simulation{data.simulationCount === 1 ? '' : 's'} available for {data.target.name}</div>
          <p className="mt-1 text-sm text-text-2">{data.totalAttempts} completed attempt{data.totalAttempts === 1 ? '' : 's'} so far.</p>
        </div>
        {data.inProgressAttemptId ? (
          <Button onClick={() => router.push(`/attempts/${data.inProgressAttemptId}/run`)}>Resume simulation</Button>
        ) : (
          <Link href="/simulations">
            <Button>Run readiness simulation</Button>
          </Link>
        )}
      </Card>

      <div className="flex gap-4 text-sm">
        <Link href="/path" className="text-signal hover:underline">
          View full PATH →
        </Link>
        <Link href="/simulations/history" className="text-signal hover:underline">
          View simulation history →
        </Link>
      </div>
    </div>
  );
}
