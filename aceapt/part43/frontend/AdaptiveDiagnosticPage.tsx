import React, { useCallback, useEffect, useState } from 'react';
import { AdaptiveDiagnosticApi, ApiNextQuestion, ApiResult, StartConfig } from './api';
import { AdaptiveQuestion } from './AdaptiveQuestion';
import { DiagnosticProgress } from './DiagnosticProgress';
import { DiagnosticResult } from './DiagnosticResult';

type ViewState =
  | { phase: 'starting' }
  | { phase: 'question'; next: ApiNextQuestion }
  | { phase: 'paused' }
  | { phase: 'finishing' }
  | { phase: 'result'; result: ApiResult }
  | { phase: 'error'; message: string };

export function AdaptiveDiagnosticPage({ config }: { config: StartConfig }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [view, setView] = useState<ViewState>({ phase: 'starting' });

  const loadNext = useCallback(async (sid: string) => {
    try {
      const next = await AdaptiveDiagnosticApi.nextQuestion(sid);
      if (next.done) {
        setView({ phase: 'finishing' });
        const result = await AdaptiveDiagnosticApi.complete(sid);
        setView({ phase: 'result', result });
      } else {
        setView({ phase: 'question', next });
      }
    } catch (err) {
      // Network interruption / expired session / backend error (spec section 66):
      // surface it plainly rather than losing the student's place silently.
      setView({ phase: 'error', message: err instanceof Error ? err.message : 'Something went wrong loading the next question.' });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { sessionId: sid } = await AdaptiveDiagnosticApi.start(config);
        if (cancelled) return;
        setSessionId(sid);
        await loadNext(sid);
      } catch (err) {
        if (!cancelled) setView({ phase: 'error', message: err instanceof Error ? err.message : 'Could not start the diagnostic.' });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(result: { isCorrect: boolean; responseTimeMs: number; confidence?: { level: 'low' | 'medium' | 'high' } }) {
    if (view.phase !== 'question' || !sessionId || !view.next.question) return;
    try {
      await AdaptiveDiagnosticApi.submitResponse(sessionId, { questionId: view.next.question.id, ...result });
      await loadNext(sessionId);
    } catch (err) {
      setView({ phase: 'error', message: err instanceof Error ? err.message : 'Could not submit that response - please try again.' });
    }
  }

  async function handlePause() {
    if (!sessionId) return;
    await AdaptiveDiagnosticApi.pause(sessionId);
    setView({ phase: 'paused' });
  }

  async function handleResume() {
    if (!sessionId) return;
    await AdaptiveDiagnosticApi.resume(sessionId);
    await loadNext(sessionId);
  }

  if (view.phase === 'starting' || view.phase === 'finishing') {
    return <StatusMessage text={view.phase === 'starting' ? 'Setting up your diagnostic...' : "Wrapping up your profile..."} />;
  }

  if (view.phase === 'error') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ color: '#b5563c', fontSize: 14 }}>{view.message}</p>
        {sessionId && (
          <button type="button" onClick={() => loadNext(sessionId)} style={retryButtonStyle}>
            Try again
          </button>
        )}
      </div>
    );
  }

  if (view.phase === 'paused') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
        <p style={{ fontSize: 14, color: '#4a3a2c' }}>Paused. Come back whenever you're ready - nothing you've answered is lost.</p>
        <button type="button" onClick={handleResume} style={retryButtonStyle}>
          Resume
        </button>
      </div>
    );
  }

  if (view.phase === 'result') {
    return <DiagnosticResult sessionId={sessionId!} result={view.result} />;
  }

  // view.phase === 'question'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 560 }}>
      <DiagnosticProgress next={view.next} />
      {view.next.question && <AdaptiveQuestion question={view.next.question} onSubmit={handleSubmit} />}
      <button type="button" onClick={handlePause} style={{ ...retryButtonStyle, alignSelf: 'flex-start', background: 'none', color: '#8a7a68' }}>
        Pause
      </button>
    </div>
  );
}

function StatusMessage({ text }: { text: string }) {
  return <p style={{ fontSize: 14, color: '#8a7a68' }}>{text}</p>;
}

const retryButtonStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 10,
  border: '1px solid #e4d8c8',
  background: '#fbeedd',
  color: '#8a5a2c',
  fontSize: 14,
  cursor: 'pointer',
  alignSelf: 'flex-start',
};
