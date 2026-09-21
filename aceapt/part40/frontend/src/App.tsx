import React, { useEffect, useState } from 'react';
import { api, setStudentId } from './api/client';
import { Hero, HorizonMarker } from './components/CareerHorizon/Hero';
import { Section, CurrentPosition } from './components/CareerHorizon/Sections';
import { MarketMovement, RoleEvolutionPanel } from './components/CareerHorizon/Sections.market';
import { FutureGaps, StrategicPriorities } from './components/CareerHorizon/Sections.gaps';
import { CareerPaths, DiscoveryDirections } from './components/CareerHorizon/Sections.paths';
import { EmptyState, ErrorState } from './components/CareerHorizon/shared/States';

function buildMarkers(horizon: any): HorizonMarker[] {
  const signals = horizon?.market?.signals ?? [];
  return signals.slice(0, 7).map((s: any) => ({
    label: s.targetLabel,
    direction: s.signalType === 'SKILL_FREQUENCY_INCREASE' ? 'up' : s.signalType === 'SKILL_FREQUENCY_DECREASE' ? 'down' : 'flat',
    strength: Math.min(1, s.strength),
  }));
}

function StudentPicker({ onSet }: { onSet: (id: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink px-6">
      <div className="w-full max-w-sm rounded-2xl border border-dawn/20 bg-ink p-6 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-dawn/60">ACEAPT &middot; stand-in auth</p>
        <h1 className="mt-2 font-display text-xl text-dawn">Enter a student id</h1>
        <p className="mt-2 font-serif text-[13px] text-dawn/70">
          No real ACEAPT session exists in this standalone build. Paste a student UUID (see db/seed/seed.ts output) to view their Career Horizon.
        </p>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="student uuid"
          className="mt-4 w-full rounded-lg border border-dawn/30 bg-transparent px-3 py-2 font-mono text-[13px] text-dawn placeholder:text-dawn/30 focus:outline-none"
        />
        <button
          onClick={() => value.trim() && onSet(value.trim())}
          className="mt-3 w-full rounded-full bg-dawn px-4 py-2 font-mono text-[12px] uppercase tracking-wide text-ink transition hover:opacity-90"
        >
          View Career Horizon
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [studentIdValue, setStudentIdValue] = useState<string>(() => {
    try { return window.localStorage.getItem('feature40_student_id') || ''; } catch { return ''; }
  });
  const [horizon, setHorizon] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = React.useCallback(() => {
    if (!studentIdValue) return;
    setLoading(true);
    setError(null);
    api
      .getCareerHorizon()
      .then(setHorizon)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [studentIdValue]);

  useEffect(() => {
    load();
  }, [load]);

  if (!studentIdValue) {
    return <StudentPicker onSet={(id) => { setStudentId(id); setStudentIdValue(id); }} />;
  }

  if (loading && !horizon) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink">
        <p className="font-mono text-[13px] uppercase tracking-wide text-dawn/60">Loading your Career Horizon...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-24">
        <ErrorState message={error} onRetry={load} />
      </div>
    );
  }

  if (!horizon) return null;

  return (
    <div className="min-h-screen bg-ground">
      <Hero
        targetRoleTitle={horizon.targetRole?.title ?? null}
        classification={horizon.roleEvolution?.classification ?? null}
        markers={buildMarkers(horizon)}
      />

      {horizon.discoveryMode ? (
        <Section eyebrow="No target yet" title="Discover your direction">
          <p className="mb-6 font-serif text-[15px] text-inksoft/80">{horizon.emptyStates.noTargetRole}</p>
          <DiscoveryDirections directions={horizon.discoveryDirections} />
        </Section>
      ) : (
        <>
          <Section eyebrow="Where you are" title="Current position">
            <CurrentPosition current={horizon.current} />
            {horizon.emptyStates.noEvidence && <p className="mt-4 font-serif text-[13px] italic text-inksoft/50">{horizon.emptyStates.noEvidence}</p>}
          </Section>

          {horizon.emptyStates.noMarketData ? (
            <Section eyebrow="Market" title="Market direction">
              <EmptyState title="Not enough market data yet" message={horizon.emptyStates.noMarketData} />
            </Section>
          ) : (
            <>
              <Section eyebrow="Where the market is moving" title="Market direction">
                <MarketMovement market={horizon.market} />
              </Section>

              <Section eyebrow="What is changing" title="How this role is changing">
                <RoleEvolutionPanel evolution={horizon.roleEvolution} />
              </Section>

              <Section eyebrow="What it means for you" title="Your future gaps">
                <FutureGaps gaps={horizon.futureGaps} />
              </Section>

              <Section eyebrow="What to do next" title="Strategic priorities">
                <StrategicPriorities priorities={horizon.strategicPriorities} />
              </Section>

              <Section eyebrow="Future paths" title="Where this could lead">
                <CareerPaths branches={horizon.futurePaths} />
              </Section>
            </>
          )}
        </>
      )}

      <footer className="border-t border-line px-6 py-8 text-center sm:px-10">
        <p className="font-mono text-[11px] uppercase tracking-wide text-inksoft/40">ACEAPT Feature 40 &middot; Career Horizon</p>
      </footer>
    </div>
  );
}
