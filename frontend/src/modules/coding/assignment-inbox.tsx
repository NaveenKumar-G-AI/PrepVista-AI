'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

type Assignment = { id: string; title: string; instructions: string; organization_name: string; status: string; due_date: string | null; accepted_at: string | null; withdrawn_at: string | null; mission_id: string | null; mission_status: string | null; active_membership: boolean; task_kind: string };
type Inbox = { items: Assignment[]; next_cursor: string | null; enabled: boolean };
export function AssignmentInbox() {
  const { user, loading } = useAuth();
  if (loading) return <p role="status">Checking your account...</p>;
  if (!user) return <Link href="/login" className="underline">Sign in to view your assignments</Link>;
  return <InboxForAccount key={user.id} owner={user.id}/>;
}
function InboxForAccount({ owner }: { owner: string }) {
  const router = useRouter();
  const alive = useRef(false);
  const [data, setData] = useState<Inbox>();
  const [cursor, setCursor] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    void api.request<Inbox>('/journey/assignments/mine' + (cursor ? `?before=${cursor}` : '')).then(value => { if (active) { setData(value); setError(''); } }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Assignments could not be loaded.'); });
    return () => { active = false; };
  }, [cursor, refresh]);
  async function act(item: Assignment, action: 'accept' | 'withdraw' | 'launch') {
    if (busy) return;
    if (action === 'withdraw' && !window.confirm('Withdraw from this assignment and stop sharing its completion status? Your saved personal work stays available.')) return;
    setBusy(true); setError('');
    try {
      if (action === 'launch') {
        if (['DEFERRED', 'DISMISSED'].includes(item.mission_status || '')) await api.request(`/journey/missions/${item.mission_id}/decision`, { method: 'POST', body: { expected_owner_id: owner, decision: 'resume' } });
        const result = await api.request<{ href: string }>(`/journey/missions/${item.mission_id}/launch`, { method: 'POST', body: { expected_owner_id: owner } });
        if (alive.current) router.push(result.href);
      } else {
        await api.request(`/journey/assignments/${item.id}/${action}`, { method: 'POST', body: { expected_owner_id: owner, ...(action === 'accept' ? { share_completion: true } : {}) } });
        if (alive.current) setRefresh(n => n + 1);
      }
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'The assignment could not be updated.'); }
    finally { if (alive.current) setBusy(false); }
  }
  return <section className="card p-6 space-y-5"><h1 className="text-2xl font-semibold">Organization assignments</h1><p>Assigned work is separate from your personal goals. Accepting shares only this assignment’s completion status with your organization. Your code, interview answers and personal readiness are not shared by accepting.</p><p>Interviews use your existing interview allowance. An assignment does not provide extra credits or require paid mentoring.</p><Link className="underline" href="/readiness">Return to my personal journey</Link>{error && <p role="alert">{error}</p>}{!data ? <p role="status">Loading assignments...</p> : <>{!data.enabled && <p>Assignments are paused. Your history and withdrawal options remain available.</p>}{data.items.length === 0 && <p>No assignments on this page.</p>}{data.items.map(item => <article key={item.id} className="rounded-xl border p-4 space-y-3"><p className="text-sm">{item.organization_name} · Organization assignment</p><h2 className="text-xl font-semibold">{item.title}</h2><p className="whitespace-pre-wrap">{item.instructions}</p><p>{item.withdrawn_at ? 'Withdrawn' : item.status.toLowerCase().replaceAll('_', ' ')}{item.due_date ? ` · Due ${new Date(item.due_date).toLocaleString()}` : ''}</p><p>{item.task_kind === 'INTERVIEW' ? 'Complete and save an interview.' : 'Save an implementation with an explanation of your decisions and checks.'} Completion records activity, not a verified skill grade.</p>{!item.active_membership && <p>Organization access is inactive. You can continue personal practice.</p>}{data.enabled && item.active_membership && item.status !== 'CANCELLED' && !item.withdrawn_at && item.status !== 'COMPLETED' && (item.accepted_at ? <button className="btn-primary" disabled={busy} onClick={() => void act(item, 'launch')}>Continue assignment</button> : <div className="space-y-3"><label className="flex items-start gap-3"><input type="checkbox" checked={selected.includes(item.id)} onChange={e => setSelected(s => e.target.checked ? [...s, item.id] : s.filter(id => id !== item.id))}/>Share this assignment’s completion status with {item.organization_name}.</label><button className="btn-primary" disabled={busy || !selected.includes(item.id)} onClick={() => void act(item, 'accept')}>Accept assignment</button></div>)}{!item.withdrawn_at && <button className="underline block" disabled={busy} onClick={() => void act(item, 'withdraw')}>Withdraw and stop status sharing</button>}</article>)}<div className="flex gap-4">{cursor && <button className="underline" onClick={() => setCursor(null)}>Newest assignments</button>}{data.next_cursor && <button className="underline" onClick={() => setCursor(data.next_cursor)}>Next page</button>}</div></>}<button className="underline" onClick={() => setRefresh(n => n + 1)}>Refresh assignments</button></section>;
}
