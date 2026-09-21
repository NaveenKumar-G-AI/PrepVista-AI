import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { StagePill, Badge, EmptyState, LoadingState, ErrorState } from '../components/shared/UI.jsx';

const GROUPS = {
  all: { label: 'All', stages: null },
  preparing: { label: 'Preparing', stages: ['SAVED', 'RESEARCHING', 'PREPARING'] },
  applied: { label: 'Applied', stages: ['APPLIED'] },
  in_progress: { label: 'In progress', stages: ['ASSESSMENT', 'RECRUITER_CONTACT', 'INTERVIEW_1', 'INTERVIEW_2', 'FINAL_ROUND'] },
  closed: { label: 'Closed', stages: ['OFFER', 'REJECTED', 'WITHDRAWN', 'NO_RESPONSE', 'CLOSED'] },
};

const RESPONSIVENESS_LABEL = {
  FOLLOW_UP_RECOMMENDED: 'Follow-up recommended',
  NO_RESPONSE: 'No response yet',
  POSSIBLY_INACTIVE: 'Possibly inactive',
};

export default function ApplicationsPage() {
  const [applications, setApplications] = useState(null);
  const [error, setError] = useState(null);
  const [group, setGroup] = useState('all');

  const load = useCallback(() => {
    api.listApplications().then((d) => setApplications(d.applications)).catch((e) => setError(e.message));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!applications) return <LoadingState />;

  const filtered = GROUPS[group].stages ? applications.filter((a) => GROUPS[group].stages.includes(a.stage)) : applications;

  return (
    <div className="space-y-5">
      <div>
        <p className="font-mono text-xs text-ink-faint uppercase tracking-wide">Applications</p>
        <h1 className="font-display text-3xl mt-1">Your pipeline</h1>
      </div>

      <div className="flex gap-1 border-b border-border-soft overflow-x-auto no-scrollbar">
        {Object.entries(GROUPS).map(([key, g]) => (
          <button
            key={key}
            onClick={() => setGroup(key)}
            className={`whitespace-nowrap px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              group === key ? 'border-ink text-ink' : 'border-transparent text-ink-soft hover:text-ink'
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No applications here yet" subtitle="Applications you start preparing from an opportunity will show up here." />
      ) : (
        <div className="space-y-3">
          {filtered.map((app) => (
            <Link
              key={app.id}
              to={`/applications/${app.id}`}
              className="flex items-center justify-between gap-4 rounded-2xl border border-border-soft bg-surface p-4 hover:border-ink/20 transition-colors"
            >
              <div className="min-w-0">
                <p className="font-medium text-ink text-sm truncate">
                  {app.opportunity?.role} <span className="text-ink-faint font-normal">at</span> {app.opportunity?.company}
                </p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <StagePill stage={app.stage} />
                  {RESPONSIVENESS_LABEL[app.responsiveness_state] && <Badge tone="amber">{RESPONSIVENESS_LABEL[app.responsiveness_state]}</Badge>}
                </div>
              </div>
              <span className="text-xs font-mono text-ink-faint shrink-0">
                {app.applied_date ? new Date(app.applied_date).toLocaleDateString() : 'Not applied yet'}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
