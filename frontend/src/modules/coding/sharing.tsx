'use client';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
const organizationsSchema = z.array(z.object({
  id: z.string().uuid(), name: z.string().min(1).max(500), enabled: z.boolean(), can_share: z.boolean(),
})).max(1000).refine(items => new Set(items.map(item => item.id)).size === items.length);
type Organization = z.infer<typeof organizationsSchema>[number];
export function ReadinessSharing() {
  const { user, loading } = useAuth();
  if (loading) return <p role="status">Checking your account before loading sharing preferences…</p>;
  if (!user) return null;
  // Account changes discard previous preferences, messages and pending actions.
  return <SharingPreferences key={user.id} owner={user.id} />;
}

function SharingPreferences({ owner }: { owner: string }) {
  const [result, setResult] = useState<{ organizations: Organization[] } | { error: string }>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const mounted = useRef(false);
  const saving = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    let active = true;
    void api.request('/journey/sharing', { retries: 0, timeoutMs: 8000 }).then(value => {
      const organizations = organizationsSchema.parse(value);
      if (active) setResult({ organizations });
    }).catch(() => {
      if (active) setResult({ error: 'Sharing preferences could not be checked. Retry to see the current setting.' });
    });
    return () => { active = false; };
  }, [owner, refresh]);
  function recheck() {
    setResult(undefined);
    setRefresh(n => n + 1);
  }
  async function change(org: Organization) {
    if (saving.current || !result || !('organizations' in result)) return;
    saving.current = true; setBusy(true); setMessage('Saving your preference…');
    try {
      const value = z.object({ enabled: z.boolean() }).parse(await api.request('/journey/sharing', {
        method: 'PUT', retries: 0, timeoutMs: 8000,
        body: { expected_owner_id: owner, organization_id: org.id, enabled: !org.enabled },
      }));
      if (value.enabled !== !org.enabled) throw new Error('Unexpected sharing receipt');
      if (mounted.current) setMessage('Sharing preference saved. Code and transcripts remain private.');
    } catch {
      // A lost response can follow a committed change. Recheck instead of
      // retrying a stale toggle or claiming the preference stayed unchanged.
      if (mounted.current) setMessage('The save response could not be confirmed. Check the current setting below before trying again.');
    } finally {
      if (mounted.current) { saving.current = false; setBusy(false); recheck(); }
    }
  }
  return <section className="card p-6 space-y-4 mt-6">
    <h2 className="text-xl font-semibold">Organization sharing</h2>
    <p>Choose whether your practice summary contributes to an organization aggregate. This does not share code, transcripts or individual reports. You can revoke it even if the coding pilot is paused.</p>
    {!result ? <p role="status">Checking sharing preferences…</p> : 'error' in result ? <>
      <p role="alert">{result.error}</p>
      <button type="button" className="btn-secondary" onClick={recheck}>Retry sharing preferences</button>
    </> : <>
      {result.organizations.map(org => <div className="flex flex-wrap items-center gap-4" key={org.id}>
        <span>{org.name} · {org.enabled ? 'Sharing enabled' : 'Private'}</span>
        <button type="button" className="btn-secondary" disabled={busy || (!org.enabled && !org.can_share)} onClick={() => void change(org)}>{org.enabled ? 'Revoke sharing' : 'Share aggregate summary'}</button>
      </div>)}
      {!result.organizations.length && <p>No organization sharing options are available for your account.</p>}
    </>}
    <p role="status">{message}</p>
  </section>;
}
