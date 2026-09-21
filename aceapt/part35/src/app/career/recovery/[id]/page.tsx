import { notFound } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/nav/AppShell';
import { Card, CardEyebrow, SectionDivider } from '@/components/ui/Card';
import { PatternStrengthTag } from '@/components/ui/Tags';
import { RecoveryActions } from './RecoveryActions';
import { getCurrentStudent } from '@/lib/auth';
import {
  getOpportunity,
  getRecoveryPlan,
  getReassessmentsForPlan,
  listRecoveryActions,
  listRecoveryPlansForStudent,
  listReassessmentsForStudent,
  logEvent,
} from '@/lib/db/repository';
import { detectSameMistake } from '@/lib/engines/sameMistake';
import { FAILURE_CATEGORY_LABELS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export default async function RecoveryPlanPage({ params }: { params: { id: string } }) {
  const student = await getCurrentStudent();
  const plan = getRecoveryPlan(params.id);
  if (!plan || plan.studentId !== student.id) notFound();

  const actions = listRecoveryActions(plan.id);
  const reassessments = getReassessmentsForPlan(plan.id);
  const opportunity = plan.opportunityId ? getOpportunity(plan.opportunityId) : null;
  const priorPlans = listRecoveryPlansForStudent(student.id).filter((p) => p.id !== plan.id);
  const priorReassessments = listReassessmentsForStudent(student.id);
  const sameMistake = detectSameMistake(priorPlans, priorReassessments, plan.failureCategory);

  logEvent(student.id, 'recovery_plan_viewed', { planId: plan.id });

  const rationale = plan.rationaleAI ?? plan.rationaleFallback;

  return (
    <AppShell>
      <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted mb-2">Recovery Plan</p>
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-6">
        <h1 className="font-display text-3xl text-ink">{FAILURE_CATEGORY_LABELS[plan.failureCategory]}</h1>
        <PatternStrengthTag strength={plan.patternStrength} />
      </div>

      {opportunity && (
        <p className="text-sm text-muted mb-6">
          Triggered by{' '}
          <Link href={`/career/outcomes/${opportunity.id}`} className="text-pine hover:underline">
            {opportunity.roleTitle} at {opportunity.companyName}
          </Link>
        </p>
      )}

      <Card className="mb-6">
        <p className="text-ink leading-relaxed">{rationale}</p>
      </Card>

      {sameMistake && (
        <Card className="mb-6 border-clay/40 bg-clay-soft">
          <p className="text-sm text-clay-strong leading-relaxed">
            A similar recommendation was tried before without a clear improvement. This time, consider a
            more specific, hands-on version of the action below rather than repeating it the same way.
          </p>
        </Card>
      )}

      <SectionDivider />

      <RecoveryActions plan={plan} actions={actions} reassessments={reassessments} />
    </AppShell>
  );
}
