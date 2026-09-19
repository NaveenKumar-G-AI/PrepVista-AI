'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AuthHeader } from '@/components/auth-header';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';

type History = { items: { id: string; artifact_id: string; state: string; suite_id: string; created_at: string;
  result: { passed: number; total: number; checks: { id: string; status: string }[] } | null }[]; next_cursor: string | null };
function HistoryList() {
  const [cursor, setCursor] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<{ cursor: string | null; data?: History; error?: string }>();
  useEffect(() => {
    let active = true;
    void api.request<History>('/coding/validations' + (cursor ? `?before=${encodeURIComponent(cursor)}` : '')).then(data => {
      if (active) setResult({ cursor, data });
    }).catch(() => { if (active) setResult({ cursor, error: 'Server check history is unavailable. Retry, or return to the newest page if a source was removed.' }); });
    return () => { active = false; };
  }, [cursor, refresh]);
  const current = result?.cursor === cursor ? result : undefined;
  function download() {
    if (!current?.data) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify({ schema_version: 1, ...current.data }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url;
    link.download = `prepvista-server-checks-${cursor || 'newest'}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className="space-y-4">
    {!current && <p role="status">Loading server checks...</p>}
    {current?.error && <p role="alert">{current.error}</p>}
    {current?.data && <>
      {!current.data.items.length && <p>No server checks recorded yet.</p>}
      {current.data.items.map(job => <article id={`job-${job.id}`} className="rounded-xl border p-4 space-y-2" key={job.id}>
        <h2 className="font-semibold"><Link className="underline" href={`/readiness/validations/${job.id}`}>{job.suite_id}</Link></h2><p>{new Date(job.created_at).toLocaleString()}</p>
        {job.result ? <><p>{job.result.passed}/{job.result.total} server checks passed · Isolated server test</p>
          <details><summary>Check outcomes</summary><ul>{job.result.checks.map(c => <li key={c.id}>{c.id}: {c.status.toLowerCase().replaceAll('_', ' ')}</li>)}</ul></details></>
          : <p>{job.state === 'UNAVAILABLE' ? 'Validation unavailable. No performance conclusion recorded.' : job.state.toLowerCase()}</p>}
        <Link href={`/coding/artifacts/${job.artifact_id}`} className="underline">Saved artifact</Link>
      </article>)}
      <button className="btn-secondary" onClick={download}>Download this results page</button>
      {current.data.next_cursor && <button className="underline block" onClick={() => setCursor(current.data!.next_cursor)}>Older server checks</button>}
    </>}
    <button className="underline" onClick={() => setRefresh(n => n + 1)}>Refresh server history</button>
    {cursor && <button className="underline block" onClick={() => setCursor(null)}>Newest server checks</button>}
  </div>;
}

export default function ValidationHistoryPage() {
  const { user, loading } = useAuth();
  return <div className="min-h-screen surface-primary"><AuthHeader /><main className="mx-auto max-w-4xl px-6 py-8"><section className="card p-6 space-y-4">
    <h1 className="text-2xl font-semibold">Saved server checks</h1>
    <p>Each result covers its saved artifact and declared test suite. It does not prove authorship, unaided work or role readiness. This history remains available when coding is paused. Downloaded copies cannot be recalled by account deletion.</p>
    <Link className="underline block" href="/readiness">Your readiness list</Link>
    {loading ? <p>Checking your account...</p> : user ? <HistoryList key={user.id} /> : <Link className="underline" href="/login">Sign in to view server checks</Link>}
  </section></main></div>;
}
