import { ReadinessDashboard } from './pages/ReadinessDashboard';

/**
 * Dev-harness shell. In a real ACEAPT integration, `studentId` comes from
 * the authenticated session/route, and <ReadinessDashboard /> is the piece
 * that actually gets dropped into the existing app shell/navigation — not
 * this wrapper (see README's "reuse existing navigation" note).
 */
const DEMO_STUDENT_ID = 'demo-student-1'; // matches backend/src/db/seed.ts

export default function App() {
  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-paper-line px-4 py-4 sm:px-8">
        <p className="font-mono text-xs uppercase tracking-wide text-ink/45">ACEAPT · Feature 37</p>
        <h1 className="mt-0.5 text-lg font-semibold text-ink">Career Readiness</h1>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
        <ReadinessDashboard studentId={DEMO_STUDENT_ID} />
      </main>
    </div>
  );
}
