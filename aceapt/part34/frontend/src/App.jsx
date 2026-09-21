import { useEffect, useState, useCallback } from 'react';
import { api } from './api/client.js';
import { LoadingBlock, ErrorBlock, InsufficientEvidenceBlock } from './components/Shared.jsx';
import CareerMovementScreen from './components/CareerMovementScreen.jsx';
import ScenarioExplorer from './components/ScenarioExplorer.jsx';
import TrajectoryTimeline from './components/TrajectoryTimeline.jsx';
import PlanView from './components/PlanView.jsx';

const TABS = [
  { id: 'movement', label: 'Career Movement' },
  { id: 'scenarios', label: 'Scenario Explorer' },
  { id: 'timeline', label: 'Trajectory Timeline' },
  { id: 'plan', label: '30 / 60 / 90 Plan' },
];

export default function App() {
  const [status, setStatus] = useState('loading'); // loading | ready | empty | error
  const [errorMessage, setErrorMessage] = useState('');
  const [targetTitle, setTargetTitle] = useState('');
  const [activeTab, setActiveTab] = useState('movement');

  const load = useCallback(() => {
    setStatus('loading');
    api
      .getState()
      .then((data) => {
        setTargetTitle(data.target?.title || '');
        setStatus(data.hasAnyEvidence ? 'ready' : 'empty');
      })
      .catch((err) => {
        setErrorMessage(err.message);
        setStatus('error');
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__brand">
          ACEAPT <span className="app-header__feature">Career Trajectory Intelligence</span>
        </div>
        {targetTitle && <div className="app-header__target">Target — {targetTitle}</div>}
      </header>

      {status === 'loading' && (
        <div className="app-main">
          <LoadingBlock label="Loading your career trajectory…" />
        </div>
      )}

      {status === 'error' && (
        <div className="app-main">
          <ErrorBlock message={errorMessage} onRetry={load} />
        </div>
      )}

      {status === 'empty' && (
        <div className="app-main">
          <InsufficientEvidenceBlock
            title="Your trajectory isn't available yet"
            body="ACEAPT needs more evidence before it can identify a reliable career trajectory. Complete your first assessment, practice set, or simulation to begin building your career intelligence."
          />
        </div>
      )}

      {status === 'ready' && (
        <>
          <nav className="tabs" aria-label="Career trajectory sections">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={`tabs__item ${activeTab === tab.id ? 'is-active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
                aria-current={activeTab === tab.id ? 'page' : undefined}
              >
                {tab.label}
              </button>
            ))}
          </nav>
          <main className="app-main">
            {activeTab === 'movement' && <CareerMovementScreen onStateChanged={load} />}
            {activeTab === 'scenarios' && <ScenarioExplorer />}
            {activeTab === 'timeline' && <TrajectoryTimeline />}
            {activeTab === 'plan' && <PlanView />}
          </main>
        </>
      )}
    </div>
  );
}
