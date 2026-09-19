'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { z } from 'zod';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useCodingAccess } from '../access';

const textMap = z.record(z.string().max(160), z.string().max(20000));
export const stateSchema = z.object({
  version: z.literal(1), drafts: textMap, notes: textMap,
  language: z.enum(['javascript', 'python', 'java', 'cpp']), role: z.string().min(1).max(160),
  bookmarks: z.array(z.string().max(160)).max(100), learned: z.array(z.string().max(160)).max(300),
  hints: z.record(z.number().int().min(0).max(10)), assisted: z.array(z.string().max(160)).max(100),
  attempts: z.array(z.object({ id: z.string().max(160), challengeId: z.string().max(160), at: z.string().datetime(), passed: z.number().int().min(0).max(30), total: z.number().int().min(1).max(30), assisted: z.boolean(), languageIssue: z.boolean().default(false), code: z.string().max(20000) })).max(100),
  projectSteps: z.array(z.string().max(160)).max(30), incidentActions: z.array(z.number().int().min(0).max(100)).max(100),
}).strict().superRefine((value, ctx) => {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 2_000_000 || Object.keys(value.drafts).length > 300 || Object.keys(value.notes).length > 300 || Object.keys(value.hints).length > 300) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Workspace limit reached. Download your work before reducing large notes.' });
  if (value.attempts.some(a => a.passed > a.total) || new Set(value.attempts.map(a => a.id)).size !== value.attempts.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid or duplicate practice attempts.' });
});
export type LocalState = z.infer<typeof stateSchema>;
export const freshState = (): LocalState => ({ version: 1, drafts: {}, notes: {}, language: 'javascript', role: 'GENERAL_SWE', bookmarks: [], learned: [], hints: {}, assisted: [], attempts: [], projectSteps: [], incidentActions: [] });
export const STORAGE_KEY = 'codeforge.workspace.v1'; // export/import identification only; never read implicitly
export function decodeState(raw: string | null) { return raw ? stateSchema.parse(JSON.parse(raw)) : freshState(); }
type Store = { state: LocalState; ready: boolean; warning: string; sync: boolean; update: (fn: (state: LocalState) => LocalState) => void; replace: (state: LocalState) => void; reload: () => void; save: () => Promise<void>; download: () => void };
const Context = createContext<Store | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { access } = useCodingAccess();
  const sync = access?.server_sync === true;
  const accessReady = !!access;
  const [state, setState] = useState(freshState);
  const [ready, setReady] = useState(false);
  const [warning, setWarning] = useState('Loading your workspace…');
  const [loadVersion, setLoadVersion] = useState(0);
  const current = useRef(state), revision = useRef(0), edits = useRef(0), dirty = useRef(false), busy = useRef(false), alive = useRef(false), conflict = useRef(false), epoch = useRef(0);
  const recoveryLoaded = useRef(false), loaded = useRef(false), replaceOnLoad = useRef(false);
  const key = `pv_coding_workspace_v1:${encodeURIComponent(user?.id || '')}`;
  const owner = user?.id;
  const cache = useCallback(() => {
    try { sessionStorage.setItem(key, JSON.stringify({ revision: revision.current, dirty: dirty.current, state: current.current })); return true; }
    catch { setWarning('Browser recovery storage is unavailable. Download your work before leaving.'); return false; }
  }, [key]);
  useEffect(() => {
    if (!owner || !accessReady) return;
    epoch.current++; busy.current = false; loaded.current = false;
    let active = true; alive.current = true;
    const replaceLocal = replaceOnLoad.current;
    const load = async () => {
      try {
        if (!recoveryLoaded.current) {
          try {
            const raw = sessionStorage.getItem(key);
            if (raw) {
              const cached = z.object({ revision: z.number().int().nonnegative(), dirty: z.boolean(), state: stateSchema }).parse(JSON.parse(raw));
              current.current = cached.state; revision.current = cached.revision; dirty.current = cached.dirty;
            }
          } catch { /* Server state remains recoverable. */ }
          recoveryLoaded.current = true;
        }
        // Keep the original revision and dirty marker even if loading fails.
        // A retry must reconcile local edits instead of silently discarding them.
        const remote = sync ? z.object({ revision: z.number().int().nonnegative(), state: stateSchema }).parse(
          await api.request('/coding/workspace', { retries: 0 })
        ) : { revision: revision.current, state: current.current };
        if (!active) return;
        const keepLocal = dirty.current && !replaceLocal;
        conflict.current = !!(sync && keepLocal && revision.current !== remote.revision);
        if (!conflict.current) revision.current = remote.revision;
        dirty.current = keepLocal;
        if (!keepLocal) current.current = remote.state;
        replaceOnLoad.current = false; loaded.current = true;
        setState(current.current); setReady(true);
        // Persist an accepted replacement immediately, so a refresh cannot
        // resurrect the dirty copy the student explicitly chose to replace.
        if (cache()) setWarning(conflict.current ? 'Another device has newer work. Download this local copy, then load the server copy.' : sync ? (dirty.current ? 'Recovered unsynced edits. Sync will retry.' : 'Saved work syncs to your PrepVista account.') : 'This workspace is saved in this tab only.');
      } catch { if (active) { replaceOnLoad.current = false; setWarning('Could not load server work. Retry before editing; your stored work is preserved.'); setReady(false); } }
    };
    void load();
    return () => { active = false; alive.current = false; };
  }, [owner, sync, key, loadVersion, accessReady, cache]);

  async function save() {
    if (!owner || !alive.current || !loaded.current || !sync || !dirty.current || busy.current || conflict.current) return;
    busy.current = true;
    const generation = edits.current;
    const requestEpoch = epoch.current;
    try {
      const result = await api.request<{ revision: number }>('/coding/workspace', { method: 'PUT', body: { expected_owner_id: owner, revision: revision.current, state: current.current }, retries: 0 });
      if (!alive.current || epoch.current !== requestEpoch) return;
      revision.current = result.revision;
      dirty.current = edits.current !== generation;
      if (cache()) setWarning(dirty.current ? 'Saving recent edits…' : 'Saved to your PrepVista account.');
    } catch (error) {
      if (!alive.current || epoch.current !== requestEpoch) return;
      conflict.current = (error as { status?: number }).status === 409;
      setWarning(conflict.current ? 'Another device has newer work. Download this local copy, then load the server copy.' : 'Not synced. Keep this tab open or download your work; sync will retry.');
    } finally { if (epoch.current === requestEpoch) busy.current = false; }
  }
  const saveRef = useRef(save);
  useEffect(() => { saveRef.current = save; });
  useEffect(() => { const timer = setInterval(() => { void saveRef.current(); }, 5000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  function replace(next: LocalState) {
    if (!ready) return;
    try { const valid = stateSchema.parse(next); current.current = valid; edits.current++; dirty.current = true; setState(valid); if (cache() && sync && !conflict.current) setWarning('Saving recent edits…'); }
    catch (error) { setWarning(error instanceof Error ? error.message : 'Workspace limit reached. Download your work.'); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(current.current, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'prepvista-coding-workspace.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function reload(replaceLocal: boolean) {
    if (busy.current) { setWarning('A save is still running. Wait for its result before loading another copy.'); return; }
    if (replaceLocal && dirty.current && !window.confirm('Replace unsynced edits with the server copy? Download your workspace first to keep those edits.')) return;
    replaceOnLoad.current = replaceLocal; loaded.current = false; setReady(false); setLoadVersion(value => value + 1);
  }
  const value: Store = { state, ready, warning, sync, replace, update: fn => replace(fn(current.current)), save, download, reload: () => reload(true) };
  return <Context.Provider value={value}><div className="mb-5 rounded-xl border border-border p-3 text-sm"><p role="status">{warning}</p><div className="mt-2 flex flex-wrap gap-3"><button type="button" className="underline" onClick={download}>Download workspace</button>{sync && <><button type="button" className="underline" disabled={!ready} onClick={() => { void save(); }}>Retry sync</button>{!ready && <button type="button" className="underline" onClick={() => reload(false)}>Retry workspace load</button>}<button type="button" className="underline" onClick={value.reload}>Load server copy</button></>}</div></div>{ready ? children : <p role="status">Waiting for your workspace. Retry loading to recover your saved edits.</p>}</Context.Provider>;
}
export function useWorkspace() { const value = useContext(Context); if (!value) throw new Error('Workspace provider missing'); return value; }
