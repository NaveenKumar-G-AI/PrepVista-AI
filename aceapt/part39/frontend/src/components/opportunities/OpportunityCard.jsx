import { Link } from 'react-router-dom';
import { RecommendationBadge, SafetyBadge } from '../shared/UI.jsx';

export default function OpportunityCard({ opportunity }) {
  const o = opportunity;
  return (
    <Link
      to={`/opportunities/${o.id}`}
      className="block rounded-2xl border border-border-soft bg-surface p-5 hover:border-ink/25 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-heading font-semibold text-ink truncate">{o.role || 'Untitled role'}</h3>
          <p className="text-sm text-ink-soft truncate">{o.company || 'Company not specified'}</p>
        </div>
        <RecommendationBadge recommendation={o.priority_recommendation} />
      </div>

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-faint font-mono">
        {o.location && <span>{o.location}</span>}
        {o.work_mode && o.work_mode !== 'UNKNOWN' && <span>{o.work_mode}</span>}
        {o.application_effort && <span>Effort: {o.application_effort.replace(/_/g, ' ').toLowerCase()}</span>}
        {o.deadline && <span>Due {o.deadline}</span>}
      </div>

      {(o.top_why || o.top_gap) && (
        <div className="mt-3 pt-3 border-t border-border-soft space-y-1 text-sm">
          {o.top_why && <p className="text-pine-700 truncate">&#10003; {o.top_why}</p>}
          {o.top_gap && (
            <p className="text-amber-700 truncate">
              &#9651; {o.top_gap.skill_key}: {o.top_gap.severity === 'UNSUPPORTED' ? 'no evidence yet' : 'limited evidence'}
            </p>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between">
        <SafetyBadge level={o.safety_concern_level || 'LOW'} />
        {o.career_alignment !== null && o.career_alignment !== undefined && (
          <span className="text-xs font-mono text-ink-faint">Alignment {o.career_alignment}</span>
        )}
      </div>
    </Link>
  );
}
