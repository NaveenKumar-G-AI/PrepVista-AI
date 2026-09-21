// ============================================================================
// Phase 57 — student UI. Shows: target role, interview mode, current
// question, response area, progress, pause/resume/end. Deliberately does
// NOT expose scoring — the API already strips it (see
// src/api/presenters.ts), but this component also never renders anything
// resembling a live score, so there's no path for a future change to leak
// it back in through a component that expects it.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { interviewApi, makeIdempotencyKey, type InterviewSummary, type PublicQuestion } from "../shared/apiClient";
import { SkillCoverageRail, type CoverageRailItem } from "../shared/EvidenceVocabulary";
import "../shared/tokens.css";
import "./InterviewSessionView.css";

export interface InterviewSessionViewProps {
  sessionId: string;
  roleLabel: string;
  /** Skill id -> human label, for the coverage rail. In the host app this typically comes from the Role-Based Skill Model already loaded elsewhere. */
  skillLabels: Record<string, string>;
  /** Receives the summary completeSession() already computed — the summary view should use this directly rather than re-fetching, since the session is now COMPLETED and re-running completeSession() again would fail. */
  onComplete: (sessionId: string, summary: InterviewSummary) => void;
}

type LoadState = "loading" | "ready" | "awaiting_evaluation" | "submitting" | "ready_to_complete" | "generation_failed" | "error";

export function InterviewSessionView({ sessionId, roleLabel, skillLabels, onComplete }: InterviewSessionViewProps) {
  const [question, setQuestion] = useState<PublicQuestion | null>(null);
  const [responseText, setResponseText] = useState("");
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [coverageSeen, setCoverageSeen] = useState<Record<string, CoverageRailItem["state"]>>({});
  const pendingIdempotencyKey = useRef<string | null>(null);

  async function pollNextQuestion() {
    try {
      const outcome = await interviewApi.getNextQuestion(sessionId);
      if (outcome.status === "QUESTION_READY" || outcome.status === "AWAITING_RESPONSE") {
        setQuestion(outcome.question);
        setCoverageSeen((prev) => ({ ...prev, [outcome.question.skillId]: prev[outcome.question.skillId] ?? "UNASSESSED" }));
        setLoadState("ready");
      } else if (outcome.status === "AWAITING_EVALUATION") {
        setLoadState("awaiting_evaluation");
        window.setTimeout(pollNextQuestion, 1500); // Phase 42: AI evaluation is async — poll rather than block
      } else if (outcome.status === "READY_TO_COMPLETE") {
        setLoadState("ready_to_complete");
      } else {
        setLoadState("generation_failed");
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong loading the next question.");
      setLoadState("error");
    }
  }

  useEffect(() => {
    interviewApi
      .startSession(sessionId)
      .then(() => pollNextQuestion())
      .catch((err) => {
        setErrorMessage(err instanceof Error ? err.message : "Could not start the interview.");
        setLoadState("error");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  async function handleSubmit() {
    if (!question || responseText.trim().length === 0) return;
    if (!pendingIdempotencyKey.current) {
      pendingIdempotencyKey.current = makeIdempotencyKey(sessionId, question.id);
    }
    setLoadState("submitting");
    try {
      await interviewApi.submitResponse(sessionId, {
        questionId: question.id,
        content: responseText,
        modality: "TEXT",
        idempotencyKey: pendingIdempotencyKey.current,
      });
      pendingIdempotencyKey.current = null;
      setResponseText("");
      setQuestion(null);
      await pollNextQuestion();
    } catch (err) {
      // pendingIdempotencyKey is intentionally NOT cleared here — a retry
      // (e.g. the student clicking submit again) reuses the same key so a
      // network hiccup can never double-submit (Phase 36).
      setErrorMessage(err instanceof Error ? err.message : "Couldn't submit that answer — try again.");
      setLoadState("ready");
    }
  }

  async function handleFinish() {
    try {
      const { summary } = await interviewApi.completeSession(sessionId);
      onComplete(sessionId, summary);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Couldn't finish the interview — try again.");
    }
  }

  async function handlePause() {
    await interviewApi.pauseSession(sessionId).catch(() => undefined);
  }

  const coverageItems: CoverageRailItem[] = Object.entries(coverageSeen).map(([skillId, state]) => ({
    skillId,
    skillLabel: skillLabels[skillId] ?? skillId,
    state,
    isCurrent: question?.skillId === skillId,
  }));

  return (
    <div className="ti-session">
      <aside className="ti-session__rail">
        <div className="ti-session__rail-header">
          <span className="ti-session__eyebrow">Interviewing for</span>
          <h2 className="ti-session__role">{roleLabel}</h2>
        </div>
        <SkillCoverageRail items={coverageItems} />
        <div className="ti-session__rail-footer">
          <button className="ti-btn ti-btn--ghost" onClick={handlePause} disabled={loadState === "submitting"}>
            Pause
          </button>
        </div>
      </aside>

      <main className="ti-session__main">
        {loadState === "loading" && <p className="ti-session__status">Setting up your interview…</p>}

        {loadState === "awaiting_evaluation" && (
          <p className="ti-session__status" role="status">
            Reviewing your last answer…
          </p>
        )}

        {loadState === "error" && (
          <div className="ti-session__error" role="alert">
            <p>{errorMessage}</p>
            <button className="ti-btn ti-btn--primary" onClick={() => void pollNextQuestion()}>
              Try again
            </button>
          </div>
        )}

        {loadState === "generation_failed" && (
          <div className="ti-session__error" role="alert">
            <p>The next question couldn't be prepared. This isn't something you did — try again in a moment.</p>
            <button className="ti-btn ti-btn--primary" onClick={() => void pollNextQuestion()}>
              Retry
            </button>
          </div>
        )}

        {loadState === "ready_to_complete" && (
          <div className="ti-session__complete-prompt">
            <p className="ti-session__status">You've covered enough ground here.</p>
            <button className="ti-btn ti-btn--primary" onClick={handleFinish}>
              Finish interview
            </button>
          </div>
        )}

        {question && (loadState === "ready" || loadState === "submitting") && (
          <div className="ti-session__question-card">
            {question.isFollowUp && <span className="ti-session__followup-tag">Follow-up</span>}
            <p className="ti-session__question-text">{question.text}</p>
            <textarea
              className="ti-session__response-input"
              placeholder="Talk through your reasoning — there's no single right shape for an answer here."
              value={responseText}
              onChange={(e) => setResponseText(e.target.value)}
              disabled={loadState === "submitting"}
              rows={8}
              autoFocus
            />
            <div className="ti-session__actions">
              <button className="ti-btn ti-btn--ghost" onClick={() => setResponseText("")} disabled={loadState === "submitting" || responseText.length === 0}>
                Clear
              </button>
              <button className="ti-btn ti-btn--primary" onClick={handleSubmit} disabled={loadState === "submitting" || responseText.trim().length === 0}>
                {loadState === "submitting" ? "Submitting…" : "Submit answer"}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
