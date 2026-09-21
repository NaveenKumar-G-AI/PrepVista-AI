import { store } from '../data/store';
import { seedDemoData, DEMO_STUDENT_ID } from '../data/seed';
import { handleAttempt, startIntervention, reassessIntervention } from '../engine/orchestrator';
import { explainDifferently } from '../engine/explainDifferently';
import { deconstructError } from '../engine/errorDeconstruction';
import { generateTargetedQuestion } from '../engine/questionGenerator';
import { getJourneyState } from '../integration/feature15Client';
import { getMasteryState } from '../integration/feature14Client';
import { AttemptEvidence, SolutionStep } from '../types/evidence';
import { ROOT_CAUSE_LABELS } from '../types/rootCause';
import { PROFIT_LOSS_SKILL_ID } from '../data/skillGraph';

export interface DemoStep {
  stage: 'BEFORE' | 'DIAGNOSE' | 'INTERVENE' | 'VERIFY' | 'UPDATED_STATE' | 'UPDATED_JOURNEY';
  title: string;
  detail: unknown;
}

/**
 * Runs the exact scenario described in Section 48: a Profit & Loss reverse
 * problem, wrong because of a strategy error (not a concept or calculation
 * error), routed through Strategy Selection Training -> Contrast Example ->
 * Guided Problem -> Independent Problem -> Transfer Challenge, with Feature
 * 14 and Feature 15 both receiving real evidence at the end.
 */
