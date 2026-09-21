"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./HintLadderPanel.module.css";
import { LadderRungs } from "./LadderRungs";
import type { AssistanceLevel, CodeLocation, Confidence, HintType } from "@/lib/hint-ladder/types";

interface HintPayload {
  hintType: HintType;
  observation: string;
  text: string;
  targetArea: string | null;
  confidence: Confidence;
  codeLocation: CodeLocation | null;
  source: "AI_GENERATED" | "DETERMINISTIC_FALLBACK" | "TEMPLATED_RESOLUTION";
}

interface HintResponsePayload {
  sessionId: string;
  status: "ACTIVE" | "RESOLVED" | "ABANDONED";
  currentLevel: AssistanceLevel;
  kind: string;
  hint: HintPayload | null;
  templatedMessage: string | null;
  denialReason: string | null;
  offerSolutionOption: boolean;
  progression: Array<{ level: AssistanceLevel; reached: boolean; current: boolean }>;
}

function newRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export interface HintLadderPanelProps {
  problemId: string;
  mode?: "PRACTICE" | "ASSESSMENT" | "INTERVIEW";
  /** Called only with a location whose sourceOfTruth is not "NONE" — never a fabricated one. */
  onNavigateToLocation?: (location: CodeLocation) => void;
}

export function HintLadderPanel({ problemId, mode = "PRACTICE", onNavigateToLocation }: HintLadderPanelProps) {
  const [response, setResponse] = useState<HintResponsePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasRequestedOnce, setHasRequestedOnce] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/hint-ladder/state?problemId=${encodeURIComponent(problemId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data.exists) return;
        setHasRequestedOnce(true);
        setResponse({
          sessionId: data.sessionId,
          status: data.status,
          currentLevel: data.currentLevel,
          kind: data.status === "RESOLVED" ? "RESOLVED" : "RESTORED",
          hint: null,
          templatedMessage: null,
          denialReason: null,
          offerSolutionOption: false,
          progression: data.progression,
        });
      })
      .catch(() => {
        /* silent — panel just starts in the idle state, editor/submission unaffected */
      });
    return () => {
      cancelled = true;
    };
  }, [problemId]);

  const sendRequest = useCallback(
    async (action: "REQUEST_HELP" | "REQUEST_DEEPER" | "REQUEST_SOLUTION", studentResponse?: { type: "QUICK_ACTION" | "FREE_TEXT"; value: string }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/hint-ladder/request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId: newRequestId(), problemId, action, studentResponse }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? "Hint generation is temporarily unavailable.");
        }
        const data: HintResponsePayload = await res.json();
        setResponse(data);
        setHasRequestedOnce(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong requesting a hint.");
      } finally {
        setLoading(false);
      }
    },
    [problemId]
  );

  const resolved = response?.status === "RESOLVED";

  return (
    <div className={styles.panel}>
      <div className={styles.eyebrow}>
        <span className={styles.modeTag}>
          <span className={styles.modeDot} aria-hidden="true" />
          {mode.toLowerCase()}
        </span>
        {response && <span>{resolved ? "resolved" : response.currentLevel.toLowerCase().replace("_", " ")}</span>}
      </div>

      {response && response.progression.length > 0 && <LadderRungs progression={response.progression} resolved={resolved} />}

      {!hasRequestedOnce && !loading && (
        <div className={styles.idleState}>
          <p className={styles.idleTitle}>Need a hint?</p>
          <p className={styles.idleBody}>
            The ladder starts with a small nudge and only goes deeper if it turns out you need it — it's a resource, not a shortcut.
          </p>
          <button className={styles.primaryButton} onClick={() => sendRequest("REQUEST_HELP")} disabled={loading}>
            Get a hint
          </button>
        </div>
      )}

      {loading && <p className={styles.observation}>Thinking about where you are…</p>}

      {error && <p className={styles.errorBanner}>{error}</p>}

      {response?.templatedMessage && response.kind !== "RESOLVED" && <p className={styles.progressBanner}>{response.templatedMessage}</p>}

      {resolved && (
        <div className={styles.resolvedBanner}>
          <p className={styles.resolvedTitle}>Resolved</p>
          <p className={styles.idleBody}>{response?.templatedMessage ?? "The issue appears resolved."}</p>
        </div>
      )}

      {response?.denialReason && (
        <div>
          <p className={styles.deniedBanner}>{response.denialReason}</p>
        </div>
      )}

      {response?.hint && (
        <div className={styles.hintCard} data-fallback={response.hint.source === "DETERMINISTIC_FALLBACK"}>
          <p className={styles.observation}>{response.hint.observation}</p>
          <p className={styles.hintText}>{response.hint.text}</p>
          {response.hint.source === "DETERMINISTIC_FALLBACK" && (
            <p className={styles.fallbackNote}>Personalized hints are temporarily unavailable — this is general guidance instead.</p>
          )}
          {response.hint.codeLocation && response.hint.codeLocation.sourceOfTruth !== "NONE" && (
            <button
              className={styles.codeLocation}
              onClick={() => response.hint?.codeLocation && onNavigateToLocation?.(response.hint.codeLocation)}
            >
              → {response.hint.codeLocation.functionName ?? "code"}
              {response.hint.codeLocation.startLine ? `:${response.hint.codeLocation.startLine}` : ""}
            </button>
          )}
        </div>
      )}

      {hasRequestedOnce && !resolved && !loading && (
        <div className={styles.actionRow}>
          <button className={styles.secondaryButton} onClick={() => sendRequest("REQUEST_DEEPER", { type: "QUICK_ACTION", value: "understood" })}>
            I understand
          </button>
          <button className={styles.secondaryButton} onClick={() => sendRequest("REQUEST_DEEPER", { type: "QUICK_ACTION", value: "still_stuck" })}>
            Still stuck
          </button>
          <button className={styles.primaryButton} onClick={() => sendRequest("REQUEST_DEEPER")}>
            Give me another hint
          </button>
        </div>
      )}

      {response?.offerSolutionOption && !resolved && !loading && (
        <button className={styles.ghostButton} onClick={() => sendRequest("REQUEST_SOLUTION")}>
          Show the full solution instead
        </button>
      )}
    </div>
  );
}
