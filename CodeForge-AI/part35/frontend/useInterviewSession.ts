import { useCallback, useState } from "react";
import type { InterviewQuestion, InterviewSession, InterviewCoverageReport } from "../src/domain/types";

export interface InterviewApiConfig {
  apiBaseUrl: string;
  orgId: string;
  actorId: string;
  actorRole?: "CANDIDATE" | "STAFF";
}

type Phase = "idle" | "loading" | "submitting" | "waiting_next" | "completed" | "voice_fallback" | "error";

interface SessionState {
  phase: Phase;
  session: InterviewSession | null;
  question: InterviewQuestion | null;
  coverage: InterviewCoverageReport | null;
  errorMessage: string | null;
}

function headersFor(config: InterviewApiConfig): HeadersInit {
  return {
    "Content-Type": "application/json",
    "x-org-id": config.orgId,
    "x-actor-id": config.actorId,
    "x-actor-role": config.actorRole ?? "CANDIDATE",
  };
}

async function parseOrThrow(res: Response) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? `request failed with status ${res.status}`);
  return body;
}

/**
 * Drives one interview session end to end against the Feature 35 API.
 * Deliberately does not attempt optimistic UI for the response submission —
 * §62 means the client never computes its own answer quality, so there is
 * nothing honest to show until the server's evaluation comes back.
 */
export function useInterviewSession(config: InterviewApiConfig) {
  const [state, setState] = useState<SessionState>({
    phase: "idle", session: null, question: null, coverage: null, errorMessage: null,
  });

  const start = useCallback(async (interviewInput: { candidateId: string; targetRole: string; mode: string; restrictToSkills?: string[] }) => {
    setState((s) => ({ ...s, phase: "loading", errorMessage: null }));
    try {
      const created = await parseOrThrow(
        await fetch(`${config.apiBaseUrl}/interviews`, { method: "POST", headers: headersFor(config), body: JSON.stringify(interviewInput) })
      );
      const started = await parseOrThrow(
        await fetch(`${config.apiBaseUrl}/interviews/${created.id}/start`, { method: "POST", headers: headersFor(config) })
      );
      setState({ phase: "waiting_next", session: started.session, question: started.question, coverage: null, errorMessage: null });
    } catch (err) {
      setState((s) => ({ ...s, phase: "error", errorMessage: err instanceof Error ? err.message : String(err) }));
    }
  }, [config]);

  const submitResponse = useCallback(async (responseText: string) => {
    if (!state.session || !state.question) return;
    const sessionId = state.session.id;
    const questionId = state.question.id;
    const idempotencyKey = `${questionId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    setState((s) => ({ ...s, phase: "submitting" }));
    try {
      const result = await parseOrThrow(
        await fetch(`${config.apiBaseUrl}/interviews/${sessionId}/responses`, {
          method: "POST",
          headers: { ...headersFor(config), "Idempotency-Key": idempotencyKey },
          body: JSON.stringify({ questionId, responseText }),
        })
      );
      if (result.status === "COMPLETED") {
        setState({ phase: "completed", session: result.session, question: null, coverage: result.coverage, errorMessage: null });
      } else if (result.status === "NEXT_QUESTION") {
        setState({ phase: "waiting_next", session: result.session, question: result.question, coverage: null, errorMessage: null });
      } else if (result.status === "EVALUATION_FAILED") {
        setState((s) => ({ ...s, phase: "error", errorMessage: "We couldn't process that answer — please try submitting it again." }));
      }
    } catch (err) {
      setState((s) => ({ ...s, phase: "error", errorMessage: err instanceof Error ? err.message : String(err) }));
    }
  }, [config, state.session, state.question]);

  const pause = useCallback(async () => {
    if (!state.session) return;
    const updated = await parseOrThrow(
      await fetch(`${config.apiBaseUrl}/interviews/${state.session.id}/pause`, { method: "POST", headers: headersFor(config) })
    );
    setState((s) => ({ ...s, session: updated }));
  }, [config, state.session]);

  const resume = useCallback(async () => {
    if (!state.session) return;
    const result = await parseOrThrow(
      await fetch(`${config.apiBaseUrl}/interviews/${state.session.id}/resume`, { method: "POST", headers: headersFor(config) })
    );
    setState((s) => ({ ...s, phase: "waiting_next", session: result.session, question: result.question }));
  }, [config, state.session]);

  return { ...state, start, submitResponse, pause, resume };
}