export async function runDemoScenario(): Promise<DemoStep[]> {
  const steps: DemoStep[] = [];
  store.reset();
  seedDemoData();

  // ---- BEFORE ----------------------------------------------------------
  const solutionPath: SolutionStep[] = [
    { stepNumber: 1, description: 'Identified this as a profit-percentage reverse problem.', stepType: 'concept', correct: true },
    { stepNumber: 2, description: 'Chose to multiply the selling price by (1 + profit%) to find the cost price.', stepType: 'strategy', correct: false, expected: 'Divide the selling price by (1 + profit%).' },
    { stepNumber: 3, description: 'Carried out the (incorrectly-chosen) calculation without arithmetic slips.', stepType: 'calculation', correct: true },
  ];

  const beforeAttempt: AttemptEvidence = {
    studentId: DEMO_STUDENT_ID,
    skillId: PROFIT_LOSS_SKILL_ID,
    microSkillId: 'ms_reverse',
    questionId: 'demo_q_before',
    correct: false,
    responseTimeSeconds: 58,
    expectedTimeSeconds: 55,
    difficulty: 'medium',
    questionType: 'standard',
    hintsUsed: 0,
    solutionPath,
    prerequisiteSkillIds: [],
  };

  steps.push({
    stage: 'BEFORE',
    title: 'Student attempts a Profit & Loss reverse problem and gets it wrong',
    detail: {
      question: 'A shopkeeper sold a bicycle for ₹660, making a profit of 20%. What was the cost price?',
      studentApproach: solutionPath,
      correctAnswer: '₹550',
      studentAnswer: '₹792 (660 × 1.20 — multiplied instead of divided)',
    },
  });

  // ---- DIAGNOSE ----------------------------------------------------------
  const { diagnosis, intervention, recommendation } = await handleAttempt(beforeAttempt);

  const errorBreakdown = await deconstructError(solutionPath, diagnosis.primary.cause);

  steps.push({
    stage: 'DIAGNOSE',
    title: 'Diagnostic engine analyzes the evidence',
    detail: {
      uiPanel: diagnosis.uiPanel,
      primaryCause: { cause: diagnosis.primary.cause, label: ROOT_CAUSE_LABELS[diagnosis.primary.cause], confidence: diagnosis.primary.confidence, evidence: diagnosis.primary.evidenceSummary },
      secondaryCauses: diagnosis.secondary.map((c) => ({ cause: c.cause, label: ROOT_CAUSE_LABELS[c.cause], confidence: c.confidence })),
      errorDeconstruction: errorBreakdown,
    },
  });

  if (!intervention || !recommendation) {
    steps.push({ stage: 'INTERVENE', title: 'No intervention needed', detail: 'Attempt was diagnosed as correct or evidence was insufficient.' });
    return steps;
  }

  // ---- INTERVENE ----------------------------------------------------------
  startIntervention(intervention.id);

  const strategyExplanation = await explainDifferently({
    skillLabel: PROFIT_LOSS_SKILL_ID,
    microSkillLabel: 'Reverse problems (find CP/SP from %)',
    rootCauseLabel: ROOT_CAUSE_LABELS[diagnosis.primary.cause],
    previousStyles: [],
  });

  const contrastQuestion = generateTargetedQuestion('ms_reverse', 'easy', []);
  const guidedQuestion = generateTargetedQuestion('ms_reverse', 'medium', contrastQuestion ? [contrastQuestion.templateId] : []);
  const independentQuestion = generateTargetedQuestion(
    'ms_reverse',
    'medium',
    [contrastQuestion?.templateId, guidedQuestion?.templateId].filter(Boolean) as string[]
  );

  steps.push({
    stage: 'INTERVENE',
    title: `Recommended intervention: ${recommendation.label}`,
    detail: {
      rootCause: ROOT_CAUSE_LABELS[recommendation.rootCause],
      escalationLevel: recommendation.escalationLevel,
      rationale: recommendation.rationale,
      sequence: [
        { step: 'Strategy clarification', content: strategyExplanation.text, style: strategyExplanation.styleLabel },
        { step: 'Contrast example (strategy check, no calculation required)', content: contrastQuestion },
        { step: 'Guided problem', content: guidedQuestion },
        { step: 'Independent problem', content: independentQuestion },
      ],
    },
  });

  // ---- VERIFY ----------------------------------------------------------
  // Student now applies the correct strategy independently...
  const independentAttempt: AttemptEvidence = {
    studentId: DEMO_STUDENT_ID,
    skillId: PROFIT_LOSS_SKILL_ID,
    microSkillId: 'ms_reverse',
    questionId: independentQuestion?.templateId ?? 'demo_q_independent',
    correct: true,
    responseTimeSeconds: 50,
    expectedTimeSeconds: 55,
    difficulty: 'medium',
    questionType: 'standard',
    hintsUsed: 0,
    prerequisiteSkillIds: [],
  };

  // ...and then succeeds on an unfamiliar-framing transfer challenge.
  const transferSucceeded = true;

  const verify = await reassessIntervention(intervention.id, independentAttempt, { correct: transferSucceeded });

  steps.push({
    stage: 'VERIFY',
    title: 'Reassessment + transfer challenge',
    detail: {
      independentProblem: { correct: independentAttempt.correct },
      transferChallenge: {
        question: 'An online seller lists a phone case at ₹342 after pricing it for a 14% profit over cost. What did the case cost the seller?',
        correct: transferSucceeded,
      },
      effectiveness: verify?.effectiveness,
    },
  });

  // ---- UPDATED STATE / UPDATED JOURNEY ----------------------------------------------------------
  const finalMastery = getMasteryState(DEMO_STUDENT_ID, PROFIT_LOSS_SKILL_ID);
  steps.push({
    stage: 'UPDATED_STATE',
    title: 'Feature 14 receives the new evidence',
    detail: { masteryUpdate: verify?.masteryUpdate, currentState: finalMastery },
  });

  const finalJourney = getJourneyState(DEMO_STUDENT_ID);
  steps.push({
    stage: 'UPDATED_JOURNEY',
    title: 'Feature 15 replans the learning journey',
    detail: { journeyUpdate: verify?.journeyUpdate, currentJourney: finalJourney },
  });

  return steps;
}

/* CLI entry point: `npm run demo` inside /server */
if (require.main === module) {
  runDemoScenario()
    .then((steps) => {
      for (const step of steps) {
        // eslint-disable-next-line no-console
        console.log(`\n=== ${step.stage}: ${step.title} ===`);
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(step.detail, null, 2));
      }
      process.exit(0);
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Demo scenario failed:', err);
      process.exit(1);
    });
}
