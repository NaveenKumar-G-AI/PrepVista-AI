'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AuthHeader } from '@/components/auth-header';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
type Recovery = { state: unknown; artifacts: unknown[]; next_cursor?: string | null };
export default function RecoveryPage() {
  const { user, loading } = useAuth();
  const [cursor, setCursor] = useState<{ owner: string; before: string | null; page: number }>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const generation = useRef<symbol | undefined>(undefined);
  useEffect(() => { generation.current = Symbol(); return () => { generation.current = undefined; }; }, [user?.id]);
  async function download() {
    if (!user || busy) return;
    setBusy(true); setMessage('Preparing your private export...');
    const requestGeneration = generation.current;
    const current = cursor?.owner === user.id ? cursor : { owner: user.id, before: null, page: 1 };
    try {
      const result = await api.request<Recovery>('/coding/recovery' + (current.before ? `?before=${current.before}` : ''));
      if (generation.current !== requestGeneration || !requestGeneration) return;
      const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob); const link = document.createElement('a');
      link.href = url; link.download = `prepvista-coding-recovery-${current.page}.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setCursor({ owner: user.id, before: result.next_cursor || null, page: current.page + 1 });
      setMessage(result.next_cursor ? 'This page is downloaded. More saved artifacts remain; download the next page.' : 'Export complete. Keep these files somewhere private.');
    } catch (e) { if (generation.current === requestGeneration) setMessage(e instanceof Error ? e.message : 'Export failed. No stored work was changed.'); }
    finally { setBusy(false); }
  }
  return <div className="min-h-screen surface-primary"><AuthHeader /><main className="mx-auto max-w-3xl px-6 py-8"><section className="card p-6 space-y-4"><h1 className="text-2xl font-semibold">Recover saved coding work</h1><p>Account exports remain available when the coding workspace is temporarily disabled. Each export page includes your workspace and up to 200 saved artifacts.</p>{loading ? <p>Checking your account...</p> : user ? <button className="btn-primary" disabled={busy} onClick={() => void download()}>{cursor?.owner === user.id && cursor.before ? 'Download next export page' : 'Download saved work'}</button> : <Link className="underline" href="/login">Sign in to recover your work</Link>}<p role="status">{message}</p><Link className="underline block" href="/readiness/history">Saved readiness snapshots and reports</Link></section></main></div>;
}
