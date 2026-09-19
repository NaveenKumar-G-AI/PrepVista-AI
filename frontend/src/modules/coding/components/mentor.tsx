'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useCodingAccess } from '../access';
import { mentorOutput, type MentorInput } from '../ai-schemas';
import { TextOutput } from './ui';

export function Mentor({ context, code = '', language = 'javascript', initialMode = 'hint', onAssist }: { context: string; code?: string; language?: MentorInput['language']; initialMode?: MentorInput['mode']; onAssist?: () => void }) {
  const { user } = useAuth(); const { access } = useCodingAccess();
  const [question, setQuestion] = useState(''); const [mode, setMode] = useState(initialMode);
  const [answer, setAnswer] = useState<{ message: string; nextStep: string }>(); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [requestId, setRequestId] = useState<string>();
  async function ask() {
    if (!user || busy || !question.trim()) return;
    setBusy(true); setError(''); setAnswer(undefined);
    // Assistance is recorded when requested, including ambiguous provider errors.
    onAssist?.();
    const id = crypto.randomUUID(); setRequestId(id);
    try {
      const data = await api.request('/coding/mentor', { method: 'POST', timeoutMs: 40000, retries: 0, body: { expected_owner_id: user.id, request_id: id, mode, question, context: context.slice(0, 12000), code: code.slice(0, 20000), language } });
      setAnswer(mentorOutput.parse(data));
    } catch (error) { setError(error instanceof Error ? error.message : 'The mentor is unavailable. Your work is preserved.'); }
    finally { setBusy(false); }
  }
  async function checkStatus() {
    if (!requestId || busy) return;
    setBusy(true);
    try {
      const result = await api.request<{ state: string; response: unknown }>(`/coding/mentor/${requestId}`);
      if (result.state === 'COMPLETED') { setAnswer(mentorOutput.parse(result.response)); setError(''); }
      else setError(`Request status: ${result.state.toLowerCase()}. Checking status does not spend another mentor request.`);
    } catch { setError('Request status could not be loaded. Your code is preserved.'); }
    finally { setBusy(false); }
  }
  return <section className="mentor-panel"><h3>Think with PrepVista</h3><p className="muted small">Your question, selected context and code go to {access?.ai_provider || 'the configured PrepVista AI provider'}.  Feedback is advisory.</p>{!access?.ai_mentoring || !access.server_sync ? <p>AI mentoring is not enabled for this workspace. Authored explanations and practice checks are available.</p> : <><label className="field-label">Type of help<select value={mode} onChange={e => setMode(e.target.value as MentorInput['mode'])}>{['hint', 'reasoning', 'debug', 'review', 'concept', 'solution', 'interview', 'project'].map(value => <option key={value}>{value}</option>)}</select></label><label className="field-label">Your question and reasoning<textarea maxLength={6000} rows={4} value={question} onChange={e => setQuestion(e.target.value)} /></label><button className="button" disabled={busy || !question.trim()} onClick={() => void ask()}>{busy ? 'Thinkingâ€¦' : 'Ask PrepVista'}</button></>}{error && <div><p role="alert">{error}</p>{requestId && <button className="button secondary" disabled={busy} onClick={() => void checkStatus()}>Check previous request status</button>}</div>}{answer && <div><TextOutput text={answer.message}/><h4>Try this next</h4><TextOutput text={answer.nextStep}/></div>}</section>;
}

