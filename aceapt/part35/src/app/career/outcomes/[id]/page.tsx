import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/nav/AppShell';
import { Card, CardEyebrow, SectionDivider } from '@/components/ui/Card';
import { Badge, EvidenceTag, PatternStrengthTag } from '@/components/ui/Tags';
import { EmptyState } from '@/components/ui/EmptyState';
import { OutcomeActions } from './OutcomeActions';
import { getCurrentStudent } from '@/lib/auth';
import { logEvent } from '@/lib/db/repository';
import { loadOutcomeDetail } from '@/lib/outcomeDetail';
import { STAGE_LABELS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  passed: 'Cleared this stage',
  rejected: 'Not selected',
  withdrawn: 'Withdrawn',
  offer_received: 'Offer received',
  pending: 'Awaiting result',
};

const SOURCE_LABEL: Record<string, string> = {
  recruiter_feedback: 'Recruiter Feedback',
  student_feedback: 'Your Reflection',
  trainer_feedback: 'Trainer Feedback',
  assessment_result: 'Assessment Result',
  simulation_result: 'Simulation Result',
  resume_alignment: 'Resume Alignment',
  project_evidence: 'Project Evidence',
  other: 'Other',
};

export default async function OutcomeDetailPage({ params }: { params: { id: string } }) {
  const student = await getCurrentStudent();
  const detail = await loadOutcomeDetail(params.id, student.id);
  if (!detail || detail.opportunity.studentId !== student.id) notFound();

  logEvent(student.id, 'outcome_viewed', { opportunityId: detail.opportunity.id });

  const { opportunity, furthestStage, analysis, evidence, narrativeSummary, existingRecoveryPlan } = detail;
  const isRejected = furthestStage?.status === 'rejected';
  const showPattern = isRejected && (analysis.patternStrength === 'emerging_pattern' || analysis.patternStrength === 'repeated_pattern' || analysis.hasDirectEvidence);

  return (
    <AppShell>
      <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted mb-2">Your Opportunity</p>
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display text-3xl text-ink">{opportunity.roleTitle}</h1>
          <p className="text-muted">{opportunity.companyName}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={furthestStage?.status === 'rejected' ? 'clay' : 'pine'}>
            {furthestStage ? STATUS_LABEL[furthestStage.status] : 'Recorded'}
          </Badge>
          {furthestStage && <Badge>{STAGE_LABELS[furthestStage.stageKey]}</Badge>}
        </div>
      </div>

      <Card className="mb-6">
        <p className="text-ink leading-relaxed">{narrativeSummary}</p>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardEyebrow>What We Know</CardEyebrow>
          <ul className="space-y-2.5">
            {analysis.knowns.map((k, i) => (
              <li key={i} className="flex gap-2 text-sm text-ink leading-relaxed">
                <span className="text-pine" aria-hidden="true">✓</span>
                <span>{k}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardEyebrow>What We Don't Know</CardEyebrow>
          {analysis.unknowns.length > 0 ? (
            <ul className="space-y-2.5">
              {analysis.unknowns.map((u, i) => (
                <li key={i} className="flex gap-2 text-sm text-muted leading-relaxed">
                  <span className="text-clay" aria-hidden="true">○</span>
                  <span>{u}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Nothing outstanding for this outcome.</p>
          )}
        </Card>
      </div>

      {isRejected && (
        <>
          <SectionDivider />
          <CardEyebrow>Current Pattern</CardEyebrow>
          {showPattern ? (
            <Card className="mt-3">
              <div className="flex items-center gap-2 mb-3">
                <EvidenceTag kind={analysis.evidenceType === 'UNKNOWN' ? 'POSSIBLE_CONTRIBUTOR' : analysis.evidenceType} />
                {analysis.patternStrength !== 'none' && <PatternStrengthTag strength={analysis.patternStrength} />}
              </div>
              <p className="text-sm text-ink leading-relaxed">
                {detail.patternExplanation ??
                  (analysis.failureCategory
                    ? `Evidence points toward ${analysis.failureCategory.replace(/_/g, ' ').toLowerCase()} as the area to investigate.`
                    : 'A repeated stage-level pattern was detected, though a specific cause is not yet confirmed.')}
              </p>
              {analysis.controllability && (
                <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                  {analysis.controllability === 'high'
                    ? 'Within your control'
                    : analysis.controllability === 'moderate'
                      ? 'Partly within your control'
                      : 'Largely outside your control'}
                </p>
              )}
            </Card>
          ) : (
            <div className="mt-3">
              <EmptyState
                title="We don't know yet."
                body="Available evidence is insufficient to identify a specific reason. Add recruiter feedback if you receive it, or continue recording outcomes to build a clearer picture."
              />
            </div>
          )}
        </>
      )}

      {evidence.length > 0 && (
        <>
          <SectionDivider />
          <CardEyebrow>Evidence On File</CardEyebrow>
          <div className="mt-3 space-y-3">
            {evidence.map((e) => (
              <Card key={e.id} className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <EvidenceTag kind={e.evidenceType} />
                  <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                    {SOURCE_LABEL[e.source]}
                  </span>
                </div>
                <p className="text-sm text-ink leading-relaxed">{e.contentText}</p>
              </Card>
            ))}
          </div>
        </>
      )}

      <SectionDivider />
      <CardEyebrow>Next Best Action</CardEyebrow>
      <div className="mt-3">
        <OutcomeActions
          opportunityId={opportunity.id}
          isRejected={!!isRejected}
          existingRecoveryPlanId={existingRecoveryPlan?.id ?? null}
        />
      </div>
    </AppShell>
  );
}
