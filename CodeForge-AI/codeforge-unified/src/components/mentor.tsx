'use client';
import { useState, useRef, useEffect } from 'react';
import { Sparkles, ArrowUp, Square } from 'lucide-react';
import { mentorOutput, type MentorInput } from '@/ai/schemas';
import { TextOutput } from './ui';
const labels: Record<MentorInput['mode'], string> = { hint: 'Give me a hint', reasoning: 'Check my reasoning', debug: 'Explain this error', review: 'Review my code', concept: 'Explain a concept', solution: 'Explain the full solution', interview: 'Review my answer', project: 'Review my project' };
export function Mentor({ context, code = '', language = 'javascript', initialMode = 'hint', onAssist }: { context: string; code?: string; language?: MentorInput['language']; initialMode?: MentorInput['mode']; onAssist?: () => void }) {
  const [mode, setMode] = useState(initialMode); const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<{ message: string; nextStep: string } | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function ask() {
    if (controller.current || !question.trim()) return;
    const abort = new AbortController(); controller.current = abort; setBusy(true); setError(''); setAnswer(null);
    try {
      const response = await fetch('/api/mentor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, question, context: context.slice(0, 12000), code, language }), signal: AbortSignal.any([abort.signal, AbortSignal.timeout(35000)]) });
      const data = await response.json(); if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Please retry your request.');
      if (!abort.signal.aborted) { setAnswer(mentorOutput.parse(data)); onAssist?.(); }
    } catch (e) { if (!abort.signal.aborted) setError(e instanceof Error && e.name !== 'TimeoutError' ? e.message : 'The mentor took too long. Please retry.'); }
    finally { controller.current = null; setBusy(false); }
  }
  return <section className="mentor-panel"><div className="panel-title"><span className="mentor-icon"><Sparkles size={17}/></span><h3>Think with PrepVista</h3><span className="tag violet">AI MENTOR</span></div><p className="muted small">A second perspective, one step at a time.</p><label className="field-label">Type of help<select value={mode} onChange={e => setMode(e.target.value as MentorInput['mode'])} disabled={busy}>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><form onSubmit={e => { e.preventDefault(); void ask(); }}><label className="field-label">Your question and reasoning<textarea maxLength={6000} value={question} onChange={e => setQuestion(e.target.value)} placeholder="Here’s my approach. I’m stuck on…" rows={4} required disabled={busy}/></label><div className="mentor-actions"><span className="muted tiny">Your question and code are sent to Gemini.</span>{busy ? <button type="button" className="button secondary" onClick={() => { controller.current?.abort(); setError('Request cancelled. You can keep working.'); }}><Square size={13}/>Stop</button> : <button className="button" disabled={!question.trim()} type="submit">Ask PrepVista <ArrowUp size={15}/></button>}</div></form>{busy && <p role="status" className="loading">Thinking through your question…</p>}{error && <div role="alert" className="notice">{error}</div>}{answer && <div className="mentor-answer"><span className="eyebrow">MENTOR RESPONSE</span><TextOutput text={answer.message}/><div className="next-step"><strong>Try this next</strong><TextOutput text={answer.nextStep}/></div></div>}</section>;
}
