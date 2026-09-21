import { AppShell } from '@/components/nav/AppShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { LinkButton } from '@/components/ui/Button';
import { getCurrentStudent } from '@/lib/auth';
import { listOpportunities, listTrajectoryNotes } from '@/lib/db/repository';

export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<string, string> = {
  outcome_recorded: 'Outcome Recorded',
  outcome: 'Bottleneck Identified',
  recovery_completed: 'Recovery Completed',
  reassessment: 'Reassessment',
};

export default async function JourneyPage() {
  const student = await getCurrentStudent();
  const opportunities = listOpportunities(student.id);
  const notes = listTrajectoryNotes(student.id);

  const events = [
    ...opportunities.map((o) => ({
      date: o.createdAt,
      kind: 'outcome_recorded',
      title: `${o.roleTitle} — ${o.companyName}`,
      detail: 'Outcome recorded.',
    })),
    ...notes.map((n) => ({
      date: n.createdAt,
      kind: n.sourceType,
      title: KIND_LABEL[n.sourceType] ?? 'Update',
      detail: n.summary,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <AppShell>
      <h1 className="font-display text-3xl text-ink mb-2">Career Journey</h1>
      <p className="text-sm text-muted mb-8">Action, outcome, learning, intervention, change — in order.</p>

      {events.length === 0 ? (
        <EmptyState
          title="No career outcomes recorded yet."
          body="Once you complete an opportunity, ACEAPT will begin learning from the result."
          action={<LinkButton href="/career/outcomes/new">Record your first outcome</LinkButton>}
        />
      ) : (
        <ol className="relative border-l border-line pl-6 space-y-8">
          {events.map((event, i) => (
            <li key={i} className="relative">
              <span className="absolute -left-[27px] top-1 h-2.5 w-2.5 rounded-full bg-pine" aria-hidden="true" />
              <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted mb-1">
                {new Date(event.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                {' · '}
                {KIND_LABEL[event.kind] ?? event.kind}
              </p>
              <p className="font-display text-lg text-ink">{event.title}</p>
              <p className="text-sm text-muted">{event.detail}</p>
            </li>
          ))}
        </ol>
      )}
    </AppShell>
  );
}
