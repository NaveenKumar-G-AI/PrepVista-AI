import type { GraphFilter } from '../api/types';

const FILTERS: Array<{ id: GraphFilter; label: string }> = [
  { id: 'ALL', label: 'All' },
  { id: 'WEAK', label: 'My weak areas' },
  { id: 'STRONG', label: 'Strong areas' },
  { id: 'GOAL_RELEVANT', label: 'Goal relevant' },
  { id: 'RECENTLY_PRACTICED', label: 'Recently practiced' },
  { id: 'NEEDS_EVIDENCE', label: 'Needs evidence' },
];

export interface SkillGraphFiltersProps {
  active: GraphFilter;
  onChange: (filter: GraphFilter) => void;
}

export function SkillGraphFilters({ active, onChange }: SkillGraphFiltersProps) {
  return (
    <div role="group" aria-label="Filter skills" className="flex flex-wrap gap-2">
      {FILTERS.map((f) => {
        const isActive = f.id === active;
        return (
          <button
            key={f.id}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(f.id)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${isActive ? 'border-ink bg-ink text-paper' : 'border-line bg-white/60 text-ink-soft hover:border-ink hover:text-ink'}`}
          >
            {f.label}
          </button>
        );
      })}
    </div>
  );
}

export function applyGraphFilter<T extends { state: string; evidenceCount: number; capability: number | null }>(skills: T[], filter: GraphFilter, goalRelevantCodes?: Set<string>, codeOf?: (s: T) => string): T[] {
  switch (filter) {
    case 'WEAK':
      return skills.filter((s) => s.state === 'DEVELOPING');
    case 'STRONG':
      return skills.filter((s) => s.state === 'STRONG' || s.state === 'MASTERED');
    case 'GOAL_RELEVANT':
      return goalRelevantCodes && codeOf ? skills.filter((s) => goalRelevantCodes.has(codeOf(s))) : skills;
    case 'RECENTLY_PRACTICED':
      return skills.filter((s) => s.evidenceCount > 0);
    case 'NEEDS_EVIDENCE':
      return skills.filter((s) => s.state === 'UNKNOWN');
    case 'ALL':
    default:
      return skills;
  }
}
