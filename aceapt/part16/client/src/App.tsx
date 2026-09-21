import { useState } from 'react';
import { DemoRunner } from './components/DemoRunner';
import { LivePractice } from './components/LivePractice';
import { AuthContext } from './api/client';

type Tab = 'demo' | 'live';

export default function App() {
  const [tab, setTab] = useState<Tab>('demo');
  const [auth, setAuth] = useState<AuthContext | null>(null);

  return (
    <div className="min-h-screen bg-porcelain">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto max-w-3xl px-6 py-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-signal-gold">ACEAPT AI · Feature 16</p>
          <h1 className="font-display text-2xl font-semibold text-ink">Adaptive Learning Intervention &amp; Recovery Engine</h1>
        </div>
        <nav className="mx-auto flex max-w-3xl gap-1 px-6">
          <TabButton active={tab === 'demo'} onClick={() => setTab('demo')}>
            Guided demo
          </TabButton>
          <TabButton active={tab === 'live'} onClick={() => setTab('live')} disabled={!auth}>
            Live practice {!auth && '(run the demo first)'}
          </TabButton>
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        {tab === 'demo' && <DemoRunner onAuthReady={setAuth} />}
        {tab === 'live' && auth && <LivePractice auth={auth} />}
        {tab === 'live' && !auth && (
          <p className="text-[13px] text-muted">Run the guided demo once first — it seeds a demo student the sandbox can use.</p>
        )}
      </main>

      <footer className="mx-auto max-w-3xl px-6 py-8 text-[12px] text-muted">
        Prototype scope: see the project README for what's implemented, what's stubbed for Feature 10–15 integration, and
        what's deliberately deferred.
      </footer>
    </div>
  );
}

function TabButton({ active, disabled, onClick, children }: { active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`border-b-2 px-3 py-3 font-body text-[13px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? 'border-signal-gold text-ink' : 'border-transparent text-muted hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}
