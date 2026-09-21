import React, { useState } from "react";
import { useInterviewSession, type InterviewApiConfig } from "./useInterviewSession";
import { PostInterviewReport } from "./PostInterviewReport";

const DEPTH_LABEL: Record<string, string> = {
  DEFINITION: "Definition",
  APPLICATION: "Application",
  REASONING: "Reasoning",
  TRADE_OFF: "Trade-off",
  FAILURE_SCENARIO: "Failure scenario",
};

export interface InterviewSessionViewProps {
  api: InterviewApiConfig;
  candidateId: string;
  targetRole: string;
  mode?: string;
}

export default function InterviewSessionView({ api, candidateId, targetRole, mode = "TECHNICAL_SCREENING" }: InterviewSessionViewProps) {
  const { phase, session, question, coverage, errorMessage, start, submitResponse, pause, resume } = useInterviewSession(api);
  const [draft, setDraft] = useState("");
  const [started, setStarted] = useState(false);

  if (!started) {
    return (
      <div className="cf-root" style={{ minHeight: 360, display: "grid", placeItems: "center", padding: 24 }}>
        <div style={{ maxWidth: 480, textAlign: "center" }}>
          <div className="cf-eyebrow">Technical interview · {targetRole}</div>
          <h1 style={{ fontFamily: "var(--cf-font-display)", fontSize: 32, margin: "12px 0 8px" }}>
            Let's talk through what you built.
          </h1>
          <p style={{ color: "var(--cf-ink-muted)", marginBottom: 24 }}>
            You'll get one question at a time, grounded in your own submissions where possible. There's no
            penalty for saying "I don't know" — it's recorded honestly, not treated as a wrong answer.
          </p>
          <button
            className="cf-focus-visible"
            onClick={() => { setStarted(true); start({ candidateId, targetRole, mode, restrictToSkills: undefined }); }}
            style={buttonStyle(true)}
          >
            Start interview
          </button>
        </div>
      </div>
    );
  }

  if (phase === "completed" && coverage) {
    return <PostInterviewReport coverage={coverage} targetRole={targetRole} />;
  }

  return (
    <div className="cf-root" style={{ maxWidth: 640, margin: "0 auto", padding: "24px 20px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div className="cf-eyebrow">{targetRole} · {mode.replace(/_/g, " ").toLowerCase()}</div>
        <div style={{ display: "flex", gap: 8 }}>
          {session?.state === "IN_PROGRESS" && (
            <button className="cf-focus-visible" onClick={pause} style={buttonStyle(false)}>Pause</button>
          )}
          {session?.state === "PAUSED" && (
            <button className="cf-focus-visible" onClick={resume} style={buttonStyle(true)}>Resume</button>
          )}
        </div>
      </header>

      {errorMessage && (
        <div role="alert" style={{ background: "var(--cf-gap-bg)", color: "var(--cf-gap)", padding: "10px 14px", borderRadius: "var(--cf-radius)", marginBottom: 16, fontSize: 14 }}>
          {errorMessage}
        </div>
      )}

      {question && (
        <div style={{ background: "var(--cf-surface)", border: "1px solid var(--cf-line)", borderRadius: "var(--cf-radius)", boxShadow: "var(--cf-shadow)", padding: 24 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <Tag>{question.skill}</Tag>
            <Tag>{DEPTH_LABEL[question.depthLevel] ?? question.depthLevel}</Tag>
          </div>
          <p style={{ fontFamily: "var(--cf-font-display)", fontSize: 22, lineHeight: 1.4, margin: "0 0 20px" }}>
            {question.promptText}
          </p>

          <textarea
            className="cf-focus-visible"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type your answer — or say you're not sure, that's a valid answer here."
            disabled={phase === "submitting"}
            rows={6}
            style={{
              width: "100%", boxSizing: "border-box", fontFamily: "var(--cf-font-body)", fontSize: 15,
              padding: 12, borderRadius: 8, border: "1px solid var(--cf-line)", resize: "vertical",
            }}
          />

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
            <button
              className="cf-focus-visible"
              onClick={() => { if (draft.trim()) { submitResponse(draft.trim()); setDraft(""); } }}
              disabled={phase === "submitting" || !draft.trim()}
              style={buttonStyle(true)}
            >
              {phase === "submitting" ? "Submitting…" : "Submit answer"}
            </button>
          </div>
        </div>
      )}

      {!question && phase === "loading" && <p style={{ color: "var(--cf-ink-muted)" }}>Preparing your first question…</p>}
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontFamily: "var(--cf-font-mono)", fontSize: 11, letterSpacing: "0.04em", textTransform: "uppercase",
      background: "var(--cf-surface-sunken)", color: "var(--cf-ink-muted)", padding: "3px 8px", borderRadius: 5,
    }}>
      {children}
    </span>
  );
}

function buttonStyle(primary: boolean): React.CSSProperties {
  return {
    fontFamily: "var(--cf-font-body)", fontSize: 14, fontWeight: 600, padding: "10px 18px", borderRadius: 8,
    border: primary ? "none" : "1px solid var(--cf-line)",
    background: primary ? "var(--cf-ink)" : "transparent",
    color: primary ? "var(--cf-bg)" : "var(--cf-ink-muted)",
    cursor: "pointer",
  };
}
