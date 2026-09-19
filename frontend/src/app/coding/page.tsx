'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { challenges } from '@/modules/coding/lib/challenges';
import { useWorkspace } from '@/modules/coding/lib/state';
import { RolePath } from '@/modules/coding/components/role-path';

export default function Page() { return <Suspense fallback={<p>Loading coding catalog...</p>}><CodingCatalog /></Suspense>; }
function CodingCatalog() {
  const [search, setSearch] = useState('');
  const { state, update, sync } = useWorkspace();
  const [bookmarked, setBookmarked] = useState(false);
  const [difficulty, setDifficulty] = useState('all');
  const missionId = useSearchParams().get('mission_id');
  const missionQuery = missionId ? `?mission_id=${encodeURIComponent(missionId)}` : '';
  const shown = challenges.filter(challenge => `${challenge.title} ${challenge.skill}`.toLowerCase().includes(search.toLowerCase()) && (!bookmarked || state.bookmarks.includes(challenge.challengeId)) && (difficulty === 'all' || challenge.difficultyLabel === difficulty));
  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="mb-2 text-sm text-secondary">PrepVista · Coding practice</p><h1 className="text-3xl font-semibold">Choose a problem. Explain your approach.</h1></div><Link href="/interview/practice" className="btn-secondary inline-flex">Interview practice</Link></div>
    <p className="max-w-3xl text-secondary">Write code, run supported JavaScript practice checks, then explain your decisions. Save an artifact to connect practice evidence with your interview. Coding practice consumes no interview credits.</p>
    <div className="coding-surface"><RolePath /></div>
    <label className="block max-w-lg space-y-2"><span className="text-sm font-medium">Search problems or skills</span><input className="input w-full min-h-11" value={search} onChange={event => setSearch(event.target.value)} placeholder="Try arrays, debugging or search" /></label>
    <p className="text-sm text-secondary" role="status">{shown.length} problems · JavaScript execution</p>
    <div className="flex flex-wrap gap-4"><label className="flex gap-2 items-center"><input type="checkbox" checked={bookmarked} onChange={e => setBookmarked(e.target.checked)} />Bookmarked problems</label><label>Difficulty<select className="input ml-2" value={difficulty} onChange={e => setDifficulty(e.target.value)}><option value="all">All levels</option>{[...new Set(challenges.map(c => c.difficultyLabel))].map(level => <option key={level}>{level}</option>)}</select></label></div>
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{shown.map(challenge => <article key={challenge.challengeId} className="card flex flex-col gap-4 p-5">
      <div className="flex justify-between gap-3 text-sm text-secondary"><span className="capitalize">{challenge.difficultyLabel.toLowerCase()}</span><span>About {challenge.difficulty.expectedTimeMinutes} min</span></div>
      <h2 className="text-xl font-semibold"><Link className="hover:underline" href={`/coding/practice/${challenge.challengeId}${missionQuery}`}>{challenge.title}</Link></h2>
      <p className="flex-1 text-secondary">{challenge.learningObjective}</p>
      <button className="text-left underline" aria-label={`${state.bookmarks.includes(challenge.challengeId) ? 'Remove bookmark for' : 'Bookmark'} ${challenge.title}`} onClick={() => update(s => ({ ...s, bookmarks: s.bookmarks.includes(challenge.challengeId) ? s.bookmarks.filter(id => id !== challenge.challengeId) : [...s.bookmarks, challenge.challengeId] }))}>{state.bookmarks.includes(challenge.challengeId) ? 'Bookmarked' : 'Bookmark problem'}</button>
      <Link className="btn-secondary inline-flex justify-center min-h-11" href={`/coding/practice/${challenge.challengeId}${missionQuery}`}>Open problem<span className="sr-only">: {challenge.title}</span></Link>
    </article>)}</div>
    {!shown.length && <p>No matching problems. Try a different skill or title.</p>}
    <p className="text-sm text-secondary">{sync ? 'Saved drafts sync to your PrepVista account. Keep a download of unsynced edits before closing the tab.' : 'Drafts are kept only in this browser tab and cleared on sign-out. Download your work before closing the tab.'} Your existing CodeForge guest data stays in its original workspace.</p>
  </div>;
}
