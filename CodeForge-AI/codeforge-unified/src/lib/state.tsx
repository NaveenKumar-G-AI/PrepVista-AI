'use client';
import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import { z } from 'zod';
const textMap = z.record(z.string().max(20000));
export const stateSchema = z.object({
  version: z.literal(1), drafts: textMap, notes: textMap,
  language: z.enum(['javascript', 'python', 'java', 'cpp']), role: z.string().max(100),
  bookmarks: z.array(z.string()).max(100), learned: z.array(z.string()).max(300),
  hints: z.record(z.number().int().min(0).max(10)), assisted: z.array(z.string()).max(100),
  attempts: z.array(z.object({ id: z.string(), challengeId: z.string(), at: z.string().datetime(), passed: z.number().int().min(0).max(30), total: z.number().int().min(1).max(30), assisted: z.boolean(), languageIssue: z.boolean().default(false), code: z.string().max(20000) })).max(100),
  projectSteps: z.array(z.string()).max(30), incidentActions: z.array(z.number().int().min(0).max(100)).max(100),
});
export type LocalState = z.infer<typeof stateSchema>;
export const freshState = (): LocalState => ({ version: 1, drafts: {}, notes: {}, language: 'javascript', role: 'GENERAL_SWE', bookmarks: [], learned: [], hints: {}, assisted: [], attempts: [], projectSteps: [], incidentActions: [] });
export const STORAGE_KEY = 'codeforge.workspace.v1';
export function decodeState(raw: string | null) { return raw ? stateSchema.parse(JSON.parse(raw)) : freshState(); }
type Store = { state: LocalState; ready: boolean; warning: string; update: (fn: (s: LocalState) => LocalState) => void; replace: (s: LocalState) => void };
const Context = createContext<Store | null>(null);
const serverSnapshot = { state: freshState(), ready: false, warning: '' };
let snapshot = serverSnapshot;
const listeners = new Set<() => void>();
function getSnapshot() {
  if (!snapshot.ready && typeof window !== 'undefined') {
    try { snapshot = { state: decodeState(localStorage.getItem(STORAGE_KEY)), ready: true, warning: '' }; }
    catch { snapshot = { state: freshState(), ready: true, warning: 'Saved data could not be read. A fresh workspace is open; export a backup regularly.' }; }
  }
  return snapshot;
}
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function replace(value: LocalState) {
  const valid = stateSchema.parse(value); let warning = '';
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(valid)); }
  catch { warning = 'Browser storage is full or unavailable. Keep this tab open and export your work.'; }
  snapshot = { state: valid, ready: true, warning }; listeners.forEach(listener => listener());
}
function update(fn: (s: LocalState) => LocalState) { replace(fn(getSnapshot().state)); }
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const value = useSyncExternalStore(subscribe, getSnapshot, () => serverSnapshot);
  return <Context.Provider value={{ ...value, update, replace }}>{children}</Context.Provider>;
}
export function useWorkspace() { const value = useContext(Context); if (!value) throw new Error('Workspace provider missing'); return value; }
