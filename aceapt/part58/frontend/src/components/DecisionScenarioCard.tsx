import { useState } from 'react';
import type { DecisionAction, DecisionScenario } from '../types';
import './DecisionScenarioCard.css';

/**
 * Training-mode-only (§78, §119): this asks "what would you do", it never
 * answers a live formal assessment for the student. The action set shown is
 * intentionally a fixed, small vocabulary rather than the full 12-action
 * taxonomy — a student mid-decision needs a short list, not a menu.
 */
export interface DecisionScenarioCardProps {
  scenario: DecisionScenario;
  onDecide?: (action: DecisionAction) => void;
}

const ACTIONS: { action: DecisionAction; label: string }[] = [
  { action: 'CONTINUE', label: 'Continue' },
  { action: 'ELIMINATE', label: 'Eliminate' },
  { action: 'ESTIMATE', label: 'Estimate' },
  { action: 'INFORMED_GUESS', label: 'Guess' },
  { action: 'SKIP', label: 'Skip' },
];

function defaultScenario(): DecisionScenario {
  return {
    title: 'Uncertain question',
    difficulty: 'Hard',
    expectedTimeSeconds: 75,
    elapsedTimeSeconds: 55,
    remainingTestTimeSeconds: 30,
    prompt: 'You are unsure of the exact method, but you recognise the general area. Time is short.',
    options: [
      { id: 'A', label: '128' },
      { id: 'B', label: '144' },
      { id: 'C', label: '156' },
      { id: 'D', label: '162' },
    ],
  };
}

export default function DecisionScenarioCard({ scenario = defaultScenario(), onDecide }: Partial<DecisionScenarioCardProps>) {
  const [chosen, setChosen] = useState<DecisionAction | null>(null);
  const timeRatio = Math.min(1.4, scenario.elapsedTimeSeconds / scenario.expectedTimeSeconds);
  const overTime = timeRatio > 1;

  function handleChoose(action: DecisionAction) {
    setChosen(action);
    onDecide?.(action);
  }

  return (
    <div className="f58-root f58-scenario">
      <div className="f58-scenario__strip">
        <div className="f58-scenario__strip-row">
          <span className="f58-scenario__difficulty">{scenario.difficulty}</span>
          <span className="f58-scenario__label">question</span>
        </div>
        <div className="f58-scenario__readouts">
          <div className="f58-scenario__readout">
            <span className="f58-numeral f58-scenario__readout-value">{scenario.expectedTimeSeconds}s</span>
            <span className="f58-scenario__readout-label">expected</span>
          </div>
          <div className="f58-scenario__readout">
            <span className={`f58-numeral f58-scenario__readout-value${overTime ? ' f58-scenario__readout-value--hot' : ''}`}>
              {scenario.elapsedTimeSeconds}s
            </span>
            <span className="f58-scenario__readout-label">elapsed</span>
          </div>
          {scenario.remainingTestTimeSeconds != null && (
            <div className="f58-scenario__readout">
              <span className="f58-numeral f58-scenario__readout-value">{scenario.remainingTestTimeSeconds}s</span>
              <span className="f58-scenario__readout-label">left in test</span>
            </div>
          )}
        </div>
        <div className="f58-scenario__bar">
          <div
            className={`f58-scenario__bar-fill${overTime ? ' f58-scenario__bar-fill--hot' : ''}`}
            style={{ width: `${Math.min(100, timeRatio * 100)}%` }}
          />
        </div>
      </div>

      <div className="f58-scenario__body">
        <h3 className="f58-title f58-scenario__title">{scenario.title}</h3>
        <p className="f58-scenario__prompt">{scenario.prompt}</p>

        <ul className="f58-scenario__options" aria-label="Answer options">
          {scenario.options.map((option) => (
            <li key={option.id} className="f58-scenario__option">
              <span className="f58-numeral f58-scenario__option-id">{option.id}</span>
              <span>{option.label}</span>
            </li>
          ))}
        </ul>

        <p className="f58-scenario__question">What is your best next move?</p>
        <div className="f58-scenario__actions" role="group" aria-label="Choose an action">
          {ACTIONS.map(({ action, label }) => (
            <button
              key={action}
              type="button"
              className="f58-btn"
              aria-pressed={chosen === action}
              onClick={() => handleChoose(action)}
            >
              {label}
            </button>
          ))}
        </div>
        {chosen && <p className="f58-scenario__ack">Recorded: {ACTIONS.find((a) => a.action === chosen)?.label}.</p>}
      </div>
    </div>
  );
}
