import { NextRequest, NextResponse } from 'next/server';
import { getCurrentStudent, assertOwnership } from '@/lib/auth';
import {
  addTrajectoryNote,
  createRecoveryPlan,
  findRecoveryPlanForOpportunity,
  getFurthestStage,
  getOpportunity,
  listRecoveryActions,
  listRecoveryPlansForStudent,
  listReassessmentsForStudent,
  logEvent,
} from '@/lib/db/repository';
import { analyzeOutcome, generateNarrative } from '@/lib/ai/outcomeAnalysis';
import { RECOVERY_TEMPLATES, buildFallbackRationale } from '@/lib/engines/recovery';
import { detectSameMistake } from '@/lib/engines/sameMistake';
import { FAILURE_CATEGORY_LABELS } from '@/lib/constants';
import { apiErrorBody, NotFoundError, ValidationError } from '@/lib/errors';
import { createRecoverySchema, formatZodError } from '@/lib/validation';
import type { PatternStrength } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const student = await getCurrentStudent();
    const plans = listRecoveryPlansForStudent(student.id).map((plan) => ({
      ...plan,
      actions: listRecoveryActions(plan.id),
    }));
    return NextResponse.json({ plans });
  } catch (error) {
    const { status, body } = apiErrorBody(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const student = await getCurrentStudent();
    const json = await request.json();
    const parsed = createRecoverySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }

    const opportunity = getOpportunity(parsed.data.opportunityId);
    if (!opportunity) throw new NotFoundError('Outcome not found.');
    assertOwnership(opportunity.studentId, student.id);

    const existing = findRecoveryPlanForOpportunity(opportunity.id);
    if (existing) {
      return NextResponse.json({ plan: existing, actions: listRecoveryActions(existing.id) });
    }

    const furthestStage = getFurthestStage(opportunity.id);
    if (!furthestStage || furthestStage.status !== 'rejected') {
      throw new ValidationError('A recovery plan only applies to an outcome that ended in rejection.');
    }

    const analysis = analyzeOutcome(opportunity.id, student.id);
    const category = analysis.failureCategory ?? 'EXTERNAL_UNKNOWN';
    const strength: PatternStrength =
      analysis.patternStrength === 'none' ? 'limited_evidence' : analysis.patternStrength;

    const priorPlans = listRecoveryPlansForStudent(student.id);
    const priorReassessments = listReassessmentsForStudent(student.id);
    const isSameMistake = detectSameMistake(priorPlans, priorReassessments, category);

    const template = RECOVERY_TEMPLATES[category];
    const narrative = await generateNarrative(opportunity, analysis);
    const fallbackRationale = buildFallbackRationale(category, strength);

    const { plan, actions } = createRecoveryPlan({
      studentId: student.id,
      opportunityId: opportunity.id,
      failureCategory: category,
      patternStrength: strength,
      rationaleFallback: isSameMistake
        ? `${fallbackRationale} A similar recommendation was tried before without a clear improvement — consider a more specific, hands-on version of this action this time.`
        : fallbackRationale,
      rationaleAI: narrative.recoveryRationale,
      primary: template.primary,
      supporting: template.supporting,
    });

    addTrajectoryNote(
      student.id,
      `Bottleneck identified: ${FAILURE_CATEGORY_LABELS[category]}. Recovery plan started.`,
      'outcome',
      opportunity.id,
    );
    logEvent(student.id, 'recovery_recommended', { opportunityId: opportunity.id, planId: plan.id, category });

    return NextResponse.json({ plan, actions, sameMistake: isSameMistake }, { status: 201 });
  } catch (error) {
    const { status, body } = apiErrorBody(error);
    return NextResponse.json(body, { status });
  }
}
