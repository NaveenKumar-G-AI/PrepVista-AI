import { useEffect, useState } from 'react';
import { api, DEMO_STUDENT_ID } from '../api/client';
import type {
  RecoveryRecommendation,
  RecoveryQuestionPublic,
  RecoveryResultResponse,
  DelayedVerificationResponse,
} from '../types';
import { pct, StateBadge } from '../components/shared';

type Phase = 'loading' | 'error' | 'explain' | 'quiz' | 'submitting' | 'immediate_result' | 'final_result';

const INTERVENTION_LABEL: Record<string, string> = {
  MICRO_EXPLANATION: 'a short explanation',
  WORKED_EXAMPLE: 'a worked example, re-taught from the start',
  ACTIVE_RECALL: 'active recall practice',
  TARGETED_PRACTICE: 'targeted practice on execution',
  CONTRAST_QUESTIONS: 'contrast questions across scenarios',
  APPLICATION_PRACTICE: 'application practice',
  TRANSFER_QUESTION: 'a novel-variation question',
  TIMED_RETRIEVAL: 'timed retrieval practice',
};

export function RecoveryFlow({ skillId, skillName, onDone }: { skillId: string; skillName: string; onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [rec, setRec] = useState<RecoveryRecommendation | null>(null);
  const [questions, setQuestions] = useState<RecoveryQuestionPublic[]>([]);
  const [isDelayedOnly, setIsDelayedOnly] = useState(false);
  const [shouldSimulateDelay, setShouldSimulateDelay] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [immediate, setImmediate] = useState<RecoveryResultResponse | null>(null);
  const [delayed, setDelayed] = useState<DelayedVerificationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadInitial() {
    setPhase('loading');
    try {
      const r = await api.getRecoveryRecommendation(DEMO_STUDENT_ID, skillId);
      setRec(r);
      setQuestions(r.questions);
      setIsDelayedOnly(r.mode === 'DELAYED_VERIFICATION');
      setShouldSimulateDelay(false);
      setPhase('explain');
    } catch (e) {
      setError((e as Error).message);
      setPhase('error');
    }
  }

  useEffect(() => {
    loadInitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skillId]);

  function selectOption(questionId: string, optionId: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }));
  }

  async function finishQuiz() {
    if (!rec) return;
    const answerList = questions.map((q) => ({ questionId: q.id, selectedOptionId: answers[q.id] }));
    setPhase('submitting');
    try {
      if (isDelayedOnly) {
        const result = await api.submitDelayedVerification(
          DEMO_STUDENT_ID,
          rec.session.id,
          answerList,
          shouldSimulateDelay ? 5 : undefined,
        );
        setDelayed(result);
        setPhase('final_result');
      } else {
        const result = await api.submitRecoveryResult(DEMO_STUDENT_ID, rec.session.id, answerList);
        setImmediate(result);
        setPhase('immediate_result');
      }
    } catch (e) {
      setError((e as Error).message);
      setPhase('error');
    }
  }

  async function beginDelayedCheck() {
    setPhase('loading');
    try {
      const r = await api.getRecoveryRecommendation(DEMO_STUDENT_ID, skillId);
      setRec(r);
      setQuestions(r.questions);
      setIsDelayedOnly(true);
      setShouldSimulateDelay(true);
      setAnswers({});
      setStepIndex(0);
      setPhase('explain');
    } catch (e) {
      setError((e as Error).message);
      setPhase('error');
    }
  }

  if (phase === 'loading') {
    return <Shell><p className="text-text-muted font-mono text-sm">Loading…</p></Shell>;
  }

  if (phase === 'error') {
    return (
      <Shell>
        <p className="text-rose text-sm mb-4">{error}</p>
        <BackButton onDone={onDone} />
      </Shell>
    );
  }

  if (!rec) return null;

  if (phase === 'explain') {
    const noContent = questions.length === 0;
    return (
      <Shell>
        <Header skillName={skillName} eyebrow={isDelayedOnly ? 'Quick verification' : 'Quick recovery'} onDone={onDone} />
        <p className="text-xs uppercase tracking-wider text-text-faint mt-6 mb-2">Why this appeared</p>
        <p className="text-text text-sm leading-relaxed">{rec.explanation}</p>
        {!isDelayedOnly && (
          <p className="text-text-muted text-sm mt-4">
            ACEAPT is using <span className="text-signal">{INTERVENTION_LABEL[rec.interventionType] ?? rec.interventionType}</span> for
            this recovery{rec.session.escalationLevel >= 2 ? ' — a broader re-teach, since narrower recovery hasn\u2019t held before' : ''}.
          </p>
        )}
        {noContent ? (
          <p className="text-amber text-sm mt-6">
            This skill doesn't have recovery questions authored in this prototype yet — in production this would pull from ACEAPT's
            existing question bank (see spec section 12).
          </p>
        ) : (
          <button
            onClick={() => setPhase('quiz')}
            className="mt-8 w-full bg-signal text-ink font-medium rounded-md py-3 hover:opacity-90 transition-opacity"
          >
            {isDelayedOnly ? 'Start quick check' : 'Begin recovery'}
          </button>
        )}
      </Shell>
    );
  }

  if (phase === 'quiz') {
    const q = questions[stepIndex];
    const selected = answers[q.id];
    const isLast = stepIndex === questions.length - 1;
    return (
      <Shell>
        <Header skillName={skillName} eyebrow={isDelayedOnly ? 'Quick verification' : 'Quick recovery'} onDone={onDone} />
        <p className="text-xs uppercase tracking-wider text-signal mt-6 mb-1">
          Step {stepIndex + 1} of {questions.length} · {q.stepTitle}
        </p>
        <p className="font-display text-lg leading-snug mt-3 mb-5">{q.prompt}</p>
        <div className="space-y-2">
          {q.options.map((opt) => (
            <button
              key={opt.id}
              onClick={() => selectOption(q.id, opt.id)}
              className={`w-full text-left rounded-md border px-4 py-3 text-sm transition-colors ${
                selected === opt.id ? 'border-signal bg-signal/10 text-text' : 'border-hairline text-text-muted hover:border-text-faint'
              }`}
            >
              {opt.text}
            </button>
          ))}
        </div>
        <button
          disabled={!selected}
          onClick={() => (isLast ? finishQuiz() : setStepIndex((i) => i + 1))}
          className="mt-8 w-full bg-signal text-ink font-medium rounded-md py-3 disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
        >
          {isLast ? 'Submit' : 'Next'}
        </button>
      </Shell>
    );
  }

  if (phase === 'submitting') {
    return <Shell><p className="text-text-muted font-mono text-sm">Grading…</p></Shell>;
  }

  if (phase === 'immediate_result' && immediate) {
    return (
      <Shell>
        <Header skillName={skillName} eyebrow="Recovery complete" onDone={onDone} />
        <div className="flex items-end gap-6 mt-8 mb-6">
          <ScoreBlock label="Before" value={pct(immediate.beforeScore)} muted />
          <span className="text-text-faint text-2xl pb-1">→</span>
          <ScoreBlock label="Just now" value={pct(immediate.score)} />
        </div>
        <p className="text-text text-sm leading-relaxed">
          {immediate.correctCount} of {immediate.total} correct. But we're not done — ACEAPT will verify whether this improvement
          actually lasts after some time passes, not just right now.
        </p>
        <div className="rounded-lg border border-hairline bg-panel px-5 py-4 mt-6">
          <p className="text-xs uppercase tracking-wider text-text-faint mb-1">Next</p>
          <p className="text-sm text-text-muted">
            In production, ACEAPT schedules a short delayed check automatically. For this demo, you can trigger it now.
          </p>
          <button
            onClick={beginDelayedCheck}
            className="mt-4 w-full bg-panel-raised border border-hairline text-text rounded-md py-2.5 text-sm hover:border-signal transition-colors"
          >
            ⏱ Simulate: 5 days later (demo)
          </button>
        </div>
      </Shell>
    );
  }

  if (phase === 'final_result' && delayed) {
    return (
      <Shell>
        <Header skillName={skillName} eyebrow="Delayed verification" onDone={onDone} />
        <div className="flex items-end gap-6 mt-8 mb-6">
          {immediate && (
            <>
              <ScoreBlock label="Immediate" value={pct(immediate.score)} muted />
              <span className="text-text-faint text-2xl pb-1">→</span>
            </>
          )}
          <ScoreBlock label="Delayed check" value={pct(delayed.score)} />
        </div>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs uppercase tracking-wider text-text-faint">Status</span>
          <StateBadge state={delayed.assessment.memoryState} />
        </div>
        {delayed.verified ? (
          <>
            <p className="text-text text-sm leading-relaxed">
              {delayed.correctCount} of {delayed.total} correct after a delay — the improvement held. ACEAPT is treating {skillName} as
              retained, not just recently practiced.
            </p>
            <div className="rounded-lg border border-sage/40 bg-sage/10 px-5 py-4 mt-6">
              <p className="text-sage text-sm font-medium">No additional review required right now.</p>
              <p className="text-text-muted text-xs mt-1">
                Confidence: {delayed.assessment.confidence.toLowerCase()} — based on {delayed.assessment.delayedEvidenceCount} delayed
                check{delayed.assessment.delayedEvidenceCount === 1 ? '' : 's'} so far.
              </p>
            </div>
          </>
        ) : (
          <>
            <p className="text-text text-sm leading-relaxed">
              {delayed.correctCount} of {delayed.total} correct after a delay — that's not quite enough to call this retained yet.
              {delayed.assessment.recurringWeakness && ' This is part of a pattern ACEAPT has seen with this skill before.'}
            </p>
            <div className="rounded-lg border border-amber/40 bg-amber/10 px-5 py-4 mt-6">
              <p className="text-amber text-sm font-medium">This will come back as a priority.</p>
              <p className="text-text-muted text-xs mt-1">
                Next time, ACEAPT will {delayed.assessment.escalationLevel >= 2 ? 'switch to a full re-explanation' : 'raise the difficulty of retrieval practice'} rather than repeating the same recovery.
              </p>
            </div>
          </>
        )}
        <button onClick={onDone} className="mt-8 w-full bg-panel-raised border border-hairline text-text rounded-md py-3 hover:border-signal transition-colors">
          Back to dashboard
        </button>
      </Shell>
    );
  }

  return null;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="max-w-xl mx-auto px-5 py-10 sm:py-14 min-h-[70vh]">{children}</div>;
}

function Header({ skillName, eyebrow, onDone }: { skillName: string; eyebrow: string; onDone: () => void }) {
  return (
    <div>
      <button onClick={onDone} className="text-text-faint text-xs mb-4 hover:text-text-muted transition-colors">
        ← Back
      </button>
      <p className="font-mono text-[11px] tracking-[0.2em] text-text-faint uppercase">{eyebrow}</p>
      <h1 className="font-display text-2xl sm:text-3xl font-semibold mt-1">{skillName}</h1>
    </div>
  );
}

function BackButton({ onDone }: { onDone: () => void }) {
  return (
    <button onClick={onDone} className="text-signal text-sm">
      ← Back to dashboard
    </button>
  );
}

function ScoreBlock({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <p className={`font-mono text-3xl font-semibold ${muted ? 'text-text-faint' : 'text-text'}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-text-faint mt-1">{label}</p>
    </div>
  );
}
