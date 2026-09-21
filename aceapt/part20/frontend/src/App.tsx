import { useEffect, useState } from "react";
import { api } from "./lib/api";
import type { ClientQuestion, SessionInfo, DrillChoice, SessionEvidence } from "./lib/types";
import IntroScreen from "./components/IntroScreen";
import TestRunner from "./components/TestRunner";
import ProcessingScreen from "./components/ProcessingScreen";
import ReportScreen from "./components/ReportScreen";
import DrillIntroScreen from "./components/DrillIntroScreen";
import ImprovementScreen from "./components/ImprovementScreen";

type Phase = "boot" | "intro" | "test" | "processing" | "report" | "drill-intro" | "drill" | "improvement";

const STORAGE_KEY = "aceapt-f20-active-session";

interface StoredSession {
  sessionId: string;
  phase: "test" | "drill";
}

export default function App() {
  const [phase, setPhase] = useState<Phase>("boot");
  const [starting, setStarting] = useState(false);

  const [mainSession, setMainSession] = useState<{ session: SessionInfo; questions: ClientQuestion[] } | null>(null);
  const [reportedSessionId, setReportedSessionId] = useState<string | null>(null);

  const [drillChoice, setDrillChoice] = useState<DrillChoice | null>(null);
  const [drillSession, setDrillSession] = useState<{ session: SessionInfo; questions: ClientQuestion[] } | null>(null);

  // On first load, resume an in-progress session if the browser remembers one.
  useEffect(() => {
    (async () => {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setPhase("intro");
        return;
      }
      try {
        const stored = JSON.parse(raw) as StoredSession;
        const state = await api.getSessionState(stored.sessionId);
        if (state.session.status === "IN_PROGRESS") {
          const payload = { session: state.session, questions: state.questions };
          if (stored.phase === "drill") {
            setDrillSession(payload);
            setPhase("drill");
          } else {
            setMainSession(payload);
            setPhase("test");
          }
        } else {
          localStorage.removeItem(STORAGE_KEY);
          setPhase("intro");
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
        setPhase("intro");
      }
    })();
  }, []);

  async function handleStartMain() {
    setStarting(true);
    try {
      const result = await api.startSession();
      setMainSession(result);
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ sessionId: result.session.id, phase: "test" }));
      setPhase("test");
    } finally {
      setStarting(false);
    }
  }

  function handleMainSubmitted(_result: { evidence: SessionEvidence; expired: boolean }) {
    if (!mainSession) return;
    localStorage.removeItem(STORAGE_KEY);
    setReportedSessionId(mainSession.session.id);
    setPhase("processing");
  }

  function handleProcessingDone() {
    setPhase("report");
  }

  async function handleStartDrill() {
    if (!reportedSessionId) return;
    setStarting(true);
    try {
      const result = await api.startDrill(reportedSessionId);
      setDrillChoice(result.drillChoice);
      setDrillSession({ session: result.session, questions: result.questions });
      setPhase("drill-intro");
    } finally {
      setStarting(false);
    }
  }

  function handleBeginDrillRunner() {
    if (!drillSession) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ sessionId: drillSession.session.id, phase: "drill" }));
    setPhase("drill");
  }

  function handleDrillSubmitted(_result: { evidence: SessionEvidence; expired: boolean }) {
    localStorage.removeItem(STORAGE_KEY);
    setPhase("improvement");
  }

  function handleNewMock() {
    setMainSession(null);
    setReportedSessionId(null);
    setDrillChoice(null);
    setDrillSession(null);
    localStorage.removeItem(STORAGE_KEY);
    setPhase("intro");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-xs font-bold text-white">A</div>
            <span className="font-semibold text-slate-900">ACEAPT</span>
            <span className="text-sm text-slate-400">Simulation Intelligence</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        {phase === "boot" && <div className="py-24 text-center text-slate-400">Loading…</div>}

        {phase === "intro" && <IntroScreen onStart={handleStartMain} starting={starting} />}

        {phase === "test" && mainSession && (
          <TestRunner session={mainSession.session} questions={mainSession.questions} onSubmitted={handleMainSubmitted} />
        )}

        {phase === "processing" && <ProcessingScreenWithTimeout onDone={handleProcessingDone} />}

        {phase === "report" && reportedSessionId && (
          <ReportScreen sessionId={reportedSessionId} onStartDrill={handleStartDrill} onNewMock={handleNewMock} />
        )}

        {phase === "drill-intro" && drillChoice && drillSession && (
          <DrillIntroScreen
            drillChoice={drillChoice}
            questionCount={drillSession.questions.length}
            durationSec={drillSession.session.durationSec}
            onBegin={handleBeginDrillRunner}
            starting={starting}
          />
        )}

        {phase === "drill" && drillSession && (
          <TestRunner session={drillSession.session} questions={drillSession.questions} onSubmitted={handleDrillSubmitted} />
        )}

        {phase === "improvement" && drillSession && (
          <ImprovementScreen drillSessionId={drillSession.session.id} onNewMock={handleNewMock} />
        )}
      </main>
    </div>
  );
}

function ProcessingScreenWithTimeout({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2100);
    return () => clearTimeout(t);
  }, [onDone]);
  return <ProcessingScreen />;
}
