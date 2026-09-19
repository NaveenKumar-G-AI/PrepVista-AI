'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AuthHeader } from '@/components/auth-header';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';

type History = { items: { id: string; role_label: string; policy_version: string; as_of: string; overall_state: string }[]; next_cursor: string | null };
function SavedHistory() {
  const [cursor, setCursor] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ cursor: string | null; data?: History; error?: string }>();
  useEffect(() => {
    let active = true;
    void api.request<History>('/journey/snapshots' + (cursor ? `?before=${encodeURIComponent(cursor)}` : '')).then(data => {
      if (active) setResult({ cursor, data });
    }).catch(() => {
      if (active) setResult({ cursor, error: 'Saved snapshots could not be loaded. Retry, or return to the newest snapshots if a source was removed.' });
    });
    return () => { active = false; };
  }, [cursor, retry]);
  const current = result?.cursor === cursor ? result : undefined;
  return <div className="space-y-4">
    {!current && <p role="status">Loading your saved snapshots...</p>}
    {current?.error && <p role="alert">{current.error} <button className="underline" onClick={() => setRetry(n => n + 1)}>Retry</button></p>}
    {current?.data && <>
      {current.data.items.length === 0 ? <p>No saved snapshots yet.</p> : <ul className="space-y-3">{current.data.items.map(item => <li className="rounded-xl border p-4" key={item.id}>
        <Link className="underline font-semibold" href={`/readiness/snapshots/${item.id}`}>{item.role_label} · {item.as_of}</Link>
        <p>{item.overall_state.toLowerCase().replaceAll('_', ' ')} · Policy: {item.policy_version}</p>
      </li>)}</ul>}
      {current.data.next_cursor && <button className="btn-secondary" onClick={() => setCursor(current.data!.next_cursor)}>Older snapshots</button>}
    </>}
    {cursor && <button className="underline block" onClick={() => setCursor(null)}>Newest snapshots</button>}
  </div>;
}

export default function ReadinessHistoryPage() {
  const { user, loading } = useAuth();
  return <div className="min-h-screen surface-primary"><AuthHeader /><main className="mx-auto max-w-4xl px-6 py-8"><section className="card p-6 space-y-4">
    <h1 className="text-2xl font-semibold">Saved readiness snapshots</h1>
    <p>Open and download a private summary with its original role and policy. Saved snapshots remain accessible when the practice workspace is paused. Removing source evidence can invalidate its saved summaries.</p>
    <Link className="underline block" href="/readiness">Current readiness</Link>
    <Link className="underline block" href="/readiness/validations">Saved server checks</Link>
    {loading ? <p>Checking your account...</p> : user ? <SavedHistory key={user.id} /> : <Link className="underline" href="/login">Sign in to view your snapshots</Link>}
  </section></main></div>;
}
