import { NextRequest, NextResponse } from 'next/server';
import { getCurrentStudent, assertOwnsRecord } from '@/lib/auth';
import { getAttempt, saveAttempt, appendEvent } from '@/lib/db/repository';
import { getSimulation } from '@/lib/content/simulations';
import { buildRuntimeView, TIME_GRACE_SECONDS } from '@/lib/engines/runtime-view';
import { apiError, handleUnexpected } from '@/lib/api-utils';
import type { ItemResponse } from '@/lib/db/schema';

interface RespondBody {
  itemId: string;
  selectedOptionId?: string;
  freeText?: string;
}

export async function POST(req: NextRequest, { params }: { params: { attemptId: string } }) {
  try {
    const student = getCurrentStudent();
    const attempt = getAttempt(params.attemptId);
    if (!attempt) return apiError('Attempt not found', 404);
    assertOwnsRecord(attempt.studentId, student.id);

    const sim = getSimulation(attempt.simulationId);
    const rules = sim?.rules ?? [];

    if (attempt.status !== 'in_progress') {
      return apiError('This attempt is no longer active', 409, { view: buildRuntimeView(attempt, rules) });
    }

    // Server-authoritative timer — the client's clock is never trusted for
    // whether submissions are still allowed (spec §54).
    const elapsedSeconds = Math.floor((Date.now() - new Date(attempt.startedAt).getTime()) / 1000);
    if (elapsedSeconds > attempt.blueprint.totalDurationSeconds + TIME_GRACE_SECONDS) {
      attempt.status = 'expired';
      saveAttempt(attempt);
      appendEvent(student.id, attempt.id, 'simulation_expired', {});
      return apiError('Time expired', 409, { shouldComplete: true, view: buildRuntimeView(attempt, rules) });
    }

    const body = (await req.json()) as RespondBody;
    if (!body?.itemId) return apiError('itemId is required', 400);

    const currentView = buildRuntimeView(attempt, rules);

    // Idempotent replay: if this itemId matches the most recently *recorded*
    // response, the client is retrying a request whose result it never saw
    // (e.g. a dropped connection) — return the current state rather than
    // erroring, so a legitimate retry never looks like data loss (spec §54,
    // §61: preserve submitted responses, avoid duplicate submissions).
    const lastResponse = attempt.responses[attempt.responses.length - 1];
    if (lastResponse && lastResponse.itemId === body.itemId) {
      return NextResponse.json({ view: currentView });
    }

    if (!currentView.item || currentView.item.id !== body.itemId) {
      return apiError('This item is not the current item for this attempt', 400, { view: currentView });
    }

    const stage = attempt.blueprint.stages[attempt.currentStageIndex];
    const stageItem = stage.items[attempt.currentItemIndex];
    const timeSpentSeconds = Math.max(0, Math.round((Date.now() - new Date(attempt.currentItemStartedAt).getTime()) / 1000));

    const response: ItemResponse = {
      itemId: stageItem.itemId,
      stageId: stage.id,
      kind: stageItem.kind,
      submittedAt: new Date().toISOString(),
      timeSpentSeconds,
      selectedOptionId: body.selectedOptionId,
      freeText: body.freeText,
    };
    attempt.responses.push(response);
    appendEvent(student.id, attempt.id, 'item_completed', { itemId: response.itemId, stageId: stage.id });
    if (stageItem.kind === 'decision') {
      appendEvent(student.id, attempt.id, 'decision_made', { itemId: response.itemId, selectedOptionId: body.selectedOptionId });
    }

    // Advance the pointer: next item in stage, or next stage, or done.
    const isLastItemInStage = attempt.currentItemIndex >= stage.items.length - 1;
    if (!isLastItemInStage) {
      attempt.currentItemIndex += 1;
    } else {
      appendEvent(student.id, attempt.id, 'stage_completed', { stageId: stage.id });
      const isLastStage = attempt.currentStageIndex >= attempt.blueprint.stages.length - 1;
      if (!isLastStage) {
        attempt.currentStageIndex += 1;
        attempt.currentItemIndex = 0;
        const nextStage = attempt.blueprint.stages[attempt.currentStageIndex];
        appendEvent(student.id, attempt.id, 'stage_started', { stageId: nextStage.id, title: nextStage.title });
      } else {
        attempt.currentStageIndex = attempt.blueprint.stages.length; // signals done
      }
    }
    attempt.currentItemStartedAt = new Date().toISOString();
    saveAttempt(attempt);

    return NextResponse.json({ view: buildRuntimeView(attempt, rules) });
  } catch (err) {
    return handleUnexpected(err);
  }
}
