import DecisionScenarioCard from './components/DecisionScenarioCard';
import EliminationExercise from './components/EliminationExercise';
import RiskDecisionCard from './components/RiskDecisionCard';
import ConfidenceCalibrationPicker from './components/ConfidenceCalibrationPicker';
import DecisionInsightCard from './components/DecisionInsightCard';
import PostMockDecisionReport from './components/PostMockDecisionReport';
import DecisionDashboardPanel from './components/DecisionDashboardPanel';
import './App.css';

/**
 * This is a review harness, not a shipped screen — each component below is
 * meant to be dropped into the real ACEAPT frontend individually, wired to
 * live data instead of the defaults each one renders on its own. Grouping
 * them here just makes it possible to see and click through all of them at
 * once during integration.
 */
export default function App() {
  const sections: { title: string; note: string; render: () => JSX.Element }[] = [
    { title: 'Decision scenario', note: 'Training mode — "what should you do?"', render: () => <DecisionScenarioCard /> },
    { title: 'Elimination exercise', note: 'Mark options that cannot be correct', render: () => <EliminationExercise /> },
    { title: 'Risk decision', note: 'Real scoring values, attempt vs. skip', render: () => <RiskDecisionCard /> },
    { title: 'Confidence calibration', note: 'Bands, never a fake-precise %', render: () => <ConfidenceCalibrationPicker /> },
    { title: 'Decision insight', note: 'One evidence-backed observation', render: () => <DecisionInsightCard /> },
    { title: 'Post-mock report', note: 'Ledger + decision sequence', render: () => <PostMockDecisionReport /> },
    { title: 'Dashboard panel', note: 'Only measured dimensions shown', render: () => <DecisionDashboardPanel /> },
  ];

  return (
    <div className="f58-gallery">
      <header className="f58-gallery__header">
        <p className="f58-gallery__eyebrow">Feature 58</p>
        <h1 className="f58-gallery__title">Guessing Intelligence Engine — component gallery</h1>
      </header>
      <div className="f58-gallery__grid">
        {sections.map((section) => (
          <section key={section.title} className="f58-gallery__cell">
            <h2 className="f58-gallery__cell-title">{section.title}</h2>
            <p className="f58-gallery__cell-note">{section.note}</p>
            {section.render()}
          </section>
        ))}
      </div>
    </div>
  );
}
