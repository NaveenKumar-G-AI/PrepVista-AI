'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
type Cohort = { suppressed: boolean; message?: string; participants?: number; areas?: Record<string, Record<string, number> | null>; note?: string };
export default function CohortReadiness() {
  const { user } = useAuth();
  const owner = user?.id;
  const [result, setResult] = useState<{ owner: string; data?: Cohort; error?: string }>();
  useEffect(() => {
    if (!owner) return;
    let active = true;
    void api.request<Cohort>('/journey/cohort').then(data => { if (active) setResult({ owner, data }); }).catch(e => { if (active) setResult({ owner, error: e instanceof Error ? e.message : 'Organization practice summary is unavailable.' }); });
    return () => { active = false; };
  }, [owner]);
  const current = result?.owner === owner ? result : undefined;
  const data = current?.data;
  return <section className="card p-6 space-y-4"><h1 className="text-2xl font-semibold">Unified practice summary</h1><p>This summary uses the same saved preparation snapshots shown to students. It includes consenting, actively enrolled students only.</p>{current?.error ? <p role="status">{current.error}</p> : !data ? <p role="status">Loading permitted aggregate...</p> : data.suppressed ? <p>{data.message}</p> : <><p>{data.participants} participating students</p><div className="grid gap-4 md:grid-cols-2">{Object.entries(data.areas || {}).map(([key, counts]) => <article className="rounded-xl border p-4" key={key}><h2 className="text-lg capitalize">{key}</h2>{counts ? <ul>{Object.entries(counts).map(([state, count]) => <li key={state}>{state.toLowerCase().replaceAll('_', ' ')}: {count}</li>)}</ul> : <p>Suppressed to protect small groups.</p>}</article>)}</div><p>{data.note}</p></>}</section>;
}
