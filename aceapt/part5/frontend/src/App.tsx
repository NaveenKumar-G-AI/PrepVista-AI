import { useEffect, useState } from "react";
import { api, auth } from "./api";
import { Dashboard } from "./components/Dashboard";
import { Login } from "./components/Login";
import { PracticeSession } from "./components/PracticeSession";
import { SessionSummaryView } from "./components/SessionSummary";
import { PracticeSession as SessionT, Question, SessionSummary } from "./types";

type View = { kind: "dashboard" } | { kind: "session"; session: SessionT; question: Question } | { kind: "summary"; summary: SessionSummary };

export default function App() {
  const [signedIn, setSignedIn] = useState(!!auth.getToken());
  const [view, setView] = useState<View>({ kind: "dashboard" });
  const [starting, setStarting] = useState(false);
  const [dashboardKey, setDashboardKey] = useState(0);

  // On sign-in, check for a session already in progress and jump straight
  // back into it rather than resetting the student's practice (§31 continuity).
  useEffect(() => {
    if (!signedIn) return;
    api
      .getActiveSession()
      .then((active) => {
        if (active?.session && active.question) {
          setView({ kind: "session", session: active.session, question: active.question });
        }
      })
      .catch(() => {
        /* not fatal — just land on the dashboard */
      });
  }, [signedIn]);

  if (!signedIn) {
    return <Login onSignedIn={() => setSignedIn(true)} />;
  }

  async function handleStartPractice() {
    setStarting(true);
    try {
      const { session, question } = await api.startSession();
      setView({ kind: "session", session, question });
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="min-h-screen bg-paper-100">
      {view.kind === "dashboard" && (
        <Dashboard key={dashboardKey} onStartPractice={handleStartPractice} starting={starting} />
      )}
      {view.kind === "session" && (
        <PracticeSession
          key={view.question.id}
          session={view.session}
          question={view.question}
          onAdvanced={(session, question) => setView({ kind: "session", session, question })}
          onCompleted={(summary) => setView({ kind: "summary", summary })}
          onExit={() => {
            setDashboardKey((k) => k + 1);
            setView({ kind: "dashboard" });
          }}
        />
      )}
      {view.kind === "summary" && (
        <SessionSummaryView
          summary={view.summary}
          onDone={() => {
            setDashboardKey((k) => k + 1);
            setView({ kind: "dashboard" });
          }}
        />
      )}
    </div>
  );
}
