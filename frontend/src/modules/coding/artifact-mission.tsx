'use client';
import { useArtifact, type SavedArtifact } from './artifact-view';
import { challenges } from './lib/challenges';
import { LanguageWorkspace } from './workspace';
import { useWorkspace } from './lib/state';
import { Editor } from './components/editor';
import { Mentor } from './components/mentor';
import { ArtifactActions } from './artifact-actions';

export function ArtifactMission({ id, mode }: { id: string; mode: 'repair' | 'explain' }) {
  const result = useArtifact(id);
  if (!result?.data) return <p role="status">{result?.error || 'Loading the saved implementation...'}</p>;
  const artifact = result.data;
  const challenge = challenges.find(c => c.challengeId === artifact.content.challenge_id && c.version === (artifact.content.challenge_version ?? 1));
  return <><section className="card p-5 mb-6 space-y-3"><h2 className="text-xl font-semibold">{mode === 'repair' ? 'Repair your saved implementation' : 'Explain your saved implementation'}</h2><p>Continue from this saved version. Your other drafts and the original artifact remain available. Save the new code and explanation to complete this mission.</p><p>A saved revision records your work. It does not prove that an earlier correctness gap has been resolved.</p><details><summary>Original saved code</summary><pre className="whitespace-pre-wrap break-all">{artifact.content.code}</pre></details></section>{challenge ? <LanguageWorkspace key={artifact.id} challenge={challenge} language={artifact.content.language} artifact={artifact}/> : <ArtifactScratchpad key={artifact.id} artifact={artifact}/>}</>;
}

function ArtifactScratchpad({ artifact }: { artifact: SavedArtifact }) {
  const { state, update } = useWorkspace();
  const scope = `artifact:${artifact.id}`;
  const code = state.drafts[`${scope}:${artifact.content.language}`] ?? artifact.content.code;
  const explanation = state.notes[scope] ?? artifact.content.explanation;
  const assisted = state.assisted.includes(scope) || artifact.content.assistance === 'KNOWN_ASSISTED';
  return <div className="coding-surface"><h1>Continue {artifact.content.challenge_id}</h1><Editor code={code} language={artifact.content.language} onChange={value => update(s => ({ ...s, drafts: { ...s.drafts, [`${scope}:${artifact.content.language}`]: value } }))} onReset={() => update(s => ({ ...s, drafts: { ...s.drafts, [`${scope}:${artifact.content.language}`]: artifact.content.code } }))}/><p>Practice execution is unavailable for this saved task version. Document your checks and their limits.</p><label className="field-label">Your explanation<textarea rows={8} maxLength={6000} value={explanation} onChange={e => update(s => ({ ...s, notes: { ...s.notes, [scope]: e.target.value } }))}/></label><ArtifactActions parentArtifactId={artifact.id} challengeId={artifact.content.challenge_id} challengeVersion={artifact.content.challenge_version ?? 1} language={artifact.content.language} code={code} explanation={explanation} assisted={assisted}/><Mentor code={code} language={artifact.content.language} context={explanation} onAssist={() => update(s => ({ ...s, assisted: [...new Set([...s.assisted, scope])].slice(-100) }))}/></div>;
}
