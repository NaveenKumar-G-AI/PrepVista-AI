import { useState, type FormEvent } from 'react';
import type { CurrentStepView } from '../api/types.js';
import './AnswerInput.css';

export function AnswerInput({
  step,
  onSubmit,
  disabled,
}: {
  step: CurrentStepView;
  onSubmit: (rawInput: string) => void;
  disabled: boolean;
}) {
  const [text, setText] = useState('');
  const [choiceId, setChoiceId] = useState('');
  const [unitValue, setUnitValue] = useState('');
  const [unitUnit, setUnitUnit] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (disabled) return;
    switch (step.expectedInputType) {
      case 'TEXT':
      case 'NUMERIC':
        if (!text.trim()) return;
        onSubmit(text.trim());
        break;
      case 'CHOICE':
        if (!choiceId) return;
        onSubmit(choiceId);
        break;
      case 'UNIT_VALUE':
        if (!unitValue.trim()) return;
        onSubmit(`${unitValue.trim()} ${unitUnit.trim()}`.trim());
        break;
      case 'STRUCTURED_FIELDS':
        onSubmit(JSON.stringify(fields));
        break;
    }
  }

  return (
    <form className="answer-input" onSubmit={handleSubmit}>
      {(step.expectedInputType === 'TEXT' || step.expectedInputType === 'NUMERIC') && (
        <input
          className="answer-input__text"
          type="text"
          inputMode={step.expectedInputType === 'NUMERIC' ? 'decimal' : 'text'}
          placeholder={step.expectedInputType === 'NUMERIC' ? 'Enter your answer' : 'Type your answer'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={disabled}
          aria-label="Your answer"
          autoFocus
        />
      )}

      {step.expectedInputType === 'CHOICE' && step.choiceOptions && (
        <fieldset className="answer-input__choices">
          <legend className="visually-hidden">Choose one</legend>
          {step.choiceOptions.map((opt) => (
            <label key={opt.id} className={`answer-choice ${choiceId === opt.id ? 'answer-choice--selected' : ''}`}>
              <input
                type="radio"
                name="choice"
                value={opt.id}
                checked={choiceId === opt.id}
                onChange={() => setChoiceId(opt.id)}
                disabled={disabled}
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </fieldset>
      )}

      {step.expectedInputType === 'UNIT_VALUE' && (
        <div className="answer-input__unit-row">
          <input
            className="answer-input__text answer-input__text--value"
            type="text"
            inputMode="decimal"
            placeholder="Value"
            value={unitValue}
            onChange={(e) => setUnitValue(e.target.value)}
            disabled={disabled}
            aria-label="Value"
            autoFocus
          />
          <input
            className="answer-input__text answer-input__text--unit"
            type="text"
            placeholder="Unit (e.g. hours)"
            value={unitUnit}
            onChange={(e) => setUnitUnit(e.target.value)}
            disabled={disabled}
            aria-label="Unit"
          />
        </div>
      )}

      {step.expectedInputType === 'STRUCTURED_FIELDS' && step.structuredFields && (
        <div className="answer-input__fields">
          {step.structuredFields.map((f, index) => (
            <label key={f.key} className="answer-field">
              <span className="answer-field__label">{f.label}</span>
              <input
                type="text"
                inputMode="decimal"
                value={fields[f.key] ?? ''}
                onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                disabled={disabled}
                autoFocus={index === 0}
              />
            </label>
          ))}
        </div>
      )}

      <button type="submit" className="answer-input__submit" disabled={disabled}>
        Submit
      </button>
    </form>
  );
}
