import { useMemo, useState } from "react";
import { api } from "../api";
import { AttemptResult, DIFFICULTY_LABELS, PracticeSession as SessionT, Question, SessionSummary } from "../types";
import { AdaptationBanner } from "./AdaptationBanner";
import { DifficultyDial } from "./Dial";
import { QuestionCard } from "./QuestionCard";

interface Props {
  session: SessionT;
  question: Question;
  onAdvanced: (session: SessionT, question: Question) => void;
  onCompleted: (summary: SessionSummary) => void;
  onExit: () => void;
}

const RETRY_LABELS: Record<string, string> = {
  RETRY_SAME: "Try that exact question again",
  RETRY_WITH_HINT: "Try again with a hint",
  SIMILAR_QUESTION: "Try a similar question",
  EASIER_REMEDIATION: "Warm up with an easier one first",
  REATTEMPT_AFTER_EXPLANATION: "Try a fresh question on this skill",
};

export function PracticeSession({ session, question, onAdvanced, onCompleted, onExit }: Props) {
  const [shownAt] = useState(() => Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [result, setResult] = useState<AttemptResult | null>(null);

  const planTotal = useMemo(() => session.plan.reduce((s, p) => s + p.count, 0), [session.plan]);
  const questionNumber = session.questionsServed.length;

  async function handleSubmit(selectedOptionId: string, timeToStartMs: number, confidence: number | null) {
    setSubmitting(true);
    try {
      const res = await api.submitAttempt(session.id, { selectedOptionId, timeToStartMs, confidence });
      setResult(res);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAdvance(retryType?: string) {
    setAdvancing(true);
    try {
      const res = await api.advance(session.id, retryType);
      if (res.completed) {
        onCompleted(res.summary);
      } else {
        onAdvanced(res.session, res.question);
      }
    } finally {
      setAdvancing(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
      <header className="mb-6 flex items-center justify-between">
        <button onClick={onExit} className="font-body text-sm text-ink-700/60 hover:text-ink-900">
          ← Exit
        </button>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-ink-700/60">
            Q{questionNumber} / {planTotal}
          </span>
          <div className="flex items-center gap-1.5 rounded-full border border-ink-900/10 bg-white px-2.5 py-1">
            <DifficultyDial level={question.difficulty.level} size={22} />
            <span className="font-mono text-[11px] font-medium text-ink-900">{DIFFICULTY_LABELS[question.difficulty.level]}</span>
          </div>
        </div>
      </header>

      <div className="mb-3 flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-ink-700/40">{question.subtopic}</span>
        <span className="h-1 w-1 rounded-full bg-ink-700/20" />
        <span className="font-mono text-[10px] uppercase tracking-wider text-ink-700/40">{question.questionType.replace(/_/g, " ").toLowerCase()}</span>
      </div>

      <div className="rounded-xl border border-ink-900/8 bg-white p-6 shadow-card sm:p-8">
        {!result ? (
          <QuestionCard sessionId={session.id} question={question} shownAt={shownAt} onSubmit={handleSubmit} submitting={submitting} />
        ) : (
          <FeedbackPanel result={result} advancing={advancing} onAdvance={handleAdvance} />
        )}
      </div>
    </div>
  );
}

function FeedbackPanel({
  result,
  advancing,
  onAdvance,
}: {
  result: AttemptResult;
  advancing: boolean;
  onAdvance: (retryType?: string) => void;
}) {
  const { isCorrect, explanation, adaptationEvent, retrySuggestion, fatigue, planExhausted } = result;

  return (
    <div className="space-y-4">
      <div className={`rounded-lg px-4 py-3 ${isCorrect ? "bg-signal-cyan/10 text-signal-cyanDark" : "bg-signal-rust/10 text-signal-rust"}`}>
        <span className="font-display text-sm font-semibold">{isCorrect ? "Correct" : "Not quite"}</span>
        {result.attempt.errorCategory && <span className="ml-2 font-mono text-[11px] opacity-70">{result.attempt.errorCategory.replace(/_/g, " ")}</span>}
      </div>

      {adaptationEvent && <AdaptationBanner event={adaptationEvent} />}

      <div className="space-y-2 font-body text-sm leading-relaxed text-ink-900">
        {isCorrect ? (
          <>
            <p>{explanation.whyCorrect}</p>
            {explanation.efficientApproach && <p className="text-ink-700/70">{explanation.efficientApproach}</p>}
          </>
        ) : (
          <>
            <p className="text-ink-700/80">{explanation.whatHappened}</p>
            <p>{explanation.correctReasoning}</p>
            {explanation.howToAvoid && (
              <p className="rounded-md bg-paper-100 px-3 py-2 text-ink-700/80">
                <span className="font-medium text-ink-900">Next time: </span>
                {explanation.howToAvoid}
              </p>
            )}
          </>
        )}
      </div>

      {fatigue.fatigued && (
        <div className="rounded-md border border-signal-amber/30 bg-signal-amber/5 px-3 py-2 font-body text-xs text-ink-700/80">
          {fatigue.recommendation === "SUGGEST_BREAK"
            ? "This session's had a rough patch — a short break before continuing might help."
            : "Pace has been dipping this session — feel free to wrap up whenever."}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-ink-900/8 pt-4">
        {!isCorrect && retrySuggestion && (
          <button
            onClick={() => onAdvance(retrySuggestion.type)}
            disabled={advancing}
            className="rounded-md border border-signal-cyan px-4 py-2 font-body text-sm font-medium text-signal-cyanDark transition-colors hover:bg-signal-cyan/10 disabled:opacity-50"
          >
            {RETRY_LABELS[retrySuggestion.type] ?? "Try again"}
          </button>
        )}
        <button
          onClick={() => onAdvance()}
          disabled={advancing}
          className="rounded-md bg-signal-cyan px-5 py-2 font-body text-sm font-semibold text-white transition-colors hover:bg-signal-cyanDark disabled:opacity-50"
        >
          {advancing ? "Loading…" : planExhausted ? "Finish Session" : "Next Question"}
        </button>
      </div>
    </div>
  );
}
