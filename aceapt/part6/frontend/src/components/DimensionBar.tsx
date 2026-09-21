import type { ReadinessDimensionScore } from '../api/types';
import { colorForScore } from './spectrum';

const DIMENSION_LABEL: Record<string, string> = {
  ACCURACY: 'Accuracy',
  SPEED: 'Speed',
  CONSISTENCY: 'Consistency',
  TIME_MANAGEMENT: 'Time Management',
  CONCEPT_STABILITY: 'Concept Stability',
  DIFFICULTY_STABILITY: 'Difficulty Stability',
  EXAM_PRESSURE_PERFORMANCE: 'Exam Pressure Performance',
  QUESTION_SELECTION: 'Question Selection',
  STRATEGY_EFFECTIVENESS: 'Strategy Effectiveness',
};

export function DimensionBar({ dim }: { dim: ReadinessDimensionScore }) {
  const color = colorForScore(dim.score);
  return (
    <div title={dim.explanation}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>{DIMENSION_LABEL[dim.dimension] ?? dim.dimension}</span>
        <span className="data-num" style={{ fontSize: 'var(--text-sm)', color: dim.scored ? color : 'var(--bone-text-muted)' }}>
          {dim.score}%{!dim.scored && <span style={{ fontSize: 'var(--text-xs)' }}> · new</span>}
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: 'var(--bone-line)', overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${dim.score}%`,
            background: dim.scored ? color : 'var(--bone-text-muted)',
            opacity: dim.scored ? 1 : 0.4,
            borderRadius: 999,
            transition: 'width 700ms var(--ease-standard)',
          }}
        />
      </div>
    </div>
  );
}
