import Link from 'next/link';
import { AppShell } from '@/components/nav/AppShell';
import { Card, CardEyebrow } from '@/components/ui/Card';
import { Badge, PatternStrengthTag } from '@/components/ui/Tags';
import { LinkButton } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { FunnelChart } from '@/components/career/FunnelChart';
import { getCurrentStudent } from '@/lib/auth';
import { getFurthestStage, listOpportunities, listRecoveryPlansForStudent } from '@/lib/db/repository';
import { computeFunnel } from '@/lib/engines/funnel';
import { FAILURE_CATEGORY_LABELS, STAGE_LABELS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  passed: 'Cleared this stage',
  rejected: 'Not selected',
  withdrawn: 'Withdrawn',
  offer_received: 'Offer received',
  pending: 'Awaiting result',
};

export default async function CareerOverviewPage() {
  const student = await getCurrentStudent();
  const opportunities = listOpportunities(student.id);

  if (opportunities.length === 0) {
    return (
      <AppShell>
        <h1 className="font-display text-3xl text-ink mb-8">Career Conversion Overview</h1>
        <EmptyState
          title="No career outcomes recorded yet."
          body="Once you complete an opportunity, ACEAPT will begin learning from the result."
          action={<LinkButton href="/career/outcomes/new">Record your first outcome</LinkButton>}
        />
      </AppShell>
    );
  }

  const latest = opportunities[0];
  const latestStage = getFurthestStage(latest.id);
  const funnel = computeFunnel(student.id);
  const plans = listRecoveryPlansForStudent(student.id);
  const activePlan = plans.find((p) => p.status !== 'completed') ?? plans[0] ?? null;

  return (
    <AppShell>
      <div className="flex items-baseline justify-between mb-8">
        <h1 className="font-display text-3xl text-ink">Career Conversion Overview</h1>
        <p className="font-mono text-xs uppercase tracking-[0.08em] text-muted">
          {student.name} · {opportunities.length} recorded
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-5">
        <Card className="md:col-span-3">
          <CardEyebrow>Latest Outcome</CardEyebrow>
          <p className="font-display text-xl text-ink">{latest.roleTitle}</p>
          <p className="text-sm text-muted mb-4">{latest.companyName}</p>
          <div className="flex items-center gap-2 mb-5">
            <Badge tone={latestStage?.status === 'rejected' ? 'clay' : 'pine'}>
              {latestStage ? STATUS_LABEL[latestStage.status] : 'Recorded'}
            </Badge>
            {latestStage && <Badge>{STAGE_LABELS[latestStage.stageKey]}</Badge>}
          </div>
          <LinkButton href={`/career/outcomes/${latest.id}`} variant="secondary">
            Understand this outcome
          </LinkButton>
        </Card>

        <Card className="md:col-span-2">
          <CardEyebrow>Current Bottleneck</CardEyebrow>
          {funnel.bottleneck ? (
            <>
              <p className="text-sm text-ink leading-relaxed mb-3">
                Largest observed drop:{' '}
                <span className="font-medium">
                  {STAGE_LABELS[funnel.bottleneck.fromStage]} → {STAGE_LABELS[funnel.bottleneck.toStage]}
                </span>
              </p>
              <PatternStrengthTag strength={funnel.bottleneck.confidence} />
            </>
          ) : (
            <p className="text-sm text-muted leading-relaxed">
              Not enough evidence yet to point to a specific bottleneck.
            </p>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-5">
        <Card className="md:col-span-3">
          <div className="flex items-center justify-between mb-4">
            <CardEyebrow>Conversion Funnel</CardEyebrow>
            <Link href="/career/funnel" className="font-mono text-[11px] uppercase tracking-[0.08em] text-pine hover:underline">
              View full funnel →
            </Link>
          </div>
          <FunnelChart funnel={funnel} compact />
        </Card>

        <Card className="md:col-span-2">
          <CardEyebrow>Recovery Status</CardEyebrow>
          {activePlan ? (
            <>
              <p className="font-display text-lg text-ink mb-1">
                {FAILURE_CATEGORY_LABELS[activePlan.failureCategory]}
              </p>
              <p className="text-sm text-muted mb-4 capitalize">Status: {activePlan.status}</p>
              <LinkButton href={`/career/recovery/${activePlan.id}`} variant="secondary">
                {activePlan.status === 'completed' ? 'View plan' : 'Continue recovery'}
              </LinkButton>
            </>
          ) : (
            <p className="text-sm text-muted leading-relaxed">
              No recovery plan in progress. One will appear here after an outcome needs one.
            </p>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
