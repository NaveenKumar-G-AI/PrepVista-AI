'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

interface Evidence {
  evidence_id: string; question_id: string; excerpt: string; status: string;
  signals: string[]; gaps: string[]; confidence: string;
}
export interface EvidenceReport {
  version: number; evidence_state: string; confidence: string; partial: boolean;
  numeric_evaluation_status?: string;
  blueprint: { mode: string; target_role: string; plan_limited: boolean; target_primary_questions: number };
  primary_count: number; followup_count: number;
  coverage: Record<string, { asked: number; answered: number; state: string; evidence_ids: string[] }>;
  evidence: Evidence[];
  questions: { id: string; text: string; type: string; family: string }[];
  resume_claims: { claim_id: string; claim_text: string; verification_status: string; evidence_ids: string[] }[];
  top_risks: { gap: string; question_id: string; evidence_id: string; excerpt: string }[];
  missions: { id: string; question_id: string; question: string; gap: string; instruction: string }[];
  not_planned: string[]; content_note: string; delivery_note: string;
}
const human = (value: string) => value.toLowerCase().replaceAll('_', ' ');

function RetryAnswer({ sessionId, questionId }: { sessionId: string; questionId: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState('');
  const [pending, setPending] = useState(false);
  const request = useRef<{ answer: string; key: string } | null>(null);
  const submit = async () => {
    if (pending || !answer.trim()) return;
    setPending(true);
    if (request.current?.answer !== answer) request.current = { answer, key: crypto.randomUUID() };
    try {
      const result = await api.request<{ message: string; remaining_gaps: string[] }>(`/interviews/${sessionId}/retry-answer`, {
        method: 'POST', body: { question_id: questionId, answer, client_request_id: request.current.key,
          mission_id: new URLSearchParams(window.location.search).get('mission_id'), expected_owner_id: user?.id },
      });
      setFeedback(result.message + (result.remaining_gaps.length ? ` Still missing: ${result.remaining_gaps.join(', ')}.` : ''));
    } catch (error) { setFeedback(error instanceof Error ? error.message : 'Could not save retry. Try again.'); }
    finally { setPending(false); }
  };
  return <div className="mt-3 space-y-3">
    <button type="button" className="btn-secondary min-h-11" onClick={() => setOpen(!open)} aria-expanded={open}>Retry this answer</button>
    {open && <><label className="block text-sm">Use only your actual experience<textarea className="input mt-2 w-full min-h-32" value={answer} maxLength={3000} onChange={e => setAnswer(e.target.value)} /></label>
      <button type="button" className="btn-primary min-h-11" disabled={pending || !answer.trim()} onClick={submit}>{pending ? 'Comparing evidence…' : 'Save and compare'}</button>
      <p role="status" className="text-sm">{feedback}</p></>}
  </div>;
}

export function InterviewEvidenceReport({ report, sessionId }: { report: EvidenceReport; sessionId: string }) {
  return <section className="space-y-6 mb-10" aria-labelledby="evidence-heading">
    <div className="card p-5 space-y-3">
      <p className="text-sm text-secondary">{human(report.blueprint.mode)} · {report.blueprint.target_role} · {report.partial ? 'Partial interview' : 'Completed interview'}</p>
      <h1 id="evidence-heading" className="text-2xl font-semibold">What this interview showed</h1>
      <p>{report.primary_count} primary questions · {report.followup_count} targeted follow-ups</p>
      <p className="text-sm">Evidence: {human(report.evidence_state)} · Confidence: {report.confidence}</p>
      {report.blueprint.plan_limited && <p className="text-sm text-secondary">The coverage target was reduced to fit this plan and duration.</p>}
      <p className="text-sm text-secondary">{report.content_note}</p>
      <p className="text-sm text-secondary">{report.delivery_note}</p>
    </div>
    <div className="card p-5">
      <h2 className="text-lg font-semibold mb-3">Areas tested</h2>
      <div className="grid gap-3 sm:grid-cols-2">{Object.entries(report.coverage).map(([family, row]) => <div key={family} className="rounded-lg border border-border p-3">
        <p className="capitalize">{human(family)}</p><p className="text-sm text-secondary">{human(row.state)} · {row.answered} answers</p>
      </div>)}</div>
      <details className="mt-4"><summary className="cursor-pointer text-sm">Areas outside this interview&apos;s scope</summary><p className="text-sm mt-2">{report.not_planned.map(human).join(', ')}</p></details>
    </div>
    <div className="card p-5 space-y-3">
      <h2 className="text-lg font-semibold">Next practice missions</h2>
      {report.missions.length === 0 && <p>More evidence is needed before recommending a specific repair. Review your answers and try another interview area.</p>}
      {report.missions.map(m => <div key={m.id} className="border-t border-border pt-4"><h3 className="font-medium">{m.question}</h3><p className="text-sm mt-2">{m.instruction}</p><RetryAnswer sessionId={sessionId} questionId={m.question_id} /></div>)}
      <Link href="/interview/practice" className="inline-block underline min-h-11">Your practice history and story bank</Link>
    </div>
    <div className="card p-5 space-y-3"><h2 className="text-lg font-semibold">Resume claims</h2>
      {!report.resume_claims.length && <p className="text-sm">No structured skill claims were extracted.</p>}
      {report.resume_claims.map(c => <p key={c.claim_id} className="text-sm"><strong>{c.claim_text}</strong> — {human(c.verification_status)}</p>)}
      <p className="text-sm text-secondary">Interview support is not independent verification of a resume claim.</p>
    </div>
    <div className="space-y-3"><h2 className="text-lg font-semibold">Answer evidence and coaching</h2>
      {report.questions.map(q => { const e = report.evidence.find(item => item.question_id === q.id); return <details key={q.id} className="card p-4" id={`evidence-${q.id}`}>
        <summary className="cursor-pointer font-medium">{q.text}</summary>
        {e ? <div className="space-y-3 mt-4"><blockquote className="border-l-2 border-border pl-3 whitespace-pre-wrap">{e.excerpt}</blockquote>
          <p className="text-sm">Textual signals: {e.signals.length ? e.signals.map(human).join(', ') : 'More evidence is needed.'}</p>
          <p className="text-sm">Gaps in this answer: {e.gaps.length ? e.gaps.map(human).join(', ') : 'No specific gap detected; this is not proof of correctness.'}</p>
          <p className="text-sm text-secondary">Build your answer around context, your action, your reasoning and the actual outcome.</p>
          <RetryAnswer sessionId={sessionId} questionId={q.id} /></div> : <p className="mt-3 text-sm">No answer evidence was captured. This area remains unmeasured.</p>}
      </details>; })}
    </div>
  </section>;
}
