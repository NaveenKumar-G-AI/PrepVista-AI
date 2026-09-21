import { useState } from 'react';

import { MasteryMap } from './components/MasteryMap';
import { SkillDetail } from './components/SkillDetail';
import { WhatDoIKnow } from './components/WhatDoIKnow';
import { MasteryCheckFlow } from './components/MasteryCheckFlow';

const STUDENT_ID = 'demo-student';

type View = { name: 'map' } | { name: 'know' } | { name: 'detail'; skillId: string } | { name: 'check'; skillId: string };

export default function App() {
  const [view, setView] = useState<View>({ name: 'map' });
  const [refreshKey, setRefreshKey] = useState(0);

  const openSkill = (skillId: string) => setView({ name: 'detail', skillId });
  const startCheck = (skillId: string) => setView({ name: 'check', skillId });
  const onCheckFinished = (skillId: string) => {
    setRefreshKey((k) => k + 1);
    setView({ name: 'detail', skillId });
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl">
      <aside className="hidden w-60 shrink-0 border-r border-line px-6 py-8 md:block">
        <div className="mb-10">
          <p className="font-mono text-xs uppercase tracking-widest text-ink-400">ACEAPT AI</p>
          <h1 className="mt-1 text-lg font-semibold leading-tight text-ink-900">Mastery &amp; Skill&nbsp;Transfer</h1>
          <p className="mt-1 text-xs text-ink-400">Feature 14</p>
        </div>

        <nav className="space-y-1 text-sm">
          <NavButton active={view.name === 'map'} onClick={() => setView({ name: 'map' })}>
            Mastery map
          </NavButton>
          <NavButton active={view.name === 'know'} onClick={() => setView({ name: 'know' })}>
            What do I really know?
          </NavButton>
        </nav>

        <div className="mt-auto" />
        <div className="mt-16 border-t border-line pt-4">
          <p className="text-xs text-ink-400">Signed in as</p>
          <p className="text-sm font-medium text-ink-900">Aisha Verma</p>
          <p className="text-xs text-ink-400">Quantitative Aptitude</p>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-6 py-8 md:px-10">
        {view.name === 'map' && <MasteryMap key={refreshKey} studentId={STUDENT_ID} onOpenSkill={openSkill} />}
        {view.name === 'know' && <WhatDoIKnow key={refreshKey} studentId={STUDENT_ID} onOpenSkill={openSkill} />}
        {view.name === 'detail' && (
          <SkillDetail
            key={`${view.skillId}-${refreshKey}`}
            studentId={STUDENT_ID}
            skillId={view.skillId}
            onBack={() => setView({ name: 'map' })}
            onStartCheck={() => startCheck(view.skillId)}
          />
        )}
        {view.name === 'check' && (
          <MasteryCheckFlow
            studentId={STUDENT_ID}
            skillId={view.skillId}
            onExit={() => setView({ name: 'detail', skillId: view.skillId })}
            onFinished={() => onCheckFinished(view.skillId)}
          />
        )}
      </main>
    </div>
  );
}

function NavButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`block w-full rounded-md px-3 py-2 text-left transition-colors ${
        active ? 'bg-accent-soft font-medium text-accent-700' : 'text-ink-600 hover:bg-neutral-soft'
      }`}
    >
      {children}
    </button>
  );
}
