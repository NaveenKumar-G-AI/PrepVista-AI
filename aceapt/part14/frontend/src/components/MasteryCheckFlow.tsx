import { useEffect, useState } from 'react';

import { api } from '../lib/api';
import { deriveStrip } from '../lib/evidenceStrip';
import { CheckQuestion, InterventionPlan, MasteryCheckBlueprint, SkillAnalysis } from '../lib/types';
import { EvidenceStrip } from './EvidenceStrip';
import { Bar, Card, ErrorState, LoadingRows, StateBadge } from './ui';

type Stage = 'loading' | 'answering' | 'completing' | 'results' | 'error';

export function MasteryCheckFlow({
  studentId,
  skillId,
  onExit,
  onFinished,
}: {
  studentId: string;
  skillId: string;
  onExit: () => void;
  onFinished: () => void;
}) {
  const [stage, setStage] = useState<Stage>('loading');
  const [error, setError] = useState('');
  const [checkId, setCheckId] = useState('');
  const [blueprint, setBlueprint] = useState<MasteryCheckBlueprint | null>(null);
  const [questions, setQuestions] = useState<CheckQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [feedback, setFeedback] = useState<{ correct: boolean; correctAnswer: string } | null>(null);
  const [startedAt, setStartedAt] = useState(Date.now());
  const [results, setResults] = useState<{ before: SkillAnalysis; after: SkillAnalysis; explanation: string; intervention: InterventionPlan | null; stateChanged: boolean } | null>(null);

  useEffect(() => {
    api
      .createMasteryCheck(studentId, skillId)
      .then((r) => {
        setCheckId(r.check.id);
        setBlueprint(r.check.blueprint);
        setQuestions(r.questions);
        setStage('answering');
        setStartedAt(Date.now());
      })
      .catch((e) => {
        setError(e.message);
        setStage('error');
      });
  }, [studentId, skillId]);

  const current = questions[index];

  const submit = (choice: string) => {
    if (feedback) return; // already answered this one
    api
      .submitAnswer(checkId, current.id, choice, false, 0, Date.now() - startedAt)
      .then((r) => setFeedback(r))
      .catch((e) => setError(e.message));
  };

  const next = () => {
    setFeedback(null);
    setStartedAt(Date.now());
    if (index + 1 < questions.length) {
      setIndex(index + 1);
    } else {
      setStage('completing');
      api
        .completeMasteryCheck(checkId)
        .then((r) => {
          setResults(r);
          setStage('results');
        })
        .catch((e) => {
          setError(e.message);
          setStage('error');
        });
    }
  };

  if (stage === 'error') return <ErrorState message={error} onRetry={onExit} />;
  if (stage === 'loading') return <LoadingRows count={3} />;

  if (stage === 'completing') {
    return (
      <div className="max-w-2xl">
        <p className="font-mono text-sm text-ink-400">Scoring against independence, difficulty, format and novelty…</p>
      </div>
    );
  }

  if (stage === 'results' && results) {
    return <Results results={results} onDone={onFinished} />;
  }

  return (
    <div className="max-w-xl">
      <div className="mb-6 flex items-center justify-between">
        <button onClick={onExit} className="text-sm text-ink-600 hover:text-ink-900">
          ← Exit check
        </button>
        <span className="font-mono text-xs text-ink-400">
          Question {index + 1} of {questions.length}
        </span>
      </div>

      {blueprint && (
        <p className="mb-6 text-xs text-ink-500">{blueprint.purpose}</p>
      )}

      <div className="mb-2 flex gap-1.5">
        {questions.map((_, i) => (
          <span key={i} className={`h-1 flex-1 rounded-full ${i < index ? 'bg-accent' : i === index ? 'bg-ink-700' : 'bg-neutral-soft'}`} />
        ))}
      </div>

      <Card className="mt-6 px-6 py-6">
        <div className="mb-4 flex gap-2 font-mono text-[11px] uppercase tracking-wide text-ink-400">
          <span>{current.difficulty}</span>
          <span>·</span>
          <span>{current.format.replace('_', ' ')}</span>
          <span>·</span>
          <span>{current.novelty}</span>
        </div>
        <p className="text-lg leading-snug text-ink-900">{current.prompt}</p>

        <div className="mt-5 space-y-2">
          {(current.choices || []).map((choice) => {
            const isCorrect = feedback && choice === feedback.correctAnswer;
            const isChosenWrong = feedback && !feedback.correct && !isCorrect;
            return (
              <button
                key={choice}
                onClick={() => submit(choice)}
                disabled={!!feedback}
                className={`w-full rounded-md border px-4 py-2.5 text-left text-sm transition-colors ${
                  isCorrect
                    ? 'border-accent bg-accent-soft text-accent-700'
                    : isChosenWrong
                    ? 'border-warn/40 bg-warn-soft text-warn'
                    : 'border-line hover:border-ink-400'
                } ${feedback ? 'cursor-default' : ''}`}
              >
                {choice}
              </button>
            );
          })}
        </div>

        {feedback && (
          <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
            <span className={`text-sm font-medium ${feedback.correct ? 'text-accent-700' : 'text-warn'}`}>
              {feedback.correct ? 'Correct' : `Not quite — correct answer: ${feedback.correctAnswer}`}
            </span>
            <button onClick={next} className="rounded-md bg-ink-900 px-4 py-2 text-sm font-medium text-white hover:bg-ink-700">
              {index + 1 < questions.length ? 'Next' : 'See results'}
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}

function Results({
  results,
  onDone,
}: {
  results: { before: SkillAnalysis; after: SkillAnalysis; explanation: string; intervention: InterventionPlan | null; stateChanged: boolean };
  onDone: () => void;
}) {
  const { before, after, explanation, intervention, stateChanged } = results;
  return (
    <div className="max-w-2xl">
      <p className="font-mono text-xs uppercase tracking-widest text-ink-400">Mastery check complete</p>
      <h2 className="mt-1 text-2xl font-semibold text-ink-900">Results</h2>

      <div className="mt-6 flex items-center gap-4">
        <div className="flex flex-col items-center gap-2">
          <span className="text-xs text-ink-400">Before</span>
          <StateBadge state={before.state} label={before.displayLabel} />
        </div>
        <span className="text-ink-300">→</span>
        <div className="flex flex-col items-center gap-2">
          <span className="text-xs text-ink-400">After</span>
          <StateBadge state={after.state} label={after.displayLabel} />
        </div>
        {stateChanged && <span className="ml-2 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent-700">State updated</span>}
      </div>

      <Card className="mt-6 px-5 py-4">
        <EvidenceStrip dims={deriveStrip(after)} showLabels />
      </Card>

      <Card className="mt-4 border-l-2 border-l-ink-700 px-5 py-4">
        <p className="text-[15px] leading-relaxed text-ink-700">{explanation}</p>
      </Card>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <Card className="px-5 py-4">
          <Bar label="Familiar" value={after.evidence.familiarAccuracy} />
        </Card>
        <Card className="px-5 py-4">
          <Bar label="Novel" value={after.evidence.novelAccuracy} />
        </Card>
      </div>

      {intervention && (
        <Card className="mt-4 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-400">Suggested next step (Feature 12)</p>
          <p className="mt-2 text-sm text-ink-700">{intervention.description}</p>
        </Card>
      )}

      <button onClick={onDone} className="mt-6 rounded-md bg-ink-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-ink-700">
        Done
      </button>
    </div>
  );
}
