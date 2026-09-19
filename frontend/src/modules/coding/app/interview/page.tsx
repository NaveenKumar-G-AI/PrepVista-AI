'use client';
import { useState } from 'react';
import { challenges } from '@/modules/coding/lib/challenges';
import { useWorkspace } from '@/modules/coding/lib/state';
import { PageHeading, ActionLink } from '@/modules/coding/components/ui';
import { Mentor } from '@/modules/coding/components/mentor';
const stages = [
  { title: 'Restate the problem', question: 'Explain the input, output, constraints, and assumptions in your own words.' },
  { title: 'Think through an approach', question: 'Which data structure would you choose? Explain why, and compare one alternative.' },
  { title: 'Test your reasoning', question: 'Walk through a normal case and an edge case. Where could your approach fail?' },
  { title: 'Discuss complexity', question: 'What are the time and space costs? How could you improve the solution, and what trade-off would that introduce?' },
];
export default function Interview() {
  const { state, update } = useWorkspace(); const [id, setId] = useState(challenges[0].challengeId); const [stage, setStage] = useState(0); const c = challenges.find(ch => ch.challengeId === id)!;
  const key = `interview:${id}:${stage}`; const answer = state.notes[key] ?? '';
  return <><PageHeading eyebrow="EXPLAIN THE WHY" title="Practise thinking out loud." description="A self-paced technical interview: clarify, reason, implement, and defend your choices."/><div className="two-columns"><section className="panel"><label className="field-label">Interview problem<select value={id} onChange={e => { setId(e.target.value); setStage(0); }}>{challenges.map(ch => <option key={ch.challengeId} value={ch.challengeId}>{ch.title}</option>)}</select></label><p className="text-output">{c.description}</p><ActionLink href={`/coding/practice/${id}`} secondary>Open coding workspace</ActionLink><h3>Interview stages</h3>{stages.map((s, i) => <button aria-pressed={stage === i} className={`topic-button ${stage === i ? 'selected' : ''}`} key={s.title} onClick={() => setStage(i)}><span>{i + 1}</span>{s.title}<span className="muted tiny">{state.notes[`interview:${id}:${i}`]?.trim() ? 'Draft saved' : ''}</span></button>)}</section><div><section className="panel"><span className="tag violet">STAGE {stage + 1} / {stages.length}</span><h2>{stages[stage].title}</h2><p>{stages[stage].question}</p><label className="field-label">Your answer<textarea rows={10} maxLength={6000} value={answer} placeholder="I would start by…" onChange={e => update(s => ({ ...s, notes: { ...s.notes, [key]: e.target.value } }))}/></label><div className="toolbar compact"><button className="button secondary" disabled={stage === 0} onClick={() => setStage(stage - 1)}>Previous</button><button className="button" disabled={stage === stages.length - 1} onClick={() => setStage(stage + 1)}>Next stage</button></div><p className="muted small">Responses follow your workspace sync setting. AI feedback is coaching, not a verified interview grade.</p></section><Mentor key={key} initialMode="interview" language="text" context={`Problem: ${c.description}\nQuestion: ${stages[stage].question}\nStudent answer: ${answer}`}/></div></div></>;
}
