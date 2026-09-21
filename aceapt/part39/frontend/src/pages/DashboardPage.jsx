import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { SectionCard, EmptyState, LoadingState, ErrorState, Badge, Button } from '../components/shared/UI.jsx';

const TYPE_META = {
  FOLLOW_UP: { label: 'Follow-up', tone: 'denim' },
  HIGH_VALUE_APPLICATION: { label: 'High-value opportunity', tone: 'pine' },
  PREPARATION_TASK: { label: 'Preparation', tone: 'amber' },
  EVIDENCE_GAP: { label: 'Evidence gap', tone: 'amber' },
};

export default function DashboardPage() {
  const [items, setItems] = useState(null);
  const [student, setStudent] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([api.getToday(), api.getMe()])
      .then(([today, me]) => { setItems(today.items); setStudent(me.student); })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!items) return <LoadingState label="Preparing today's priorities" />;

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs text-ink-faint uppercase tracking-wide">Today's priorities</p>
        <h1 className="font-display text-3xl mt-1">
          {student ? `Welcome back, ${student.name.split(' ')[0]}.` : 'Welcome back.'}
        </h1>
        {student?.target_role && (
          <p className="text-sm text-ink-soft mt-1.5">
            Targeting <span className="font-medium text-ink">{student.target_role}</span> roles.
          </p>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="Nothing urgent today"
          subtitle="No follow-ups are due, no new high-priority opportunities are waiting, and no applications are stuck in preparation. Add an opportunity to get started."
          action={<Link to="/opportunities"><Button variant="secondary">Browse opportunities</Button></Link>}
        />
      ) : (
        <div className="space-y-3">
          {items.map((item, i) => {
            const meta = TYPE_META[item.type] || { label: item.type, tone: 'neutral' };
            return (
              <Link
                key={i}
                to={item.href}
                className="flex items-start gap-4 rounded-2xl border border-border-soft bg-surface p-4 hover:border-ink/20 transition-colors"
              >
                <Badge tone={meta.tone} className="shrink-0 mt-0.5">{meta.label}</Badge>
                <div className="min-w-0">
                  <p className="font-medium text-ink text-sm">{item.title}</p>
                  <p className="text-sm text-ink-soft mt-0.5">{item.detail}</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <SectionCard title="Career loop" className="bg-surface/60">
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs font-mono text-ink-faint">
          <span>Opportunity found</span><span>&rarr;</span>
          <span>Understood</span><span>&rarr;</span>
          <span>Fit analyzed</span><span>&rarr;</span>
          <span>Prioritized</span><span>&rarr;</span>
          <span>Application prepared</span><span>&rarr;</span>
          <span>Tracked</span><span>&rarr;</span>
          <span>Outcome recorded</span><span>&rarr;</span>
          <span className="text-ink">Better next decision</span>
        </div>
      </SectionCard>
    </div>
  );
}
