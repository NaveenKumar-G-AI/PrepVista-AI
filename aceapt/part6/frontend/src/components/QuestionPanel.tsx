import type { QuestionForClient } from '../api/types';

export function QuestionPanel({
  question,
  selectedOptionId,
  onSelect,
  disabled,
}: {
  question: QuestionForClient;
  selectedOptionId: string | null;
  onSelect: (optionId: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="card stack" style={{ width: '100%' }}>
      <span className="eyebrow">Question {question.position}</span>

      {question.context && (
        <div
          style={{
            background: 'var(--ink)',
            border: '1px solid var(--ink-line)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-4)',
            fontSize: 'var(--text-sm)',
            lineHeight: 1.65,
            whiteSpace: 'pre-line',
            color: 'var(--ink-text-muted)',
          }}
        >
          {question.context}
        </div>
      )}

      <p style={{ fontSize: 'var(--text-lg)', lineHeight: 1.5, fontWeight: 500 }}>{question.prompt}</p>

      <div className="stack-sm" role="radiogroup" aria-label={`Options for question ${question.position}`}>
        {question.options.map((opt) => {
          const selected = opt.id === selectedOptionId;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onSelect(opt.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                width: '100%',
                textAlign: 'left',
                padding: '14px 16px',
                borderRadius: 'var(--radius-md)',
                border: `1px solid ${selected ? 'var(--ink-text)' : 'var(--ink-line)'}`,
                background: selected ? 'rgba(236, 238, 242, 0.08)' : 'transparent',
                color: 'var(--ink-text)',
                fontSize: 'var(--text-base)',
                transition: 'border-color 120ms var(--ease-standard), background 120ms var(--ease-standard)',
              }}
            >
              <span
                aria-hidden
                className="data-num"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 26,
                  height: 26,
                  flexShrink: 0,
                  borderRadius: '50%',
                  border: `1px solid ${selected ? 'var(--ink-text)' : 'var(--ink-line)'}`,
                  background: selected ? 'var(--ink-text)' : 'transparent',
                  color: selected ? 'var(--ink)' : 'var(--ink-text-muted)',
                  fontSize: 'var(--text-xs)',
                }}
              >
                {opt.id}
              </span>
              <span>{opt.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
