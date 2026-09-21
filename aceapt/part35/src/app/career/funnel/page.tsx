import { AppShell } from '@/components/nav/AppShell';
import { Card, CardEyebrow } from '@/components/ui/Card';
import { PatternStrengthTag } from '@/components/ui/Tags';
import { EmptyState } from '@/components/ui/EmptyState';
import { LinkButton } from '@/components/ui/Button';
import { FunnelChart } from '@/components/career/FunnelChart';
import { getCurrentStudent } from '@/lib/auth';
import { computeFunnel } from '@/lib/engines/funnel';
import { STAGE_LABELS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export default async function FunnelPage() {
  const student = await getCurrentStudent();
  const funnel = computeFunnel(student.id);

  if (funnel.totalOpportunities === 0) {
    return (
      <AppShell>
        <h1 className="font-display text-3xl text-ink mb-8">Conversion Funnel</h1>
        <EmptyState
          title="No career outcomes recorded yet."
          body="Once you complete an opportunity, ACEAPT will begin learning from the result."
          action={<LinkButton href="/career/outcomes/new">Record your first outcome</LinkButton>}
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <h1 className="font-display text-3xl text-ink mb-2">Conversion Funnel</h1>
      <p className="text-sm text-muted mb-8">
        Where opportunities are being lost across {funnel.totalOpportunities} recorded outcome
        {funnel.totalOpportunities === 1 ? '' : 's'}.
      </p>

      <Card>
        <FunnelChart funnel={funnel} />
      </Card>

      <div className="mt-6">
        <CardEyebrow>Bottleneck</CardEyebrow>
        {funnel.bottleneck ? (
          <Card className="mt-3">
            <p className="text-ink leading-relaxed mb-3">
              The largest observed drop is between{' '}
              <span className="font-medium">{STAGE_LABELS[funnel.bottleneck.fromStage]}</span> and{' '}
              <span className="font-medium">{STAGE_LABELS[funnel.bottleneck.toStage]}</span> — {funnel.bottleneck.dropCount} opportunit
              {funnel.bottleneck.dropCount === 1 ? 'y did' : 'ies did'} not continue past this point.
            </p>
            <PatternStrengthTag strength={funnel.bottleneck.confidence} />
          </Card>
        ) : (
          <div className="mt-3">
            <EmptyState
              title="Not enough evidence yet."
              body="Complete another relevant opportunity or add recruiter feedback to improve the analysis."
            />
          </div>
        )}
      </div>
    </AppShell>
  );
}
