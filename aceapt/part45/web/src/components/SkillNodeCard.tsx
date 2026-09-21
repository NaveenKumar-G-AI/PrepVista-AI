import { ArrowRight } from 'lucide-react';
import type { StudentSkillView } from '../api/types';
import { DOMAIN_META, STATE_META, CONFIDENCE_LABEL, formatCapability } from './theme';

export interface SkillNodeCardProps {
  skill: StudentSkillView;
  onExplore?: (code: string) => void;
  isFocus?: boolean;
  compact?: boolean;
}

/** The circular "station" indicator: a ring whose fill reflects capability, empty/dashed when UNKNOWN. */
function StationDot({ skill, size = 44 }: { skill: StudentSkillView; size?: number }) {
  const domainMeta = DOMAIN_META[skill.domain];
  const pct = skill.capability ?? 0;
  const r = (size - 6) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - pct / 100);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${skill.capability === null ? 'Not yet evaluated' : formatCapability(skill.capability) + ' capability'}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" className="text-line" strokeWidth={4} strokeDasharray={skill.state === 'UNKNOWN' ? '3 4' : undefined} />
      {skill.capability !== null && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          className={domainMeta.text}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      )}
      <text x="50%" y="52%" textAnchor="middle" dominantBaseline="middle" className="fill-ink font-display" style={{ fontSize: size * 0.24 }}>
        {skill.capability === null ? '?' : Math.round(skill.capability)}
      </text>
    </svg>
  );
}

export function SkillNodeCard({ skill, onExplore, isFocus, compact }: SkillNodeCardProps) {
  const stateMeta = STATE_META[skill.state];

  return (
    <div
      className={`group relative flex items-center gap-3 rounded-card border bg-white/60 p-3 shadow-station transition hover:bg-white ${isFocus ? 'border-focus ring-1 ring-focus' : 'border-line'} ${compact ? 'p-2.5' : 'p-3'}`}
    >
      {isFocus && (
        <span className="absolute -top-2 left-3 rounded-full bg-focus px-2 py-0.5 text-[0.65rem] font-medium text-white">Current focus</span>
      )}
      <StationDot skill={skill} size={compact ? 36 : 44} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-sm font-semibold text-ink">{skill.displayName}</p>
        <p className="skill-code">{skill.code}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
          <span className={`font-medium ${stateMeta.text}`}>{stateMeta.label}</span>
          <span className="text-ink-soft" aria-hidden="true">·</span>
          <span className="text-ink-soft">{CONFIDENCE_LABEL[skill.confidence]}</span>
          {skill.trend === 'IMPROVING' && <span className="text-verbal">↗ improving</span>}
          {skill.trend === 'DECLINING' && <span className="text-warn">↘ slipping</span>}
        </div>
      </div>
      {onExplore && (
        <button
          type="button"
          onClick={() => onExplore(skill.code)}
          className="flex shrink-0 items-center gap-1 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink transition group-hover:border-ink"
          aria-label={`Explore ${skill.displayName}`}
        >
          Explore <ArrowRight size={13} />
        </button>
      )}
    </div>
  );
}
