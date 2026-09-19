'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { AuthHeader } from '@/components/auth-header';
import { useAuth } from '@/lib/auth-context';

interface Story { id: string; title: string; story: Record<string, string> }
interface Progress { sessions: { id: string; date: string; mode: string; role: string; evidence_state: string; missions: { instruction: string }[] }[]; retries: { question_id: string; comparison: { message: string } }[]; note: string }
const fields = ['context', 'personal_responsibility', 'action', 'decision', 'result', 'evidence', 'learning'];

export default function InterviewPractice() {
  const { user, loading } = useAuth();
  if (loading) return <p className="p-6" role="status">Loading your account...</p>;
  if (!user) return <div className="p-6"><Link className="underline" href="/login">Sign in to interview practice</Link></div>;
  return <AccountPractice key={user.id} owner={user.id} />;
}
function AccountPractice({ owner }: { owner: string }) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({ title: '' });
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    Promise.all([api.request<Progress>('/interviews/practice/progress'), api.request<Story[]>('/interviews/practice/stories')])
      .then(([p, s]) => { setProgress(p); setStories(s); })
      .catch(error => setStatus(error instanceof Error ? error.message : 'Could not load practice history.'));
  }, []);
  async function save() {
    if (saving || !draft.title.trim()) return;
    setSaving(true);
    try {
      const result = await api.request<{ id: string }>('/interviews/practice/stories', { method: 'POST', body: { ...draft, expected_owner_id: owner } });
      setStories(old => [{ id: result.id, title: draft.title, story: draft }, ...old]);
      setDraft({ title: '' }); setStatus('Story saved.');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Could not save story.'); }
    finally { setSaving(false); }
  }
  async function remove(id: string) {
    try { await api.request(`/interviews/practice/stories/${id}`, { method: 'DELETE' }); setStories(old => old.filter(s => s.id !== id)); }
    catch (error) { setStatus(error instanceof Error ? error.message : 'Could not delete story.'); }
  }
  return <div className="min-h-screen surface-primary"><AuthHeader /><main className="max-w-3xl mx-auto p-5 space-y-6">
    <div><Link href="/dashboard" className="text-sm underline">Dashboard</Link><h1 className="text-2xl font-semibold mt-3">Your interview practice</h1></div>
    <p role="status">{status}</p>
    <section className="card p-5 space-y-3"><h2 className="text-lg font-semibold">Recent evidence and next steps</h2>
      {!progress && !status && <p>Loading practice history…</p>}
      {progress?.sessions.length === 0 && <p>Complete an interview to build your evidence history.</p>}
      {progress?.sessions.map(s => <div key={s.id} className="border-t border-border py-3"><Link className="font-medium underline" href={`/report/${s.id}`}>{s.role} · {s.mode.replaceAll('_', ' ')}</Link><p className="text-sm">{new Date(s.date).toLocaleDateString()} · {s.evidence_state.toLowerCase()}</p><p className="text-sm mt-2">{s.missions[0]?.instruction || 'Explore another interview area to collect more evidence.'}</p></div>)}
      <p className="text-sm text-secondary">{progress?.note}</p>
      <Link href="/interview/setup" className="btn-primary inline-block min-h-11">Start an interview</Link>
    </section>
    <section className="card p-5 space-y-3"><h2 className="text-lg font-semibold">Answer retries</h2>
      {progress?.retries.length === 0 && <p>No saved retries yet. Open a report to repair an answer.</p>}
      {progress?.retries.map((r, i) => <p key={i} className="text-sm">{r.comparison.message}</p>)}
    </section>
    <section className="card p-5 space-y-4"><h2 className="text-lg font-semibold">Your story bank</h2><p className="text-sm">Save real experiences as preparation notes. Include only results you can support.</p>
      <label className="block text-sm">Story title<input className="input w-full mt-2 min-h-11" maxLength={160} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label>
      <div className="grid gap-4 sm:grid-cols-2">{fields.map(field => <label key={field} className="block text-sm capitalize">{field.replaceAll('_', ' ')}<textarea className="input w-full mt-2 min-h-24" maxLength={1000} value={draft[field] || ''} onChange={e => setDraft({ ...draft, [field]: e.target.value })} /></label>)}</div>
      <button className="btn-primary min-h-11" disabled={saving || !draft.title.trim()} onClick={save}>{saving ? 'Saving…' : 'Save story'}</button>
      {stories.map(story => <details key={story.id} className="border-t border-border py-3"><summary className="cursor-pointer font-medium">{story.title}</summary><div className="space-y-2 py-3">{fields.map(field => story.story[field] && <p key={field} className="text-sm whitespace-pre-wrap"><strong className="capitalize">{field.replaceAll('_', ' ')}: </strong>{story.story[field]}</p>)}</div><button type="button" className="btn-secondary min-h-11" onClick={() => remove(story.id)}>Delete story</button></details>)}
    </section>
  </main></div>;
}
