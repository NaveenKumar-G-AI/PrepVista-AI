"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import type { ConfidenceLevel, Domain, PublicQuestion } from "@/lib/domain/types";

interface Progress {
  questionsAttempted: number;
  minQuestions: number;
  maxQuestions: number;
}

interface NextQuestionResponse {
  done: boolean;
  reason?: string;
  presentationId?: string;
  question?: PublicQuestion;
  domain?: Domain | null;
  captureConfidence?: boolean;
  progress?: Progress;
}

const DOMAIN_LABEL: Record<Domain, string> = {
  QUANTITATIVE: "Quantitative",
  LOGICAL: "Logical Reasoning",
  VERBAL: "Verbal",
};

const CONFIDENCE_OPTIONS: { value: ConfidenceLevel; label: string }[] = [
  { value: "GUESSING", label: "Guessing" },
  { value: "NOT_SURE", label: "Not sure" },
  { value: "SOMEWHAT_CONFIDENT", label: "Somewhat confident" },
  { value: "CONFIDENT", label: "Confident" },
  { value: "VERY_CONFIDENT", label: "Very confident" },
];

export function QuestionRunner({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [question, setQuestion] = useState<PublicQuestion | null>(null);
  const [domain, setDomain] = useState<Domain | null>(null);
  const [presentationId, setPresentationId] = useState<string | null>(null);
  const [captureConfidence, setCaptureConfidence] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<ConfidenceLevel | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [phase, setPhase] = useState<"loading" | "question" | "finishing" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [pendingRetry, setPendingRetry] = useState<null | (() => void)>(null);

  const loadNextQuestion = useCallback(async () => {
    setPhase("loading");
    setError(null);
    setSelected(null);
    setConfidence(null);
    try {
      const res = await fetch(`/api/diagnostic/${sessionId}/next-question`);
      if (!res.ok) throw new Error("Could not load the next question.");
      const data: NextQuestionResponse = await res.json();

      if (data.done) {
        setPhase("finishing");
        const completeRes = await fetch(`/api/diagnostic/${sessionId}/complete`, { method: "POST" });
        if (!completeRes.ok) throw new Error("Could not finish building your report.");
        router.push(`/diagnostic/${sessionId}/report`);
        return;
      }

      setQuestion(data.question!);
      setDomain(data.domain ?? null);
      setPresentationId(data.presentationId!);
      setCaptureConfidence(!!data.captureConfidence);
      setProgress(data.progress!);
      setStartedAt(new Date().toISOString());
      setPhase("question");
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPendingRetry(() => loadNextQuestion);
    }
  }, [sessionId, router]);

  useEffect(() => {
    loadNextQuestion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  async function submitResponse(status: "ANSWERED" | "SKIPPED" | "DONT_KNOW") {
    if (!presentationId || !question || !startedAt) return;
    const payload = {
      presentationId,
      status,
      studentAnswer: status === "ANSWERED" ? selected : null,
      confidenceLevel: status === "ANSWERED" ? confidence : null,
      questionStartedAt: startedAt,
      questionAnsweredAt: new Date().toISOString(),
    };
    setPhase("loading");
    try {
      const res = await fetch(`/api/diagnostic/${sessionId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Your response didn't save — nothing was lost, just retry.");
      await loadNextQuestion();
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPendingRetry(() => () => submitResponse(status));
    }
  }

  const canSubmit = selected !== null && (!captureConfidence || confidence !== null);

  if (phase === "error") {
    return (
      <div className="mx-auto max-w-xl px-6 py-24 text-center">
        <p className="text-ink">{error}</p>
        <p className="mt-1 text-sm text-ink-faint">Your progress so far is safely saved.</p>
        <Button className="mt-6" onClick={() => pendingRetry?.()}>
          Try again
        </Button>
      </div>
    );
  }

  if (phase === "finishing") {
    return (
      <div className="mx-auto max-w-xl px-6 py-24 text-center">
        <p className="font-display text-2xl text-ink">Putting your profile together…</p>
        <p className="mt-2 text-ink-soft">Weighing accuracy, speed, and confidence across everything you answered.</p>
      </div>
    );
  }

  if (phase === "loading" || !question || !progress) {
    return (
      <div className="mx-auto max-w-xl px-6 py-24 text-center">
        <p className="text-ink-soft">Loading the next question…</p>
      </div>
    );
  }

  const pct = Math.min(100, Math.round((progress.questionsAttempted / progress.maxQuestions) * 100));

  return (
    <div className="mx-auto max-w-2xl px-6 py-10 sm:py-16">
      <div className="mb-8">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-steel-soft">
          <div className="h-full rounded-full bg-steel transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-2 flex items-center justify-between font-mono text-xs text-ink-faint">
          <span>Question {progress.questionsAttempted}</span>
          <span>usually ends between {progress.minQuestions} and {progress.maxQuestions}</span>
        </div>
      </div>

      <span className="font-mono inline-block rounded-full bg-steel-soft px-2.5 py-1 text-[0.7rem] uppercase tracking-wide text-steel">
        {domain ? DOMAIN_LABEL[domain] : "Diagnostic"}
      </span>

      <p className="mt-4 whitespace-pre-line text-xl leading-relaxed text-ink">{question.questionText}</p>

      <div className="mt-6 space-y-2.5" role="radiogroup" aria-label="Answer options">
        {question.options.map((opt) => {
          const isSelected = selected === opt;
          return (
            <button
              key={opt}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => setSelected(opt)}
              className={`block w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                isSelected ? "border-steel bg-steel-soft text-ink" : "border-line bg-surface text-ink hover:border-ink/30"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>

      {captureConfidence && selected !== null && (
        <fieldset className="mt-6">
          <legend className="mb-2 text-sm font-medium text-ink">How confident were you in that answer?</legend>
          <div className="flex flex-wrap gap-2">
            {CONFIDENCE_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs transition-colors ${
                  confidence === opt.value
                    ? "border-brass bg-brass-soft text-brass-strong"
                    : "border-line text-ink-soft hover:border-ink/30"
                }`}
              >
                <input
                  type="radio"
                  name="confidence"
                  className="sr-only"
                  checked={confidence === opt.value}
                  onChange={() => setConfidence(opt.value)}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => submitResponse("SKIPPED")}>
            Skip
          </Button>
          <Button variant="ghost" onClick={() => submitResponse("DONT_KNOW")}>
            I don&rsquo;t know
          </Button>
        </div>
        <Button disabled={!canSubmit} onClick={() => submitResponse("ANSWERED")}>
          Submit
        </Button>
      </div>
    </div>
  );
}
