import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { SectionCard, EmptyState, LoadingState, ErrorState, Button, Badge } from '../components/shared/UI.jsx';

export default function FollowUpsPage() {
  const [followups, setFollowups] = useState(null);
  const [error, setError] = useState(null);
  const [scanning, setScanning] = useState(false);

  const load = useCallback(() => {
    api.listFollowUps('PENDING').then((d) => setFollowups(d.followups)).catch((e) => setError(e.message));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleScan() {
    setScanning(true);
    try { await api.generateFollowUps(); load(); } finally { setScanning(false); }
  }

  async function handleMarkSent(fid) {
    await api.markFollowUpSent(fid);
    load();
  }

  async function handleDismiss(fid) {
    await api.dismissFollowUp(fid);
    load();
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!followups) return <LoadingState />;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="font-mono text-xs text-ink-faint uppercase tracking-wide">Follow-ups</p>
          <h1 className="font-display text-3xl mt-1">Stay on top of your pipeline</h1>
        </div>
        <Button variant="secondary" onClick={handleScan} disabled={scanning}>{scanning ? 'Checking...' : 'Check for due follow-ups'}</Button>
      </div>

      {followups.length === 0 ? (
        <EmptyState
          title="Nothing due right now"
          subtitle="A follow-up is never suggested right after you apply -- only once a reasonable interval has passed with no update."
          action={<Button variant="secondary" onClick={handleScan} disabled={scanning}>Check now</Button>}
        />
      ) : (
        <div className="space-y-4">
          {followups.map((f) => (
            <SectionCard key={f.id} title={`${f.opportunity.role} at ${f.opportunity.company}`} action={<Badge tone="amber">Due {f.due_date}</Badge>}>
              <p className="text-sm text-ink-soft">{f.reason}</p>
              <p className="text-xs text-ink-faint mt-1">via {f.channel}</p>
              <div className="mt-3 bg-ink/[0.03] rounded-xl px-3 py-2.5 text-sm text-ink">{f.message_draft}</div>
              <div className="mt-3 flex items-center gap-2">
                <Button size="sm" onClick={() => handleMarkSent(f.id)}>Mark as sent</Button>
                <Button size="sm" variant="ghost" onClick={() => handleDismiss(f.id)}>Dismiss</Button>
                <Link to={`/applications/${f.application_id}`} className="ml-auto text-xs text-ink-faint hover:text-ink">View application &rarr;</Link>
              </div>
            </SectionCard>
          ))}
        </div>
      )}
    </div>
  );
}
