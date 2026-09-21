import type { QuestionOrderEntry } from '../api/types';
import { Timer } from './Timer';

export function ProgressRail({
  questionOrder,
  currentQuestionId,
  remainingSeconds,
  totalSeconds,
  answered,
  total,
  onJump,
  onExpire,
}: {
  questionOrder: QuestionOrderEntry[];
  currentQuestionId: string | null;
  remainingSeconds: number;
  totalSeconds: number;
  answered: number;
  total: number;
  onJump: (questionId: string) => void;
  onExpire?: () => void;
}) {
  return (
    <div className="stack-sm" style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="eyebrow">
          {answered} of {total} answered
        </div>
        <Timer remainingSeconds={remainingSeconds} totalSeconds={totalSeconds} onExpire={onExpire} />
      </div>

      <div
        role="navigation"
        aria-label="Question navigator"
        style={{
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          paddingBottom: 4,
        }}
      >
        {questionOrder.map((q) => {
          const isCurrent = q.id === currentQuestionId;
          const bg = isCurrent
            ? 'var(--ink-text)'
            : q.answered
              ? 'rgba(47, 158, 139, 0.28)'
              : q.skipped
                ? 'rgba(226, 162, 61, 0.28)'
                : 'transparent';
          const border = isCurrent
            ? 'var(--ink-text)'
            : q.answered
              ? '#2f9e8b'
              : q.skipped
                ? '#e2a23d'
                : 'var(--ink-line)';
          const color = isCurrent ? 'var(--ink)' : 'var(--ink-text)';
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => onJump(q.id)}
              aria-current={isCurrent ? 'true' : undefined}
              aria-label={`Question ${q.position}${q.answered ? ', answered' : q.skipped ? ', skipped' : ', not answered'}`}
              className="data-num"
              style={{
                flexShrink: 0,
                width: 30,
                height: 30,
                borderRadius: 'var(--radius-sm)',
                border: `1px solid ${border}`,
                background: bg,
                color,
                fontSize: 'var(--text-xs)',
              }}
            >
              {q.position}
            </button>
          );
        })}
      </div>
    </div>
  );
}
