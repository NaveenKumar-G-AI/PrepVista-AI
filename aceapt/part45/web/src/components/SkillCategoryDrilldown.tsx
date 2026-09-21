import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import type { createSkillGraphClient } from '../api/skillGraphClient';
import type { GraphFilter, StudentSkillView } from '../api/types';
import { DOMAIN_META } from './theme';
import { SkillNodeCard } from './SkillNodeCard';
import { SkillGraphFilters, applyGraphFilter } from './SkillGraphFilters';

export interface SkillCategoryDrilldownProps {
  client: ReturnType<typeof createSkillGraphClient>;
  studentId: string;
  domain: string;
  onBack: () => void;
  onOpenSkill: (code: string) => void;
}

export function SkillCategoryDrilldown({ client, studentId, domain, onBack, onOpenSkill }: SkillCategoryDrilldownProps) {
  const [skills, setSkills] = useState<StudentSkillView[] | null>(null);
  const [goalCodes, setGoalCodes] = useState<Set<string>>(new Set());
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [filter, setFilter] = useState<GraphFilter>('ALL');

  useEffect(() => {
    let cancelled = false;
    setSkills(null);
    setActiveCategory(null);
    Promise.all([client.getStudentGraph(studentId, domain), client.getStudentPriorities(studentId)]).then(([graphRes, prioritiesRes]) => {
      if (cancelled) return;
      setSkills(graphRes.skills);
      setGoalCodes(new Set(prioritiesRes.priorities.filter((p) => p.signals.isGoalRelevant).map((p) => p.skillCode)));
    });
    return () => {
      cancelled = true;
    };
  }, [client, studentId, domain]);

  const categories = useMemo(() => (skills ?? []).filter((s) => s.level === 'CATEGORY'), [skills]);
  const activeCategorySkillId = useMemo(() => categories.find((c) => c.code === activeCategory)?.skillId, [categories, activeCategory]);
  const skillsInCategory = useMemo(() => {
    if (!skills || !activeCategorySkillId) return [];
    return skills.filter((s) => (s.level === 'SKILL' || s.level === 'SUBSKILL') && s.parentId === activeCategorySkillId);
  }, [skills, activeCategorySkillId]);

  const meta = DOMAIN_META[domain as keyof typeof DOMAIN_META];
  const filtered = applyGraphFilter(skillsInCategory, filter, goalCodes, (s) => s.code);

  if (!skills) {
    return <div className="animate-pulse h-40 rounded-card bg-line/60" aria-busy="true" aria-label={`Loading ${meta?.label ?? domain}`} />;
  }

  return (
    <div className="space-y-4">
      <button type="button" onClick={activeCategory ? () => setActiveCategory(null) : onBack} className="flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft size={15} /> {activeCategory ? meta?.label : 'My skill map'}
      </button>

      {!activeCategory && (
        <>
          <h2 className={`font-display text-lg font-semibold ${meta?.text}`}>{meta?.label} skills</h2>
          <div className="space-y-2">
            {categories.map((cat) => (
              <button key={cat.skillId} onClick={() => setActiveCategory(cat.code)} className="flex w-full items-center justify-between rounded-card border border-line bg-white/60 p-3 text-left hover:bg-white">
                <span className="font-display text-sm font-medium text-ink">{cat.displayName}</span>
                <ChevronRight size={16} className="text-ink-soft" aria-hidden="true" />
              </button>
            ))}
          </div>
        </>
      )}

      {activeCategory && (
        <>
          <SkillGraphFilters active={filter} onChange={setFilter} />
          <div className="space-y-2">
            {filtered.length === 0 && <p className="text-sm text-ink-soft">No skills match this filter.</p>}
            {filtered.map((s) => (
              <SkillNodeCard key={s.skillId} skill={s} onExplore={onOpenSkill} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
