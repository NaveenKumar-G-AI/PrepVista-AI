'use client';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
type Options = { seasons: { id: string; name: string }[]; students: { id: string; name: string }[]; more_students: boolean; task_kinds: { id: string; title: string }[] };
type StaffRow = { id: string; student_name: string; title: string; status: string; due_date: string | null };
export default function AssignmentsPage() {
  const { user } = useAuth();
  return user ? <AssignmentManager key={user.id} owner={user.id}/> : <p role="status">Checking staff access...</p>;
}
function AssignmentManager({ owner }: { owner: string }) {
  const [options, setOptions] = useState<Options>();
  const [list, setList] = useState<{ items: StaffRow[]; next_cursor: string | null }>();
  const [cursor, setCursor] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [students, setStudents] = useState<string[]>([]);
  const [studentNames, setStudentNames] = useState<Record<string, string>>({});
  const [season, setSeason] = useState(''); const [kind, setKind] = useState('CODING_PRACTICE');
  const [title, setTitle] = useState(''); const [instructions, setInstructions] = useState(''); const [due, setDue] = useState('');
  const [review, setReview] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const alive = useRef(false); const pending = useRef<{ key: string; id: string } | undefined>(undefined);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    void api.request<Options>(`/journey/assignments/options?q=${encodeURIComponent(query)}`).then(value => { if (active) setOptions(value); }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Assignment access is unavailable.'); });
    return () => { active = false; };
  }, [query]);
  useEffect(() => {
    let active = true;
    void api.request<{ items: StaffRow[]; next_cursor: string | null }>('/journey/assignments/staff' + (cursor ? `?before=${cursor}` : '')).then(value => { if (active) setList(value); }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Assignment list is unavailable.'); });
    return () => { active = false; };
  }, [cursor, refresh]);
  async function create() {
    if (busy) return;
    const value = { expected_owner_id: owner, season_id: season, student_ids: students, task_kind: kind, title, instructions, due_at: due ? new Date(due).toISOString() : null };
    const key = JSON.stringify(value); if (pending.current?.key !== key) pending.current = { key, id: crypto.randomUUID() };
    setBusy(true); setError('');
    try {
      await api.request('/journey/assignments', { method: 'POST', retries: 0, body: { ...value, request_id: pending.current.id } });
      if (alive.current) { setNotice(`Assignment created for ${students.length} selected students. Each student chooses whether to accept status sharing.`); setReview(false); setStudents([]); setRefresh(n => n + 1); }
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Assignment could not be created. Retry keeps the same request ID.'); }
    finally { if (alive.current) setBusy(false); }
  }
  async function cancel(id: string) {
    if (busy || !window.confirm('Cancel this assignment? Student work will remain available.')) return;
    setBusy(true);
    try { await api.request(`/journey/assignments/${id}/cancel`, { method: 'POST', body: { expected_owner_id: owner } }); if (alive.current) setRefresh(n => n + 1); }
    catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Cancellation failed.'); }
    finally { if (alive.current) setBusy(false); }
  }
  return <section className="card p-6 space-y-5"><h1 className="text-2xl font-semibold">Practice assignments</h1><p>Assign work to active pilot students. Students explicitly accept completion-status sharing. This gives you no access to their private code, transcripts or personal readiness. Existing interview allowances apply.</p>{error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}{options && <form className="space-y-4" onSubmit={e => { e.preventDefault(); setReview(true); setNotice(''); }}><fieldset disabled={busy || review} className="space-y-4"><label className="block">Placement season<select required className="input block w-full" value={season} onChange={e => setSeason(e.target.value)}><option value="">Choose an active season</option>{options.seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label className="block">Activity<select className="input block w-full" value={kind} onChange={e => setKind(e.target.value)}>{options.task_kinds.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select></label><label className="block">Assignment title<input required minLength={3} maxLength={160} className="input block w-full" value={title} onChange={e => setTitle(e.target.value)}/></label><label className="block">Instructions<textarea required minLength={3} maxLength={3000} rows={5} className="input block w-full" value={instructions} onChange={e => setInstructions(e.target.value)}/></label><label className="block">Due date (optional)<input type="datetime-local" className="input block" value={due} onChange={e => setDue(e.target.value)}/></label><p>The due date is guidance; it does not delete work or block a late submission.</p><div><label className="block">Find active pilot students<input className="input" value={search} maxLength={100} onChange={e => setSearch(e.target.value)}/></label><button type="button" className="underline" onClick={() => setQuery(search)}>Search students</button></div><fieldset className="max-h-64 overflow-y-auto space-y-2"><legend>Select up to 50 students ({students.length} selected)</legend>{options.students.map(s => <label key={s.id} className="flex gap-3"><input type="checkbox" checked={students.includes(s.id)} disabled={!students.includes(s.id) && students.length >= 50} onChange={e => { setStudents(values => e.target.checked ? [...values, s.id] : values.filter(id => id !== s.id)); setStudentNames(names => ({ ...names, [s.id]: s.name })); }}/>{s.name}</label>)}</fieldset>{options.more_students && <p>More students match. Narrow the search to find them.</p>}<button className="btn-primary" type="submit" disabled={!students.length}>Review assignment</button></fieldset>{review && <section className="rounded-xl border p-4 space-y-3"><h2 className="text-xl">Review before assigning</h2><p>{title} · {students.length} selected students · {options.task_kinds.find(t => t.id === kind)?.title}</p><p>{options.seasons.find(s => s.id === season)?.name}{due ? ` ? Due ${new Date(due).toLocaleString()}` : ' ? No due date'}</p><ul className="list-disc pl-5">{students.map(id => <li key={id}>{studentNames[id] || id}</li>)}</ul><p className="whitespace-pre-wrap">{instructions}</p><p>Students may decline or withdraw. Completion records activity, not a verified grade. This does not create sponsored credits.</p><button className="btn-primary" type="button" disabled={busy} onClick={() => void create()}>Confirm assignment</button><button className="underline ml-4" type="button" disabled={busy} onClick={() => setReview(false)}>Edit selection</button></section>}</form>}<h2 className="text-xl font-semibold">Assignment status</h2>{list?.items.length === 0 && <p>No assignments on this page.</p>}{list?.items.map(row => <article key={row.id} className="rounded-xl border p-4 space-y-2"><h3 className="font-semibold">{row.title}</h3><p>{row.student_name} · {row.status.toLowerCase().replaceAll('_', ' ')}</p>{row.due_date && <p>Due {new Date(row.due_date).toLocaleString()}</p>}{!['COMPLETED', 'CANCELLED', 'WITHDRAWN'].includes(row.status) && <button className="underline" disabled={busy} onClick={() => void cancel(row.id)}>Cancel assignment</button>}</article>)}<div className="flex gap-4">{cursor && <button className="underline" onClick={() => setCursor(null)}>Newest assignments</button>}{list?.next_cursor && <button className="underline" onClick={() => setCursor(list.next_cursor)}>Next page</button>}<button className="underline" onClick={() => setRefresh(n => n + 1)}>Refresh status</button></div></section>;
}
