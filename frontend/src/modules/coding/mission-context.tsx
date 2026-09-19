'use client';
import { Suspense, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
type Context = { id: string; title: string; reason: string; origin: string; status: string; completion: string };
export function MissionContext() { return <Suspense><MissionBanner/></Suspense>; }
function MissionBanner() {
  const { user } = useAuth(); const owner = user?.id;
  const query = useSearchParams(); const id = query.get('mission_id'); const path = usePathname(); const router = useRouter();
  const [result, setResult] = useState<{ owner: string; id: string; data?: Context; error?: string }>();
  useEffect(() => {
    if (!owner || !id) return;
    let active = true;
    void api.request<Context>(`/journey/missions/${encodeURIComponent(id)}`).then(data => { if (active) setResult({ owner, id, data }); }).catch(() => { if (active) setResult({ owner, id, error: 'This mission is unavailable. Your personal draft remains available.' }); });
    return () => { active = false; };
  }, [owner, id]);
  if (!id || !owner) return null;
  const current = result && result.owner === owner && result.id === id ? result : undefined;
  const data = current?.data;
  function detach() {
    if (!window.confirm('Continue without linking new work to this mission? Existing assignment status and saved work are preserved.')) return;
    const next = new URLSearchParams(query.toString()); next.delete('mission_id');
    router.replace(path + (next.size ? `?${next}` : ''));
  }
  return <aside className="card p-4 mb-6 space-y-2" aria-label="Current practice mission">{data ? <><p className="font-semibold">{data.origin === 'ORGANIZATION_ASSIGNMENT' ? 'Organization assignment' : 'Personal practice mission'} · {data.title}</p><p className="whitespace-pre-wrap">{data.reason}</p><p className="text-sm">{data.origin === 'ORGANIZATION_ASSIGNMENT' ? 'Only accepted assignment completion status is shared. Your code and interview answers stay private.' : 'Completion follows your saved activity.'}</p></> : <p role="status">{current?.error || 'Loading mission context...'}</p>}<button type="button" className="underline" onClick={detach}>Continue as personal practice</button></aside>;
}
