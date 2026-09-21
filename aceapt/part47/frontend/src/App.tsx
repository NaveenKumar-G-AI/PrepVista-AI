import { useGuidedSession } from './state/useGuidedSession.js';
import { ProblemPicker } from './components/ProblemPicker.js';
import { GuidedWorkspace } from './components/GuidedWorkspace.js';
import './App.css';

export default function App() {
  const guidedSession = useGuidedSession();
  const { session, actions } = guidedSession;

  return (
    <div className="app-shell">
      <header className="app-shell__header">
        <span className="app-shell__brand">ACEAPT</span>
        {session && (
          <button type="button" className="app-shell__exit" onClick={actions.reset}>
            ← Choose a different problem
          </button>
        )}
      </header>

      <main>{session ? <GuidedWorkspace session={guidedSession} onExit={actions.reset} /> : <ProblemPicker onPick={actions.start} />}</main>
    </div>
  );
}
