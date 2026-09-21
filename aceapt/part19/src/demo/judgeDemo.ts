// ============================================================================
// Judge demo — runs the exact scenario from the brief:
//
//   DAY 1:  Percentage mastered
//   DAY 7:  Recall — strong
//   DAY 21: Mixed question — weak → retention risk detected
//           → reactivation → transfer verification → stable retention
//
// A FakeClock lets "7 days later" / "21 days later" happen instantly instead
// of making you actually wait three weeks to watch a demo run.
//
//   npm run demo
// ============================================================================

import { randomUUID } from 'node:crypto';
import { RetentionService } from '../services/RetentionService';
import {
  InMemoryKnowledgeStateRepository,
  InMemoryRetrievalAttemptRepository,
  InMemoryRecallSessionRepository,
  InMemoryReactivationSessionRepository,
  InMemoryConceptDependencyRepository,
} from '../repositories/memory/InMemoryRepositories';
import {
  MockMasteryPort,
  MockQuestionPort,
  MockReadinessPort,
  MockInterventionPort,
  MockReasoningPort,
} from '../integration/featurePorts';
import { EventBus } from '../events/EventBus';
import { DeterministicFallbackProvider } from '../ai/AIContentProvider';
import { ContextExposure } from '../domain/types';

class FakeClock {
  private current: Date;
  constructor(start: Date) {
    this.current = start;
  }
  now = () => this.current.toISOString();
  advanceDays(days: number) {
    this.current = new Date(this.current.getTime() + days * 86_400_000);
  }
}

function rule(char = '-', n = 64) {
  console.log(char.repeat(n));
}
function step(label: string) {
  console.log(`\n${label}`);
  rule();
}
function ctx(partial: Partial<ContextExposure>): ContextExposure {
  return { templateId: 'tmpl_1', difficultyBand: 'medium', method: 'direct', topicWrapper: 'shopping', timed: false, ...partial };
}

