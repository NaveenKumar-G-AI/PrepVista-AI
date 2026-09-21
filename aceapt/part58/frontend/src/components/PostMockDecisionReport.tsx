import type { DecisionTimelineEntry, PostMockSummary } from '../types';
import './PostMockDecisionReport.css';

/** §114-116: the post-mock decision review. A ledger of counts, then the
 *  sequence of decisions in order — only shown for data that actually
 *  exists (§169 "only where data exists"). */
export interface PostMockDecisionReportProps {
  summary: PostMockSummary;
  timeline: DecisionTimelineEntry[];
}

const ROWS: { key: keyof PostMockSummary; label: string }[] = [
  { key: 'solvedConfidently', label: 'Solved confidently' },
  { key: 'informedGuesses', label: 'Informed guesses' },
  { key: 'blindGuesses', label: 'Blind guesses' },
  { key: 'strategicSkips', label: 'Strategic skips' },
  { key: 'potentiallyUnnecessarySkips', label: 'Potentially unnecessary skips' },
  { key: 'timeOverruns', label: 'Time overruns' },
  { key: 'answerChanges', label: 'Answer changes' },
];

function defaultSummary(): PostMockSummary {
  return {
    solvedConfidently: 14,
    informedGuesses: 6,
    blindGuesses: 2,
    strategicSkips: 3,
    potentiallyUnnecessarySkips: 1,
    timeOverruns: 4,
    answerChanges: 2,
  };
}

function defaultTimeline(): DecisionTimelineEntry[] {
  return [
    { label: 'Q1', action: 'Confident solve', outcome: 'correct' },
    { label: 'Q2', action: 'Eliminate → guess', outcome: 'correct' },
    { label: 'Q3', action: 'Skip → return', outcome: 'incorrect' },
    { label: 'Q4', action: 'Solve → switch answer', outcome: 'ungraded' },
  ];
}

export default function PostMockDecisionReport({
  summary = defaultSummary(),
  timeline = defaultTimeline(),
}: Partial<PostMockDecisionReportProps>) {
  return (
    <div className="f58-root f58-report">
      <h3 className="f58-title f58-report__title">Decision review</h3>

      <dl className="f58-report__ledger">
        {ROWS.map(({ key, label }) => (
          <div key={key} className="f58-report__row">
            <dt>{label}</dt>
            <dd className="f58-numeral">{summary[key]}</dd>
          </div>
        ))}
      </dl>

      {timeline.length > 0 && (
        <div className="f58-report__timeline">
          <p className="f58-report__timeline-label">Sequence</p>
          <ol className="f58-report__timeline-list">
            {timeline.map((entry, index) => (
              <li key={index} className="f58-report__timeline-item">
                <span className={`f58-report__dot f58-report__dot--${entry.outcome ?? 'ungraded'}`} aria-hidden="true" />
                <span className="f58-numeral f58-report__timeline-q">{entry.label}</span>
                <span className="f58-report__timeline-action">{entry.action}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
