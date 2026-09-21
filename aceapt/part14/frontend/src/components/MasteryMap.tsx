import { useEffect, useState } from 'react';

import { api, MasteryMapResponse } from '../lib/api';
import { deriveStrip } from '../lib/evidenceStrip';
import { Skill, SkillAnalysis } from '../lib/types';
import { EvidenceStrip, EvidenceStripLegend } from './EvidenceStrip';
import { Card, ErrorState, LoadingRows, StateBadge } from './ui';

export function MasteryMap({ studentId, onOpenSkill }: { studentId: string; onOpenSkill: (skillId: string) => void }) {
  const [data, setData] = useState<MasteryMapResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    setData(null);
    api
      .getMasteryMap(studentId)
      .then(setData)
      .catch((e) => setError(e.message));
  };

  useEffect(load, [studentId]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <LoadingRows count={5} />;

  const allSkills = data.domains.flatMap((d) => d.skills);
  const counts = summarize(allSkills.map((s) => s.analysis));

  return (
    <div>
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-widest text-ink-400">{data.student.name} · Mastery ledger</p>
        <h2 className="mt-1 text-2xl font-semibold text-ink-900">What the evidence actually shows</h2>
        <p className="mt-2 max-w-2xl text-sm text-ink-600">
          Not a completion tracker. Every state below is derived from independent attempts, difficulty spread, format spread,
          novel questions and delayed recall — never from a single accuracy number.
        </p>

        <dl className="tabular mt-6 flex flex-wrap gap-x-8 gap-y-3 font-mono text-sm">
          <Stat label="Skills tracked" value={allSkills.length} />
          <Stat label="Robust or stable" value={counts.strong} tone="text-accent-700" />
          <Stat label="Developing" value={counts.developing} />
          <Stat label="Gap flagged" value={counts.gap} tone="text-warn" />
          <Stat label="Not enough data" value={counts.thin} tone="text-ink-400" />
        </dl>
      </header>

      <div className="mb-5">
        <EvidenceStripLegend />
      </div>

      <div className="space-y-10">
        {data.domains.map((domainGroup) => (
          <section key={domainGroup.domain}>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-ink-400">{domainGroup.domain}</h3>
            <div className="space-y-2.5">
              {domainGroup.skills.map(({ skill, analysis }) => (
                <SkillRow key={skill.id} skill={skill} analysis={analysis} onOpen={() => onOpenSkill(skill.id)} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function SkillRow({ skill, analysis, onOpen }: { skill: Skill; analysis: SkillAnalysis; onOpen: () => void }) {
  return (
    <Card className="px-5 py-4 transition-colors hover:border-ink-400">
      <button onClick={onOpen} className="flex w-full items-center justify-between gap-6 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <span className="font-medium text-ink-900">{skill.name}</span>
            <StateBadge state={analysis.state} label={analysis.displayLabel} />
          </div>
          <p className="mt-1 truncate text-sm text-ink-600">{analysis.nextAction}</p>
        </div>
        <EvidenceStrip dims={deriveStrip(analysis)} />
      </button>
    </Card>
  );
}

function Stat({ label, value, tone = 'text-ink-900' }: { label: string; value: number; tone?: string }) {
  return (
    <div>
      <div className={`text-lg ${tone}`}>{value}</div>
      <div className="text-xs font-sans text-ink-400">{label}</div>
    </div>
  );
}

function summarize(analyses: SkillAnalysis[]) {
  let strong = 0,
    developing = 0,
    gap = 0,
    thin = 0;
  for (const a of analyses) {
    const l = a.displayLabel.toLowerCase();
    if (l.includes('not enough')) thin++;
    else if (l.includes('gap')) gap++;
    else if (['robust mastery', 'transferred', 'retained', 'stable'].includes(l)) strong++;
    else developing++;
  }
  return { strong, developing, gap, thin };
}