async function main() {
  const studentId = 'student_demo_1';
  const conceptId = 'percentages';

  const clock = new FakeClock(new Date('2026-01-01T09:00:00.000Z'));
  const masteryPort = new MockMasteryPort();
  const eventBus = new EventBus();

  eventBus.on('WEAKENING_DETECTED', e => console.log(`   ⚠  WEAKENING_DETECTED — ${(e.payload?.rationale as string[]).join(' ')}`));
  eventBus.on('REACTIVATION_STARTED', () => console.log('   ↻  REACTIVATION_STARTED'));
  eventBus.on('TRANSFER_VERIFIED', () => console.log('   ✓  TRANSFER_VERIFIED'));
  eventBus.on('KNOWLEDGE_STABILIZED', () => console.log('   ★  KNOWLEDGE_STABILIZED'));

  const service = new RetentionService({
    knowledgeStateRepo: new InMemoryKnowledgeStateRepository(),
    attemptRepo: new InMemoryRetrievalAttemptRepository(),
    recallSessionRepo: new InMemoryRecallSessionRepository(),
    reactivationSessionRepo: new InMemoryReactivationSessionRepository(),
    conceptDependencyRepo: new InMemoryConceptDependencyRepository(),
    masteryPort,
    questionPort: new MockQuestionPort(),
    readinessPort: new MockReadinessPort(),
    interventionPort: new MockInterventionPort(),
    reasoningPort: new MockReasoningPort(),
    aiProvider: new DeterministicFallbackProvider(),
    eventBus,
    clock: clock.now,
    idGenerator: randomUUID,
  });

  rule('=');
  console.log('ACEAPT AI — Feature 19 — Judge Demo');
  rule('=');

  step('DAY 1 — Student masters Percentages (Feature 14 hands off to Feature 19)');
  masteryPort.set(studentId, conceptId, { masteredAt: clock.now(), masterySuccessRate: 0.95 });
  let stateNow = await service.onConceptMastered(studentId, conceptId);
  console.log(`Stage: ${stateNow.stage} | Risk: ${stateNow.riskState} | Strength: ${stateNow.strengthBand}`);

  clock.advanceDays(7);
  step('DAY 7 — Quick recall check');
  let started = await service.startRecallSession(studentId, [conceptId], 'today_memory_check');
  let result = await service.submitRetrievalAttempt(started.session.id, {
    conceptId,
    mode: 'micro',
    correct: true,
    latencyMs: 4200,
    hintsUsed: 0,
    explanationRequested: false,
    context: ctx({ templateId: 'pct_tmpl_1' }),
  });
  console.log(`Recall: correct | Stage: ${result.knowledgeState.stage} | Risk: ${result.knowledgeState.riskState} | Strength: ${result.knowledgeState.strengthBand}`);

  clock.advanceDays(14); // now day 21
  step('DAY 21 — Mixed retention check (percentages shows up unlabeled, different method)');
  started = await service.startRecallSession(studentId, [conceptId], 'mixed_retention');
  result = await service.submitRetrievalAttempt(started.session.id, {
    conceptId,
    mode: 'mixed',
    correct: false,
    latencyMs: 15800,
    hintsUsed: 1,
    explanationRequested: true,
    context: ctx({ templateId: 'pct_tmpl_4', method: 'algebraic', topicWrapper: 'finance' }),
  });
  console.log(`Recall: WRONG | Stage: ${result.knowledgeState.stage} | Risk: ${result.knowledgeState.riskState} | Strength: ${result.knowledgeState.strengthBand}`);
  if (result.decayRationale.length) console.log(`Why: ${result.decayRationale.join(' ')}`);

  if (result.weakeningDetected || result.reactivationRecommended) {
    step('ACEAPT: retention risk detected → starting reactivation');
    const reactivation = await service.startReactivation(studentId, conceptId);
    console.log(`Level ${reactivation.session.currentLevel} (recall prompt): "${reactivation.contentText}"`);

    step('Reactivation — level 1 recall prompt: student struggles again');
    let stepResult = await service.submitReactivationStep(reactivation.session.id, 'repair', false, {
      latencyMs: 9000, hintsUsed: 0, explanationRequested: false, context: ctx({ templateId: 'pct_tmpl_2', topicWrapper: 'sports' }),
    });
    console.log(`→ escalating to level ${stepResult.session.currentLevel} (${stepResult.action.kind === 'repair_step' ? stepResult.action.stepKind : ''}): "${stepResult.contentText}"`);

    step('Reactivation — level 2 small hint: student succeeds');
    stepResult = await service.submitReactivationStep(reactivation.session.id, 'repair', true, {
      latencyMs: 7000, hintsUsed: 1, explanationRequested: false, context: ctx({ templateId: 'pct_tmpl_2', topicWrapper: 'sports' }),
    });
    console.log(`→ repaired. Next: ${stepResult.action.kind}`);

    step('Similar question: student succeeds');
    stepResult = await service.submitReactivationStep(reactivation.session.id, 'similar', true, {
      latencyMs: 6000, hintsUsed: 0, explanationRequested: false, context: ctx({ templateId: 'pct_tmpl_3', topicWrapper: 'travel' }),
    });
    console.log(`→ Next: ${stepResult.action.kind}`);

    step('Transfer question: student succeeds');
    stepResult = await service.submitReactivationStep(reactivation.session.id, 'transfer', true, {
      latencyMs: 8000, hintsUsed: 0, explanationRequested: false, context: ctx({ templateId: 'pct_tmpl_5', difficultyBand: 'hard', method: 'algebraic', topicWrapper: 'finance' }),
    });
    console.log(`Reactivation outcome: ${stepResult.session.outcome}`);
  }

  step('Final knowledge state');
  const finalStates = await service.listKnowledgeStates(studentId);
  const final = finalStates.find(s => s.conceptId === conceptId)!;
  console.log(`Stage: ${final.stage} | Risk: ${final.riskState} | Strength: ${final.strengthBand} (sufficiency ${final.evidenceSufficiency})`);

  step('Knowledge Health Dashboard');
  console.log(await service.getKnowledgeHealthDashboard(studentId));

  step('Observability');
  console.log(await service.getObservability(studentId));

  rule('=');
  console.log('ACEAPT does not only teach.');
  console.log('ACEAPT verifies whether knowledge remains available over time.');
  rule('=');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
