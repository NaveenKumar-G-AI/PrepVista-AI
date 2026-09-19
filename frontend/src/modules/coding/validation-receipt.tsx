'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';

type Receipt = { id: string; artifact_id: string; state: string; suite_id: string; qualification_id: string;
  created_at: string; note: string; code_sha256: string; suite_sha256: string;
  result: { passed: number; total: number; checks: { id: string; status: string }[] } | null };
export function ValidationReceipt({ id }: { id: string }) {
  const { user, loading } = useAuth();
  const owner = user?.id;
  const [result, setResult] = useState<{ owner: string; id: string; data?: Receipt; error?: string }>();
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!owner) return;
    let active = true;
    void api.request<Receipt>(`/coding/validations/${encodeURIComponent(id)}`).then(data => {
      if (active) setResult({ owner, id, data });
    }).catch(() => { if (active) setResult({ owner, id, error: 'This server check is unavailable for your account. Its source may have been removed.' }); });
    return () => { active = false; };
  }, [id, owner, refresh]);
  const current = result?.owner === owner && result?.id === id ? result : undefined;
  const data = current?.data;
  return <section className="card p-6 space-y-4">
    <h1 className="text-2xl font-semibold">Saved server check</h1>
    <Link className="underline" href="/readiness/validations">All server check history</Link>
    {loading ? <p>Checking your account...</p> : !user ? <Link className="underline" href="/login">Sign in to view this result</Link> :
      !data ? <p role="status">{current?.error || 'Loading server check...'}</p> : <>
        <h2 className="text-xl font-semibold">{data.suite_id}</h2><p>{data.note}</p>
        <p>Saved {new Date(data.created_at).toLocaleString()}</p>
        {data.result ? <><p>{data.result.passed}/{data.result.total} server checks passed · Isolated server test</p>
          <ul>{data.result.checks.map(check => <li key={check.id}>{check.id}: {check.status.toLowerCase().replaceAll('_', ' ')}</li>)}</ul></>
          : <p>{data.state === 'UNAVAILABLE' ? 'Validation unavailable. No performance conclusion recorded.' : data.state.toLowerCase()}</p>}
        <Link className="underline" href={`/coding/artifacts/${data.artifact_id}`}>Open the saved artifact</Link>
        <details className="break-all"><summary>Evidence provenance</summary><p>Runner qualification reference: {data.qualification_id}</p><p>Code SHA-256: {data.code_sha256}</p><p>Suite SHA-256: {data.suite_sha256}</p></details>
      </>}
    {user && <button className="underline block" onClick={() => setRefresh(n => n + 1)}>Refresh this server check</button>}
  </section>;
}
