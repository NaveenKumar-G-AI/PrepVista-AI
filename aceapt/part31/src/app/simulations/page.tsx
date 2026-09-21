'use client';

import { useEffect, useState } from 'react';
import { Eyebrow } from '@/components/ui';
import { SimulationCard } from '@/components/SimulationCard';

interface SimListItem {
  id: string;
  title: string;
  type: string;
  level: number;
  description: string;
  stageCount: number;
  totalDurationSeconds: number;
}

export default function SimulationsPage() {
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);
  const [simulations, setSimulations] = useState<SimListItem[] | null>(null);

  useEffect(() => {
    fetch('/api/simulations')
      .then((r) => r.json())
      .then((data) => {
        setTarget(data.target);
        setSimulations(data.simulations);
      });
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Eyebrow>SIMULATION LOBBY</Eyebrow>
        <h1 className="text-2xl font-semibold tracking-tightest text-text-1">{target ? `Simulations for ${target.name}` : 'Simulations'}</h1>
        <p className="mt-2 text-text-2">Pick a realistic, target-aware simulation. Your result contributes to your ACEAPT readiness evidence.</p>
      </div>

      {!simulations && <p className="text-text-3">Loading…</p>}
      {simulations && simulations.length === 0 && <p className="text-text-3">No simulations are configured for this target yet.</p>}

      <div className="grid gap-5 sm:grid-cols-2">
        {simulations?.map((s) => (
          <SimulationCard key={s.id} id={s.id} title={s.title} description={s.description} level={s.level} stageCount={s.stageCount} totalDurationSeconds={s.totalDurationSeconds} />
        ))}
      </div>
    </div>
  );
}
