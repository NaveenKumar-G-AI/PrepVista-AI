import React, { useEffect, useState } from 'react';
import { ApiQuestion } from './api';

export interface AdaptiveQuestionProps {
  question: ApiQuestion;
  onSubmit: (result: { isCorrect: boolean; responseTimeMs: number; confidence?: { level: 'low' | 'medium' | 'high' } }) => void;
  /**
   * Question.content is intentionally opaque (see domain/types.ts) - it's
   * owned by your existing question-rendering system. Pass your existing
   * question component in here. The fallback below only handles a plain
   * {stem, choices, correctChoiceId} shape so this file runs standalone.
   */
  renderQuestionContent?: (content: unknown, onAnswered: (isCorrect: boolean) => void) => React.ReactNode;
  collectConfidence?: boolean;
}

/**
 * NOTE: grading happens in YOUR existing scoring system, not here (spec
 * section 4). This component's default fallback renderer only exists to
 * make the reference demo runnable standalone - swap in
 * `renderQuestionContent` to delegate to your real question UI and scorer.
 */
export function AdaptiveQuestion({ question, onSubmit, renderQuestionContent, collectConfidence = false }: AdaptiveQuestionProps) {
  const [startedAt] = useState(() => Date.now());
  const [confidence, setConfidence] = useState<'low' | 'medium' | 'high' | null>(null);
  const [answered, setAnswered] = useState(false);

  useEffect(() => {
    setAnswered(false);
  }, [question.id]);

  function handleAnswered(isCorrect: boolean) {
    if (answered) return; // guards against a double-submit on this question
    setAnswered(true);
    onSubmit({
      isCorrect,
      responseTimeMs: Date.now() - startedAt,
      confidence: confidence ? { level: confidence } : undefined,
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {collectConfidence && (
        <ConfidencePicker value={confidence} onChange={setConfidence} />
      )}

      {renderQuestionContent ? (
        renderQuestionContent(question.content, handleAnswered)
      ) : (
        <FallbackQuestion content={question.content} onAnswered={handleAnswered} />
      )}
    </div>
  );
}

function ConfidencePicker({ value, onChange }: { value: 'low' | 'medium' | 'high' | null; onChange: (v: 'low' | 'medium' | 'high') => void }) {
  const options: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high'];
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: '#8a7a68' }}>
      <span>How sure are you?</span>
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          style={{
            padding: '4px 10px',
            borderRadius: 999,
            border: value === opt ? '1px solid #c98a4b' : '1px solid #e4d8c8',
            background: value === opt ? '#fbeedd' : 'transparent',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

interface FallbackContent {
  stem?: string;
  choices?: { id: string; text: string }[];
  correctChoiceId?: string;
}

function FallbackQuestion({ content, onAnswered }: { content: unknown; onAnswered: (isCorrect: boolean) => void }) {
  const c = (content ?? {}) as FallbackContent;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: 17, lineHeight: 1.5, color: '#2c2418', margin: 0 }}>{c.stem ?? 'Question content not provided.'}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(c.choices ?? []).map((choice) => (
          <button
            key={choice.id}
            type="button"
            onClick={() => onAnswered(choice.id === c.correctChoiceId)}
            style={{
              textAlign: 'left',
              padding: '10px 14px',
              borderRadius: 10,
              border: '1px solid #e4d8c8',
              background: '#fffaf3',
              fontSize: 15,
              cursor: 'pointer',
            }}
          >
            {choice.text}
          </button>
        ))}
      </div>
    </div>
  );
}
