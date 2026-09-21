import { useEffect, useState } from 'react';
import * as api from './api/client';
import { Blueprint, PressureMode, PublicQuestion, PublicSimulationView, SimulationReport as ReportType } from './types';
import { SimulationStart } from './components/SimulationStart';
import { SimulationRunner } from './components/SimulationRunner';
import { SimulationReport } from './components/SimulationReport';

type Screen =
  | { name: 'loading' }
  | { name: 'error'; message: string }
  | { name: 'start' }
  | { name: 'running'; simulation: PublicSimulationView; question: PublicQuestion }
  | { name: 'report'; report: ReportType };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'loading' });
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // Dev-only bootstrap login - see backend/src/middleware/auth.ts.
        // Replace with your real ACEAPT session/token exchange.
        await api.devLogin('demo-student-1');
        const { blueprints } = await api.listBlueprints();
        setBlueprints(blueprints);
        setScreen({ name: 'start' });
      } catch (err) {
        setScreen({ name: 'error', message: err instanceof Error ? err.message : 'Failed to load.' });
      }
    })();
  }, []);

  async function handleStart(blueprintId: string, pressureMode: PressureMode) {
    setStarting(true);
    try {
      const { simulation, firstQuestion } = await api.startSimulation(blueprintId, pressureMode);
      setScreen({ name: 'running', simulation, question: firstQuestion });
    } catch (err) {
      setScreen({ name: 'error', message: err instanceof Error ? err.message : 'Failed to start simulation.' });
    } finally {
      setStarting(false);
    }
  }

  if (screen.name === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink text-slate">
        <p className="readout text-sm uppercase tracking-widest">Connecting…</p>
      </div>
    );
  }

  if (screen.name === 'error') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-ink px-6 text-center text-bone">
        <p className="font-display text-xl">Couldn&rsquo;t reach the simulation engine</p>
        <p className="max-w-md text-sm text-slate">{screen.message}</p>
        <p className="max-w-md text-xs text-slate">
          Is the backend running? Default: <code className="readout">http://localhost:4000</code>
        </p>
      </div>
    );
  }

  if (screen.name === 'start') {
    return <SimulationStart blueprints={blueprints} onStart={handleStart} starting={starting} />;
  }

  if (screen.name === 'running') {
    return (
      <SimulationRunner
        initialSimulation={screen.simulation}
        initialQuestion={screen.question}
        onComplete={(report) => setScreen({ name: 'report', report })}
      />
    );
  }

  return <SimulationReport report={screen.report} onRestart={() => setScreen({ name: 'start' })} />;
}
