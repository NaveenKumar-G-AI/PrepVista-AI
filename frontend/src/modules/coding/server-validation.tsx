'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useCodingAccess } from './access';

type Job = { id: string; state: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'UNAVAILABLE'; suite_id: string; created_at: string; note: string;
  result: { authority: 'ISOLATED_SERVER_TEST'; passed: number; total: number; checks: { id: string; status: string }[] } | null };
type History = { items: Job[]; supported: boolean; suite_id: string | null };

function ValidationPanel({ artifactId, owner, enabled }: { artifactId: string; owner: string; enabled: boolean }) {
  const [history, setHistory] = useState<History>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const live = useRef(false);
  const requestId = useRef<string | undefined>(undefined);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => {
    let active = true; let timer: ReturnType<typeof setTimeout> | undefined; let polls = 0;
    const load = async () => {
      try {
        const data = await api.request<History>(`/coding/artifacts/${artifactId}/validations`, { retries: 0, timeoutMs: 8000 });
        if (!active) return;
        setHistory(data); setError('');
        if (data.items.some(j => ['QUEUED', 'RUNNING'].includes(j.state)) && polls++ < 12) timer = setTimeout(() => void load(), 5000);
      } catch {
        if (active) setError('Server validation history is unavailable. Your saved artifact and browser practice results are preserved.');
      }
    };
    void load();
    return () => { active = false; clearTimeout(timer); };
  }, [artifactId, refresh]);
  async function validate() {
    if (busy || !enabled || !history?.supported) return;
    requestId.current ||= crypto.randomUUID();
    setBusy(true); setError('');
    try {
      const accepted = await api.request<Job>(`/coding/artifacts/${artifactId}/validate`, { method: 'POST',
        body: { expected_owner_id: owner, request_id: requestId.current } });
      if (!live.current) return;
      // Keep the accepted pending state visible before the next history fetch.
      setHistory(value => value ? { ...value, items: [accepted, ...value.items.filter(job => job.id !== accepted.id)] } : value);
      requestId.current = undefined;
      setRefresh(value => value + 1);
    } catch (e) {
      if (live.current) setError(e instanceof Error ? e.message : 'Could not request server validation. Check its history before trying again.');
    } finally { if (live.current) setBusy(false); }
  }
  const pending = history?.items.some(job => ['QUEUED', 'RUNNING'].includes(job.state));
  const latest = history?.items[0];
  return <section className="rounded-xl border p-4 space-y-3">
    <h2 className="text-xl font-semibold">Server validation</h2>
    <p>Checks the exact saved code against a versioned suite in the separate execution service. This does not prove authorship, unaided work or role readiness. Uses a separate pilot allowance; no interview credit.</p>
    {error && <p role="alert">{error}</p>}
    {!enabled && <p>New server checks are not enabled for this account. Existing results remain accessible here.</p>}
    {history && !history.supported && <p>This task version or language does not have a server suite yet.</p>}
    {enabled && history?.supported && <button className="btn-secondary" disabled={busy || pending} onClick={() => void validate()}>Validate saved code on server</button>}
    <p role="status" aria-atomic="true">{pending ? 'Server check queued or running. Processing delays do not lower your readiness. Refresh later if it is still pending.'
      : latest?.result ? `Server validation completed: ${latest.result.passed} of ${latest.result.total} checks passed. Details are below.`
      : latest?.state === 'UNAVAILABLE' ? 'Server validation is unavailable. No performance conclusion was recorded.' : ''}</p>
    {history?.items.map(job => <article key={job.id} className="border-t pt-3 space-y-2">
      <p>{job.suite_id} · {new Date(job.created_at).toLocaleString()}</p>
      {job.result ? <><p>{job.result.passed}/{job.result.total} server checks passed · Isolated server test</p>
        <details><summary>Check outcomes</summary><ul>{job.result.checks.map(check => <li key={check.id}>{check.id}: {check.status.toLowerCase().replaceAll('_', ' ')}</li>)}</ul></details></>
        : <p>{job.state === 'UNAVAILABLE' ? 'Validation unavailable. No performance conclusion was recorded.' : job.state.toLowerCase()}</p>}
    </article>)}
    <button className="underline" onClick={() => setRefresh(value => value + 1)}>Refresh server checks</button>
  </section>;
}

export function ServerValidation({ artifactId }: { artifactId: string }) {
  const { user, access } = useCodingAccess();
  return user ? <ValidationPanel key={`${user.id}:${artifactId}`} artifactId={artifactId} owner={user.id} enabled={!!access?.server_validation} /> : null;
}
