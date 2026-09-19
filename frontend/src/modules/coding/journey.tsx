'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useCodingAccess } from './access';
import { ReadinessExport } from './readiness-export';

type Journey = {
  id: string | null; role_label: string; overall_state: string; data_health: string;
  as_of: string; note: string; policy_version: string;
  next_mission: { id: string; title: string; reason: string; href: string; estimated_minutes: number } | null;
  rows: { key: string; label: string; state: string; confidence: string; freshness: string; coverage: number; gap: string; next_action: string;
    sources: { id: string; module: string; authority: string; href: string; at: string; time_authority?: string }[] }[];
};
const readable = (value: string) => value.toLowerCase().replaceAll('_', ' ');
export function JourneyView({ compact = false, snapshotId }: { compact?: boolean; snapshotId?: string }) {
  const { user, access, loading } = useCodingAccess();
  const [result, setResult] = useState<{ owner: string; requestKey: string; data?: Journey; error?: string }>();
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const router = useRouter();
  const owner = user?.id;
  const requestKey = snapshotId || 'current';
  const active = useRef<string | undefined>(undefined);
  useEffect(() => { active.current = owner; return () => { active.current = undefined; }; }, [owner]);
  const enabled = snapshotId ? !!user : access?.enabled && access?.readiness_updates && access?.server_sync;
  useEffect(() => {
    if (!owner || !enabled) return;
    let active = true;
    void api.request<Journey>(snapshotId ? `/journey/snapshots/${encodeURIComponent(snapshotId)}` : '/journey/current').then(data => { if (active) setResult({ owner, requestKey, data }); }).catch(() => {
      if (active) setResult(previous => ({ owner, requestKey, data: previous?.owner === owner && previous.requestKey === requestKey ? previous.data : undefined,
        error: 'Readiness could not refresh. Saved evidence is preserved; this does not lower your preparation state.' }));
    });
    return () => { active = false; };
  }, [owner, enabled, refresh, snapshotId, requestKey]);
  const current = result && result.owner === owner && result.requestKey === requestKey ? result : undefined;
  const data = current?.data;
  async function act(decision: 'launch' | 'defer' | 'dismiss') {
    if (!owner || !data?.next_mission || busy) return;
    setBusy(true); setActionError('');
    try {
      const path = `/journey/missions/${data.next_mission.id}/${decision === 'launch' ? 'launch' : 'decision'}`;
      const response = await api.request<{ href?: string }>(path, { method: 'POST', body: { expected_owner_id: owner, ...(decision !== 'launch' ? { decision } : {}) } });
      if (active.current !== owner) return;
      if (response.href) router.push(response.href);
      else setRefresh(n => n + 1);
    } catch (e) { setActionError(e instanceof Error ? e.message : 'This mission could not be updated. Your work is preserved.'); }
    finally { setBusy(false); }
  }
  if (!enabled) return compact ? null : <section className="card p-6"><h1 className="text-2xl font-semibold">Your readiness list</h1><p>{loading ? 'Checking access...' : 'The unified practice view is not enabled for this account yet.'}</p><Link href="/dashboard" className="underline">Return to dashboard</Link><Link href="/readiness/history" className="underline block">Saved readiness snapshots</Link></section>;
  return <section className="card p-6 space-y-5">
    <h1 className="text-2xl font-semibold">{compact ? 'Your next practice mission' : 'Your readiness list'}</h1>
    <Link className="underline block" href="/readiness/assignments">Organization assignments</Link>
    <Link className="underline block" href="/readiness/history">Saved readiness snapshots</Link>
    <Link className="underline block" href="/readiness/validations">Saved server checks</Link>
    {current?.error && <p role="status">{current.error}</p>}
    {actionError && <p role="alert">{actionError}</p>}
    {!data ? <p role="status">{current?.error ? 'Try refreshing again when the service is available.' : 'Preparing your practice summary...'}</p> : <>
      <p>{data.role_label} · {readable(data.overall_state)} · Updated {data.as_of}</p>
      {data.data_health !== 'CURRENT' && <p role="status">Evidence processing: {readable(data.data_health)}. The displayed preparation state is not a system-health score.</p>}
      {snapshotId ? <p>This is a saved snapshot. <Link className="underline" href="/readiness">Open your current journey</Link>.</p> : data.next_mission ? <div className="rounded-xl border p-4 space-y-2">
        <h2 className="text-xl font-semibold">{data.next_mission.title}</h2><p>{data.next_mission.reason}</p>
        <p>About {data.next_mission.estimated_minutes} minutes. Completion follows saved activity evidence.</p>
        <div className="flex flex-wrap gap-4"><button className="btn-primary" disabled={busy} onClick={() => void act('launch')}>Continue</button><button className="underline" disabled={busy} onClick={() => void act('defer')}>Defer for one day</button><button className="underline" disabled={busy} onClick={() => void act('dismiss')}>Choose another focus</button></div>
      </div> : <p>You have completed or set aside the suggested missions. <Link className="underline" href="/coding">Choose your own practice</Link>.</p>}
      {compact ? <Link href="/readiness" className="underline">View all readiness areas</Link> : <>
        <p>{data.note}</p>
        <div className="grid gap-4 md:grid-cols-2">{data.rows.map(row => <article className="rounded-xl border p-4 space-y-3" key={row.key}>
          <h2 className="text-lg font-semibold">{row.label}</h2><p>{readable(row.state)} · {readable(row.freshness)}</p>
          <p>{row.coverage} supporting activities · Confidence: {row.confidence}</p><p>{row.gap}</p>
          {row.sources.length > 0 && <details><summary>Supporting evidence</summary><ul className="space-y-2 mt-2">{row.sources.map(source => <li key={`${source.module}:${source.id}`}><Link className="underline" href={source.href}>{source.module} · {readable(source.authority)} · {new Date(source.at).toLocaleDateString()}{source.time_authority === 'CLIENT_CLAIMED' ? ' (client-provided date)' : ''}</Link></li>)}</ul></details>}
          <Link className="underline" href={row.next_action}>Practise this area</Link>
        </article>)}</div>
        <p className="text-sm">Policy: {data.policy_version} · Snapshot: {data.id || 'Pending'}</p>
        {data.id && !snapshotId && <Link className="underline block" href={`/readiness/snapshots/${data.id}`}>Open this saved snapshot</Link>}
        <button className="btn-secondary" disabled={!data.id} onClick={() => window.print()}>Print this snapshot</button>
        {data.id && <ReadinessExport key={`${owner}:${data.id}`} snapshotId={data.id} />}
      </>}
    </>}
    <button className="underline" onClick={() => setRefresh(n => n + 1)}>Refresh readiness</button>
  </section>;
}
