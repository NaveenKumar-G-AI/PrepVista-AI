'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

type Options = { enabled: boolean; reviewers: { id: string; name: string }[]; consent_version: string };
const notice = 'Share only this saved code, explanation, task and assistance label with the selected reviewer for advisory feedback. Other artifacts, transcripts and reports stay private. Withdrawal stops future access; copies already read or downloaded cannot be recalled.';
type Feedback = { feedback: string; observations: Record<string, string> };
type Review = { id: string; artifact_id: string; status: string; feedback: Feedback | null };
type SharedArtifact = { id: string; status: string; artifact: { code: string; explanation: string; language: string; challenge_id: string; assistance: string } };
const capabilities = ['reasoning','correctness','debugging','ownership','communication','interview'];
const states = ['NOT_ASSESSED','OBSERVED_STRENGTH','OBSERVED_GAP','REVIEW_NEEDED'];
const emptyLabels = () => Object.fromEntries(capabilities.map(key => [key, 'NOT_ASSESSED']));

export function ArtifactReviewRequest({ artifactId }: { artifactId: string }) {
  const { user, loading } = useAuth();
  if (loading || !user) return null;
  return <RequestForm key={`${user.id}:${artifactId}`} owner={user.id} artifactId={artifactId} />;
}
function RequestForm({ owner, artifactId }: { owner: string; artifactId: string }) {
  const [options, setOptions] = useState<Options>();
  const [reviewer, setReviewer] = useState('');
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const requestId = useRef<string | null>(null), active = useRef(false);
  useEffect(() => {
    active.current = true;
    void api.request<Options>('/artifact-reviews/options', { retries: 0 }).then(value => { if (active.current) setOptions(value); }).catch(() => { if (active.current) setMessage('Artifact feedback is unavailable. Your saved work remains private.'); });
    return () => { active.current = false; };
  }, []);
  async function submit() {
    if (!consent || !reviewer || busy || saved) return;
    setBusy(true); requestId.current ??= crypto.randomUUID();
    try {
      await api.request('/artifact-reviews', { method: 'POST', retries: 0, body: { expected_owner_id: owner, artifact_id: artifactId, reviewer_id: reviewer, request_id: requestId.current, consent_version: 'artifact-feedback-v1', share_saved_artifact: true } });
      if (active.current) { setSaved(true); setMessage('Review requested. Manage access and read feedback in My artifact reviews.'); }
    } catch { if (active.current) setMessage('The request could not be confirmed. Check My artifact reviews or retry with the same selection.'); }
    finally { if (active.current) setBusy(false); }
  }
  return <section className="space-y-3 border-t pt-5"><h2 className="text-xl font-semibold">Ask for human feedback</h2><p>{notice}</p><p>Feedback does not certify correctness, authorship or readiness.</p>
    {options?.enabled && !saved ? <><label className="block">Reviewer<select className="input-field" disabled={busy} value={reviewer} onChange={event => { setReviewer(event.target.value); setConsent(false); requestId.current = null; }}><option value="">Choose a reviewer</option>{options.reviewers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label className="flex gap-2"><input type="checkbox" disabled={busy || !reviewer} checked={consent} onChange={event => setConsent(event.target.checked)} />I agree to share this saved artifact with the selected reviewer.</label><button className="btn-primary" disabled={!reviewer || !consent || busy} onClick={() => void submit()}>Request artifact feedback</button></> : options && !options.enabled ? <p>Human feedback is not enabled for this account.</p> : null}
    <p role="status">{message}</p><Link className="underline" href="/readiness/reviews">My artifact reviews</Link></section>;
}

export function ArtifactReviews() {
  const { user, loading } = useAuth();
  if (loading) return <p role="status">Checking your account…</p>;
  if (!user) return <Link href="/login">Sign in to view artifact reviews</Link>;
  return <ReviewWorkspace key={user.id} owner={user.id} />;
}
function ReviewWorkspace({ owner }: { owner: string }) {
  const [mine, setMine] = useState<Review[]>();
  const [inbox, setInbox] = useState<{ id: string; status: string }[]>();
  const [mineCursor, setMineCursor] = useState<string | null>(null);
  const [inboxCursor, setInboxCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<SharedArtifact>();
  const [labels, setLabels] = useState<Record<string,string>>(emptyLabels);
  const [feedback, setFeedback] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    void api.request<{ items: Review[]; next_cursor: string | null }>('/artifact-reviews/mine', { retries: 0 }).then(value => { if (active.current) { setMine(value.items); setMineCursor(value.next_cursor); } }).catch(() => { if (active.current) setMessage('Review history could not be loaded. Retry without changing any consent.'); });
    return () => { active.current = false; };
  }, []);
  async function act(operation: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setMessage('Checking…');
    try { await operation(); }
    catch { if (active.current) setMessage('This action could not be confirmed. Refresh to check the saved state. Withdrawn or unavailable reviews cannot be opened.'); }
    finally { if (active.current) setBusy(false); }
  }
  async function refreshMine(before?: string) {
    const result = await api.request<{ items: Review[]; next_cursor: string | null }>(`/artifact-reviews/mine${before ? '?before='+encodeURIComponent(before) : ''}`, { retries: 0 });
    if (active.current) { setMine(previous => before ? [...previous || [], ...result.items] : result.items); setMineCursor(result.next_cursor); setMessage('Review history refreshed.'); }
  }
  async function refreshInbox(before?: string) {
    setSelected(undefined);
    const result = await api.request<{ items: { id: string; status: string }[]; next_cursor: string | null }>(`/artifact-reviews/inbox${before ? '?before='+encodeURIComponent(before) : ''}`, { retries: 0 });
    if (active.current) { setInbox(previous => before ? [...previous || [], ...result.items] : result.items); setInboxCursor(result.next_cursor); setMessage('Assigned inbox refreshed.'); }
  }
  return <div className="space-y-6"><h1 className="text-3xl font-semibold">Artifact reviews</h1><p>{notice}</p><p>Human feedback here is advisory and does not update verified readiness. Saved feedback stays available to its student after withdrawal.</p>
    <button className="btn-secondary" disabled={busy} onClick={() => void act(() => refreshMine())}>Refresh my reviews</button>
    {mine?.map(item => <article className="card p-5 space-y-3" key={item.id}><Link className="underline" href={`/coding/artifacts/${item.artifact_id}`}>Saved artifact</Link><p>Review status: {item.status}</p>{item.feedback && <><p className="whitespace-pre-wrap">{item.feedback.feedback}</p>{Object.entries(item.feedback.observations).map(([key,value]) => <p key={key}>{key}: {value.toLowerCase().replaceAll('_',' ')}</p>)}</>}
      {item.status !== 'WITHDRAWN' && <button className="btn-secondary" disabled={busy} onClick={() => void act(async () => { await api.request(`/artifact-reviews/${item.id}/withdraw`, { method: 'POST', retries: 0, body: { expected_owner_id: owner } }); await refreshMine(); })}>Withdraw reviewer access</button>}</article>)}{mine?.length === 0 && <p>No artifact review requests yet.</p>}
    {mineCursor && <button className="btn-secondary" disabled={busy} onClick={() => void act(() => refreshMine(mineCursor))}>Older review requests</button>}
    <section className="card p-5 space-y-4"><h2 className="text-xl font-semibold">Assigned reviewer inbox</h2><p>Only configured reviewers can open assigned artifacts. Organization-admin access alone grants no artifact access.</p>
      <button className="btn-secondary" disabled={busy} onClick={() => void act(() => refreshInbox())}>Load reviewer inbox</button>
      {inboxCursor && <button className="btn-secondary" disabled={busy} onClick={() => void act(() => refreshInbox(inboxCursor))}>Older assigned reviews</button>}
      {inbox?.map(item => <button className="btn-secondary block" key={item.id} disabled={busy} onClick={() => void act(async () => { setSelected(undefined); const value = await api.request<SharedArtifact>(`/artifact-reviews/${item.id}/artifact`, { retries: 0 }); if (active.current) { setSelected(value); setFeedback(''); setLabels(emptyLabels()); setMessage('Read only the shared artifact. Do not infer unaided authorship or global readiness.'); } })}>Open {item.status.toLowerCase()} review {item.id.slice(0,8)}</button>)}
      {selected && <div className="space-y-3"><h3 className="text-lg font-semibold">{selected.artifact.challenge_id} · {selected.artifact.language}</h3><p>Assistance: {selected.artifact.assistance}</p><pre className="overflow-auto whitespace-pre-wrap">{selected.artifact.code}</pre><p className="whitespace-pre-wrap">{selected.artifact.explanation}</p>
        {selected.status === 'OPEN' ? <>{capabilities.map(key => <label className="block" key={key}>{key}<select className="input-field" disabled={busy} value={labels[key]} onChange={event => setLabels(value => ({ ...value, [key]: event.target.value }))}>{states.map(state => <option key={state} value={state}>{state.toLowerCase().replaceAll('_',' ')}</option>)}</select></label>)}
        <label className="block">Advisory feedback<textarea className="input-field" maxLength={2000} value={feedback} disabled={busy} onChange={event => setFeedback(event.target.value)} /></label><p>Leave unsupported capabilities not assessed. Saved feedback is immutable.</p>
        <button className="btn-primary" disabled={busy || !feedback.trim()} onClick={() => void act(async () => { await api.request(`/artifact-reviews/${selected.id}/feedback`, { method: 'POST', retries: 0, body: { expected_owner_id: owner, rubric_version: 'artifact-feedback-v1', observations: labels, feedback } }); if (active.current) { setSelected(undefined); setMessage('Advisory feedback saved. No readiness score was changed.'); } })}>Save advisory feedback</button></> : <p>Feedback for this request has already been saved.</p>}
      </div>}
    </section><p role="status">{message}</p></div>;
}
