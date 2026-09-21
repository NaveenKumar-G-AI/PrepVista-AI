import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Compass } from 'lucide-react';
import type { StudentSkillView, PrioritySignal } from '../api/types';
import type { createSkillGraphClient } from '../api/skillGraphClient';
import { DOMAIN_META } from './theme';
import { SkillNodeCard } from './SkillNodeCard';

export interface SkillMapOverviewProps {
  client: ReturnType<typeof createSkillGraphClient>;
  studentId: string;
  onOpenSkill: (code: string) => void;
  onExploreDomain: (domain: string) => void;
}

const DOMAINS = ['QUANTITATIVE_APTITUDE', 'LOGICAL_REASONING', 'VERBAL_APTITUDE'] as const;

function domainAverage(skills: StudentSkillView[]) {
  const evaluated = skills.filter((s) => s.capability !== null);
  if (evaluated.length === 0) return null;
  return Math.round(evaluated.reduce((sum, s) => sum + (s.capability ?? 0), 0) / evaluated.length);
}

export function SkillMapOverview({ client, studentId, onOpenSkill, onExploreDomain }: SkillMapOverviewProps) {
  const [skills, setSkills] = useState<StudentSkillView[] | null>(null);
  const [priorities, setPriorities] = useState<PrioritySignal[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSkills(null);
    setError(null);
    Promise.all([client.getStudentGraph(studentId), client.getStudentPriorities(studentId)])
      .then(([graphRes, prioritiesRes]) => {
        if (cancelled) return;
        setSkills(graphRes.skills.filter((s) => s.level === 'SKILL' || s.level === 'SUBSKILL'));
        setPriorities(prioritiesRes.priorities);
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      cancelled = true;
    };
  }, [client, studentId]);

  const focusSkillCode = priorities?.find((p) => p.isHighestLeverageCandidate)?.skillCode;

  const { strong, needsAttention } = useMemo(() => {
    if (!skills) return { strong: [], needsAttention: [] };
    return {
      strong: skills.filter((s) => s.state === 'STRONG' || s.state === 'MASTERED').slice(0, 4),
      needsAttention: skills.filter((s) => s.state === 'DEVELOPING').sort((a, b) => (a.capability ?? 0) - (b.capability ?? 0)).slice(0, 4),
    };
  }, [skills]);

  if (error) {
    return <div className="rounded-card border border-warn/40 bg-warn-soft p-4 text-sm text-warn">Couldn't load your skill map: {error}</div>;
  }

  if (!skills) {
    return (
      <div className="animate-pulse space-y-3" aria-busy="true" aria-label="Loading your skill map">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 rounded-card bg-line/60" />
        ))}
      </div>
    );
  }

  const focusSkill = skills.find((s) => s.code === focusSkillCode);
  const focusSignal = priorities?.find((p) => p.skillCode === focusSkillCode);

  return (
    <div className="space-y-6">
      <section aria-labelledby="skill-map-heading">
        <h2 id="skill-map-heading" className="mb-3 font-display text-lg font-semibold text-ink">
          My skill map
        </h2>
        <div className="space-y-3">
          {DOMAINS.map((domain) => {
            const domainSkills = skills.filter((s) => s.domain === domain);
            const avg = domainAverage(domainSkills);
            const meta = DOMAIN_META[domain];
            return (
              <button
                key={domain}
                onClick={() => onExploreDomain(domain)}
                className="flex w-full items-center gap-3 rounded-card border border-line bg-white/60 p-3 text-left transition hover:bg-white"
              >
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.bar}`} aria-hidden="true" />
                <span className="w-24 shrink-0 font-display text-sm font-medium text-ink">{meta.label}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-line" role="img" aria-label={`${meta.label} average capability: ${avg === null ? 'not yet evaluated' : avg + '%'}`}>
                  <span className={`animate-fill block h-full rounded-full ${meta.bar}`} style={{ width: `${avg ?? 0}%` }} />
                </span>
                <span className="w-12 shrink-0 text-right font-mono text-sm text-ink-soft">{avg === null ? '—' : `${avg}%`}</span>
                <ChevronRight size={16} className="shrink-0 text-ink-soft" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </section>

      {focusSkill && (
        <section aria-labelledby="current-focus-heading">
          <h2 id="current-focus-heading" className="mb-2 flex items-center gap-1.5 font-display text-lg font-semibold text-ink">
            <Compass size={18} className="text-focus" aria-hidden="true" /> Current focus
          </h2>
          <SkillNodeCard skill={focusSkill} onExplore={onOpenSkill} isFocus />
          {focusSignal && <p className="mt-2 text-sm text-ink-soft">{focusSignal.explanation}.</p>}
        </section>
      )}

      {strong.length > 0 && (
        <section aria-labelledby="strong-heading">
          <h2 id="strong-heading" className="mb-2 font-display text-lg font-semibold text-ink">
            Strong foundations
          </h2>
          <div className="space-y-2">
            {strong.map((s) => (
              <SkillNodeCard key={s.skillId} skill={s} onExplore={onOpenSkill} compact />
            ))}
          </div>
        </section>
      )}

      {needsAttention.length > 0 && (
        <section aria-labelledby="attention-heading">
          <h2 id="attention-heading" className="mb-2 font-display text-lg font-semibold text-ink">
            Needs attention
          </h2>
          <div className="space-y-2">
            {needsAttention.map((s) => (
              <SkillNodeCard key={s.skillId} skill={s} onExplore={onOpenSkill} compact />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
