import type { DecisionInsightDisplay } from '../types';
import './DecisionInsightCard.css';

/** §104-111, §147-148, §204: one evidence-backed observation. Confidence is
 *  stated in plain words, not a colored badge — a LOW-confidence insight
 *  should not visually compete for attention with a HIGH-confidence one. */
export interface DecisionInsightCardProps {
  insight: DecisionInsightDisplay;
}

const CONFIDENCE_TEXT: Record<DecisionInsightDisplay['confidence'], string> = {
  LOW: 'Early signal — based on a small number of decisions so far.',
  MEDIUM: 'Based on a moderate number of decisions.',
  HIGH: 'Based on a consistent pattern across many decisions.',
};

function defaultInsight(): DecisionInsightDisplay {
  return {
    headline: 'Time allocation is your current bottleneck',
    body: 'You often spend longer than expected on low-confidence questions before moving on to something else.',
    confidence: 'MEDIUM',
    practiceCount: 6,
  };
}

export default function DecisionInsightCard({ insight = defaultInsight() }: Partial<DecisionInsightCardProps>) {
  return (
    <article className="f58-root f58-insight">
      <h3 className="f58-title f58-insight__headline">{insight.headline}</h3>
      <p className="f58-insight__body">{insight.body}</p>
      <p className="f58-insight__meta">{CONFIDENCE_TEXT[insight.confidence]}</p>
      {insight.practiceCount != null && (
        <p className="f58-insight__cta">
          Practice <span className="f58-numeral">{insight.practiceCount}</span> related scenarios
        </p>
      )}
    </article>
  );
}
