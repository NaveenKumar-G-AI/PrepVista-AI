'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Eyebrow } from '@/components/ui';
import { formatDuration } from '@/lib/format';

interface SimDetail {
  id: string;
  title: string;
  type: string;
  level: number;
  description: string;
  rules: string[];
  target: { id: string; name: string } | null;
  totalDurationSeconds: number;
  stages: { title: string; purpose: string; itemCount: number; timeBudgetSeconds: number; transfer: boolean }[];
}

const LEVEL_LABEL: Record<number, string> = { 1: 'Practice Simulation', 2: 'Target Simulation', 3: 'Realistic Simulation', 4: 'Final Readiness Simulation' };

export default function SimulationBriefPage({ params }: { params: { simulationId: string } }) {
  const [sim, setSim] = useState<SimDetail | null>(null);
  const [starting, setStarting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch(`/api/simulations/${params.simulationId}`)
      .then((r) => r.json())
      .then(setSim);
  }, [params.simulationId]);

  async function start() {
    setStarting(true);
    const res = await fetch(`/api/simulations/${params.simulationId}/start`, { method: 'POST' });
    if (!res.ok) {
      setStarting(false);
      return;
    }
    const data = await res.json();
    router.push(`/attempts/${data.attemptId}/run`);
  }

  if (!sim) return <p className="text-text-3">Loading…</p>;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Eyebrow>READINESS SIMULATION</Eyebrow>
        <h1 className="text-2xl font-semibold tracking-tightest text-text-1">{sim.title}</h1>
        <p className="mt-2 max-w-2xl text-text-2">{sim.description}</p>
      </div>

      <Card>
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <div>
            <div className="eyebrow mb-1">Target</div>
            <div className="text-sm text-text-1">{sim.target?.name ?? '—'}</div>
          </div>
          <div>
            <div className="eyebrow mb-1">Duration</div>
            <div className="font-data text-sm text-text-1">{formatDuration(sim.totalDurationSeconds)}</div>
          </div>
          <div>
            <div className="eyebrow mb-1">Stages</div>
            <div className="font-data text-sm text-text-1">{sim.stages.length}</div>
          </div>
          <div>
            <div className="eyebrow mb-1">Mode</div>
            <div className="text-sm text-text-1">{LEVEL_LABEL[sim.level] ?? 'Simulation'}</div>
          </div>
        </div>
      </Card>

      <Card>
        <Eyebrow>STAGES</Eyebrow>
        <div className="flex flex-col divide-y divide-line">
          {sim.stages.map((st, i) => (
            <div key={i} className="flex items-center justify-between gap-4 py-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-text-1">
                  {i + 1}. {st.title}
                  {st.transfer && <span className="rounded-full bg-signal-dim px-2 py-0.5 text-[10px] font-medium text-signal">Transfer</span>}
                </div>
                <p className="mt-0.5 text-xs text-text-3">{st.purpose}</p>
              </div>
              <div className="whitespace-nowrap text-right font-data text-xs text-text-3">
                {st.itemCount} items · {formatDuration(st.timeBudgetSeconds)}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <Eyebrow>BEFORE YOU BEGIN</Eyebrow>
        <p className="mb-3 text-sm text-text-2">This simulation evaluates how you perform under realistic target conditions. Your result will contribute to your ACEAPT readiness evidence.</p>
        <ul className="flex flex-col gap-2">
          {sim.rules.map((rule, i) => (
            <li key={i} className="flex gap-2 text-sm text-text-2">
              <span className="text-text-3">—</span>
              <span>{rule}</span>
            </li>
          ))}
        </ul>
      </Card>

      <div className="flex justify-end">
        <Button onClick={start} disabled={starting}>
          {starting ? 'Starting…' : 'Start simulation'}
        </Button>
      </div>
    </div>
  );
}
