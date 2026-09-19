'use client';
import Link from 'next/link';
import { challenges } from '@/modules/coding/lib/challenges';
import { useWorkspace } from '@/modules/coding/lib/state';
export default function PracticeHistory() {
  const { state, download } = useWorkspace();
  const passedProblems = new Set(state.attempts.filter(a => a.passed === a.total).map(a => a.challengeId));
  return <section className="card p-6 space-y-4"><h1 className="text-2xl font-semibold">Your practice history</h1><p>{state.attempts.length} recent attempts · {passedProblems.size} problems with passing browser checks.</p><p>These results are browser-reported practice. Unrecorded assistance remains unknown. A check score is not a mastery or readiness score.</p><button className="btn-secondary" onClick={download}>Export practice history and drafts</button><Link className="underline ml-4" href="/readiness">Open your readiness list</Link>{state.attempts.length ? [...state.attempts].reverse().map(attempt => <details className="rounded-xl border p-4" key={attempt.id}><summary>{challenges.find(c => c.challengeId === attempt.challengeId)?.title || attempt.challengeId} · {attempt.passed}/{attempt.total} checks · {attempt.assisted ? 'Assistance recorded' : 'Assistance unknown'} · {new Date(attempt.at).toLocaleString()}</summary>{attempt.languageIssue && <p>The runner reported a language or syntax issue.</p>}<pre className="overflow-auto whitespace-pre-wrap mt-3">{attempt.code}</pre></details>) : <p>No practice attempts have been saved yet.</p>}<p className="text-sm">The workspace retains the most recent 100 attempts. Saved artifacts are stored separately and remain available through account recovery exports.</p></section>;
}
