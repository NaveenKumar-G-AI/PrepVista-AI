'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useCodingAccess } from '@/modules/coding/access';
import { freshState, stateSchema, useWorkspace, type LocalState } from '@/modules/coding/lib/state';

type Preview = { id: string; report: { added: number; conflicts: number; duplicate_attempts: number }; policy: string };
type Artifact = { id: string; challenge_id: string; language: string; created_at: string };
export default function Settings() {
  const workspace = useWorkspace();
  const { user } = useAuth();
  const { access } = useCodingAccess();
  const [incoming, setIncoming] = useState<LocalState | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  useEffect(() => {
    if (!workspace.sync) return;
    let active = true;
    void api.request<Artifact[]>('/coding/artifacts').then(value => { if (active) setArtifacts(value); }).catch(() => { if (active) setMessage('Saved artifacts could not be loaded. Your drafts are preserved.'); });
    return () => { active = false; };
  }, [workspace.sync, user?.id]);
  function choose(raw: string) {
    const value = stateSchema.parse(JSON.parse(raw));
    setIncoming(value); setSelected([]); setPreview(null); setConfirmed(false); setMessage('Select the items that belong to you. The source file is preserved.');
  }
  const items = incoming ? [
    ...Object.keys(incoming.drafts).map(key => ({ id: `draft:${key}`, label: `Draft: ${key}` })),
    ...Object.keys(incoming.notes).map(key => ({ id: `note:${key}`, label: `Note: ${key}` })),
    ...incoming.attempts.map(a => ({ id: `attempt:${a.id}`, label: `Practice: ${a.challengeId} (${a.at})` })),
    { id: 'progress', label: 'Bookmarks, learned topics, assistance flags, hints and project progress' },
  ] : [];
  async function makePreview() {
    if (!incoming || !user || busy) return;
    setBusy(true); setMessage('Preparing import preview...');
    try {
      const chosen = freshState();
      chosen.drafts = Object.fromEntries(Object.entries(incoming.drafts).filter(([key]) => selected.includes(`draft:${key}`)));
      chosen.notes = Object.fromEntries(Object.entries(incoming.notes).filter(([key]) => selected.includes(`note:${key}`)));
      chosen.attempts = incoming.attempts.filter(a => selected.includes(`attempt:${a.id}`));
      // Preserve known assistance even when progress was not selected.
      chosen.assisted = incoming.assisted.filter(id => chosen.attempts.some(a => a.challengeId === id) || Object.keys(chosen.drafts).some(key => key.startsWith(`${id}:`)));
      if (selected.includes('progress')) for (const key of ['bookmarks', 'learned', 'assisted', 'hints', 'projectSteps', 'incidentActions'] as const) Object.assign(chosen, { [key]: incoming[key] });
      const result = await api.request<Preview>('/coding/imports/preview', { method: 'POST', body: { expected_owner_id: user.id, state: chosen } });
      setPreview(result); setConfirmed(false); setMessage('Review the counts before importing. Existing server records win conflicts.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Import preview failed. Select fewer items and retry.'); }
    finally { setBusy(false); }
  }
  async function commit() {
    if (!preview || !confirmed || !user || busy) return;
    setBusy(true);
    try {
      await api.request(`/coding/imports/${preview.id}/commit`, { method: 'POST', body: { expected_owner_id: user.id, ownership_confirmed: true } });
      setMessage('Import saved. Download any unsynced local edits before loading the server copy above.'); setIncoming(null); setPreview(null);
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Import could not finish. Your original file is preserved.'); }
    finally { setBusy(false); }
  }
  return <div className="space-y-6"><h1 className="text-3xl font-semibold">Coding settings and saved work</h1><section className="card p-5 space-y-4"><h2 className="text-xl font-semibold">Practice preferences</h2><label className="block">Target role<input className="input-field mt-2" maxLength={160} value={workspace.state.role} onChange={e => workspace.update(s => ({ ...s, role: e.target.value || 'GENERAL_SWE' }))} /></label><label className="block">Preferred language<select className="input-field mt-2" value={workspace.state.language} onChange={e => workspace.update(s => ({ ...s, language: e.target.value as LocalState['language'] }))}>{['javascript', 'python', 'java', 'cpp'].map(lang => <option key={lang}>{lang}</option>)}</select></label><p>Execution checks currently support JavaScript. Other languages support editing and applicable learning activities.</p><button className="btn-secondary" onClick={workspace.download}>Export workspace</button><p><a className="underline" href="/coding-assets/runner-v1.NOTICES.txt" target="_blank" rel="noreferrer">Coding runner package notices</a></p></section><section className="card p-5 space-y-4"><h2 className="text-xl font-semibold">Import guest practice</h2><p>A shared browser or export can contain someone else&apos;s work. Choose only your own items. Imported results remain browser-reported history.</p>{access?.guest_import && workspace.sync ? <><label className="block">Choose an original CodeForge or PrepVista workspace export<input type="file" accept="application/json,.json" className="block mt-2" disabled={busy} onChange={async e => { const file = e.target.files?.[0]; if (!file) return; try { if (file.size > 2_000_000) throw new Error('This export exceeds the 2 MB import limit.'); choose(await file.text()); } catch (error) { setMessage(error instanceof Error ? error.message : 'Invalid workspace export.'); } e.target.value = ''; }} /></label>{incoming && <><fieldset className="max-h-72 overflow-auto space-y-2"><legend>Select items to import</legend>{items.map(item => <label className="flex gap-2" key={item.id}><input type="checkbox" checked={selected.includes(item.id)} disabled={busy} onChange={e => { setSelected(ids => e.target.checked ? [...ids, item.id] : ids.filter(id => id !== item.id)); setPreview(null); }} />{item.label}</label>)}</fieldset><button className="btn-secondary" disabled={busy || !selected.length} onClick={() => void makePreview()}>Preview selected items</button></>}{preview && <div className="space-y-3"><p>{preview.report.added} additions · {preview.report.conflicts} conflicts preserved on the server · {preview.report.duplicate_attempts} duplicate attempts skipped.</p><p>{preview.policy}</p><label className="flex gap-2"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I selected my own work and want to import it into this account.</label><button className="btn-primary" disabled={busy || !confirmed} onClick={() => void commit()}>Confirm import</button></div>}</> : <p>Guest import is not enabled for this account. You can keep or export your local work.</p>}<p role="status">{message}</p></section><section className="card p-5 space-y-3"><h2 className="text-xl font-semibold">Saved artifacts</h2><p>The latest 100 saved versions are listed here.</p>{artifacts.map(a => <Link className="block underline" key={a.id} href={`/coding/artifacts/${a.id}`}>{a.challenge_id} · {a.language} · {new Date(a.created_at).toLocaleString()}</Link>)}{!artifacts.length && <p>Save an artifact from a practice or project workspace to use it in an interview.</p>}</section></div>;
}
