'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import type { Challenge } from './engines/challenges/domain/types';
import type { CheckResult } from './runner/sandbox';
import { decodeDraft, draftKey, type CodingDraft } from './drafts';
import { useWorkspace } from './lib/state';
import { ArtifactActions } from './artifact-actions';
import type { SavedArtifact } from './artifact-view';
import { Mentor } from './components/mentor';

type Language = 'javascript' | 'python' | 'java' | 'cpp';
export function CodingWorkspace({ challenge }: { challenge: Challenge }) {
  const { state, update } = useWorkspace();
  return <><label className="block mb-4">Solution language<select className="input ml-3" value={state.language} onChange={e => update(s => ({ ...s, language: e.target.value as Language }))}>{['javascript', 'python', 'java', 'cpp'].map(lang => <option key={lang}>{lang}</option>)}</select></label><LanguageWorkspace key={`${challenge.challengeId}:${state.language}`} challenge={challenge} language={state.language} /></>;
}
export function LanguageWorkspace({ challenge, language, artifact }: { challenge: Challenge; language: Language; artifact?: SavedArtifact }) {
  const { user } = useAuth();
  const shared = useWorkspace();
  const scope = artifact ? `artifact:${artifact.id}` : challenge.challengeId;
  const draftId = `${scope}:${language}`;
  const [draft, setDraft] = useState<CodingDraft>({ code: shared.state.drafts[draftId] ?? artifact?.content.code ?? challenge.starterCode[language] ?? '', explanation: shared.state.notes[scope] ?? artifact?.content.explanation ?? '', assisted: shared.state.assisted.includes(scope) || artifact?.content.assistance === 'KNOWN_ASSISTED' });
  const [ready, setReady] = useState(false);
  const [storageStatus, setStorageStatus] = useState('Loading this tab’s draft…');
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [hints, setHints] = useState(false);
  const [solution, setSolution] = useState(false);
  const [run, setRun] = useState<{ code: string; results: CheckResult[] }>();
  const worker = useRef<Worker | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profileId = user?.id;
  useEffect(() => {
    if (!profileId) return;
    // Recovery is deferred until after hydration; account gate remounts the
    // component on identity change. No guest records are read.
    const recovery = window.setTimeout(() => {
      try {
        const raw = artifact || shared.sync || language !== 'javascript' ? null : sessionStorage.getItem(draftKey(profileId, challenge.challengeId));
        const saved = decodeDraft(raw);
        if (saved) setDraft(saved);
        setStorageStatus(raw && !saved ? 'The saved draft could not be read. Download any recovered work before continuing.' : shared.sync ? 'Account sync is active. Check sync status above.' : 'Draft kept in this tab only.');
      } catch { setStorageStatus('Tab storage is unavailable. Download your work before leaving.'); }
      setReady(true);
    }, 0);
    return () => { window.clearTimeout(recovery); worker.current?.terminate(); if (timer.current) clearTimeout(timer.current); };
  }, [profileId, challenge.challengeId, shared.sync, language, artifact]);

  function edit(next: CodingDraft) {
    setDraft(next);
    shared.update(state => ({ ...state, drafts: { ...state.drafts, [draftId]: next.code }, notes: { ...state.notes, [scope]: next.explanation }, assisted: next.assisted ? [...new Set([...state.assisted, scope])].slice(-100) : state.assisted }));
    if (!profileId) return;
    try {
      if (!artifact && language === 'javascript') sessionStorage.setItem(draftKey(profileId, challenge.challengeId), JSON.stringify({ version: 1, ...next }));
      setStorageStatus(shared.sync ? 'Account sync is active. Check sync status above.' : 'Draft kept in this tab only.');
    } catch { setStorageStatus('Could not save in this tab. Download your work before leaving.'); }
  }
  function stop() {
    worker.current?.terminate(); worker.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null; setRunning(false);
  }
  function execute() {
    if (worker.current || !ready || language !== 'javascript') return;
    const code = draft.code;
    setError(''); setRun(undefined); setRunning(true);
    try {
      // Version changes when the runner protocol/limits change. Build recreates
      // this namespaced asset; no blob worker, host eval or credential messages.
      const instance = new Worker('/coding-assets/runner-v1.js');
      worker.current = instance;
      timer.current = setTimeout(() => { stop(); setError('The runner exceeded its time budget. Your draft is unchanged.'); }, 15000);
      instance.onmessage = (event: MessageEvent<{ results?: CheckResult[]; error?: string }>) => {
        if (worker.current !== instance) return;
        stop();
        if (event.data.error || !Array.isArray(event.data.results)) setError(event.data.error || 'The runner returned no result. Please retry.');
        else {
          setRun({ code, results: event.data.results });
          shared.update(state => ({ ...state, attempts: [...state.attempts, { id: crypto.randomUUID(), challengeId: challenge.challengeId, at: new Date().toISOString(), code, passed: event.data.results!.filter(r => r.passed).length, total: event.data.results!.length, assisted: draft.assisted, languageIssue: event.data.results!.every(r => r.status === 'Syntax error') }].slice(-100) }));
        }
      };
      instance.onerror = () => { if (worker.current === instance) { stop(); setError('The isolated runner could not start. Your draft is unchanged.'); } };
      instance.postMessage({ code, entry: challenge.evaluationMetadata.entryFunction, tests: [...challenge.publicTests, ...challenge.hiddenTests], comparison: challenge.evaluationMetadata.comparisonMode });
    } catch { stop(); setError('This browser could not start the isolated runner. Download your draft to keep it.'); }
  }
  function download() {
    const blob = new Blob([JSON.stringify({ schema_version: 1, challenge_id: challenge.challengeId, challenge_version: challenge.version, language, ...draft, result_authority: 'CLIENT_REPORTED', assistance: draft.assisted ? 'KNOWN_ASSISTED' : 'UNKNOWN', practice_result: run && run.code === draft.code ? run.results : null }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `prepvista-${challenge.challengeId}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const stale = run && run.code !== draft.code;
  return <div className="space-y-6">
    <Link href="/coding" className="text-sm underline">All coding problems</Link>
    <div><p className="mb-2 text-sm text-secondary">{language} · {language === 'javascript' ? 'Practice checks' : 'Editing and explanation; execution unavailable'}</p><h1 className="text-3xl font-semibold">{challenge.title}</h1></div>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <section className="card space-y-5 p-5 min-w-0"><h2 className="text-xl font-semibold">The problem</h2><p className="whitespace-pre-wrap">{challenge.description}</p>
        <ul className="list-disc pl-5 space-y-2 text-sm text-secondary">{challenge.constraints.map((constraint, index) => <li key={index}>{constraint}</li>)}</ul>
        {challenge.examples.map((example, index) => <div key={index} className="rounded-xl bg-hover p-3 text-sm"><p className="font-medium">Example {index + 1}</p><pre className="mt-2 whitespace-pre-wrap break-all">Input: {example.input}{'\n'}Output: {example.output}</pre></div>)}
        <button disabled={!ready} className="btn-secondary min-h-11" onClick={() => { setHints(true); edit({ ...draft, assisted: true }); }}>Show a hint</button>
        {hints && <ul className="list-disc pl-5 space-y-2">{challenge.hints.map((hint, index) => <li key={index}>{hint}</li>)}</ul>}
        <button className="btn-secondary min-h-11" onClick={() => { setSolution(true); edit({ ...draft, assisted: true }); }}>Review reference approach</button>{solution && <div className="space-y-3"><p>{challenge.solutionMetadata.approachSummary}</p><p>{challenge.solutionMetadata.timeComplexity} · {challenge.solutionMetadata.spaceComplexity}</p><pre className="overflow-auto whitespace-pre-wrap">{challenge.solutionMetadata.referenceSolution[language] || 'No reference implementation is available for this language.'}</pre></div>}
        <p className="text-sm text-secondary">All checks are browser-visible practice material. Passing them demonstrates the tested outputs, not authorship or complete correctness.</p>
      </section>
      <section className="card space-y-4 p-5 min-w-0"><label className="block space-y-2"><span className="text-lg font-semibold">Your {language === 'javascript' ? 'JavaScript' : language} solution</span><textarea spellCheck={false} autoCapitalize="off" autoCorrect="off" disabled={!ready} maxLength={20000} className="input w-full min-h-80 font-mono text-sm leading-6" value={draft.code} onChange={event => edit({ ...draft, code: event.target.value })} /></label>
        <p className="text-sm text-secondary" role="status">{storageStatus} {shared.sync ? 'Only the local recovery copy is cleared on sign-out.' : 'Cleared on sign-out.'}</p>
        <div className="flex flex-wrap gap-3"><button disabled={!ready || running || !draft.code.trim() || language !== 'javascript'} className="btn-primary min-h-11" onClick={execute}>{running ? 'Running checks…' : 'Run practice checks'}</button>{running && <button className="btn-secondary min-h-11" onClick={() => { stop(); setError('Run cancelled. Your draft is unchanged.'); }}>Cancel run</button>}<button disabled={!ready} className="btn-secondary min-h-11" onClick={download}>Download work</button></div>
        {error && <p role="alert">{error}</p>}
        {run && <div className="space-y-3" aria-live="polite"><h2 className="text-lg font-semibold">{run.results.filter(result => result.passed).length} of {run.results.length} practice checks passed</h2>{stale && <p>These results are for an earlier draft. Run your current code again.</p>}<p className="text-sm text-secondary">Browser-reported result · Readiness unchanged</p><ul className="space-y-2">{run.results.map((result, index) => <li key={`${result.id}-${index}`} className="rounded-xl bg-hover p-3"><details><summary className="cursor-pointer text-sm">Check {index + 1}: {result.status}</summary><p className="mt-2 text-sm">{result.note}</p><pre className="mt-2 whitespace-pre-wrap break-all text-sm">Expected: {JSON.stringify(result.expected)}{'\n'}Returned: {JSON.stringify(result.actual) ?? 'No result'}</pre>{result.error && <p className="mt-2 text-sm">{result.error}</p>}</details></li>)}</ul></div>}
      </section>
    </div>
    <section className="card p-5 space-y-4"><h2 className="text-xl font-semibold">Explain your decision</h2><p>What approach did you choose, which edge case mattered, and how did you check the result?</p><label className="block"><span className="sr-only">Your explanation</span><textarea disabled={!ready} className="input w-full min-h-32" maxLength={3000} value={draft.explanation} onChange={event => edit({ ...draft, explanation: event.target.value })} /></label><p className="text-sm text-secondary">Download includes your explanation. It is not automatically sent to an interviewer.</p><Link className="btn-secondary inline-flex min-h-11" href="/interview/practice">Continue to interview practice</Link></section>
    <ArtifactActions parentArtifactId={artifact?.id} challengeVersion={challenge.version} language={language} challengeId={challenge.challengeId} code={draft.code} explanation={draft.explanation} assisted={draft.assisted} passed={run && !stale ? run.results.filter(r => r.passed).length : undefined} total={run && !stale ? run.results.length : undefined}/>
    <div className="coding-surface"><Mentor language={language} code={draft.code} context={`${challenge.description}\nMy explanation: ${draft.explanation}`} onAssist={() => edit({ ...draft, assisted: true })}/></div>
  </div>;
}
