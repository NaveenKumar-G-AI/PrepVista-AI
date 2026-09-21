import { ActionType, Confidence } from '../types';
import { ScoredSignal } from './problemAndPriority';
import { env, usingAiExplanations } from '../config/env';

const PROBLEM_TO_ACTION: Record<string, ActionType> = {
  CONCEPT_GAP: ActionType.LEARN,
  UNSTABLE_KNOWLEDGE: ActionType.REVISE,
  WEAK_EXECUTION: ActionType.PRACTICE,
  SPEED_GAP: ActionType.TIMED_PRACTICE,
  ERROR_PATTERN: ActionType.ERROR_REPAIR,
  MIXED_PERFORMANCE_GAP: ActionType.MIXED_PRACTICE,
  STRATEGY_GAP: ActionType.STRATEGY_TRAINING,
  READY_TO_VERIFY: ActionType.REASSESS,
  STABLE_STRENGTH: ActionType.MAINTAIN,
  REGRESSION: ActionType.RESTORE,
};

const DEFAULT_DURATION: Record<ActionType, number> = {
  [ActionType.LEARN]: 15,
  [ActionType.REVISE]: 12,
  [ActionType.PRACTICE]: 12,
  [ActionType.TIMED_PRACTICE]: 10,
  [ActionType.ERROR_REPAIR]: 8,
  [ActionType.MIXED_PRACTICE]: 10,
  [ActionType.STRATEGY_TRAINING]: 10,
  [ActionType.REASSESS]: 8,
  [ActionType.MAINTAIN]: 0,
  [ActionType.RESTORE]: 12,
};

const SUCCESS_METRIC: Record<ActionType, (skill: string) => string> = {
  [ActionType.LEARN]: (s) => `Correctly apply the right method on 4 of 5 ${s} practice questions`,
  [ActionType.REVISE]: (s) => `Raise ${s} accuracy above 75% across a short review set`,
  [ActionType.PRACTICE]: (s) => `Raise ${s} accuracy above 80%`,
  [ActionType.TIMED_PRACTICE]: () => `≥80% accuracy while meeting the target time per question`,
  [ActionType.ERROR_REPAIR]: () => `Cut the repeated error rate by half`,
  [ActionType.MIXED_PRACTICE]: () => `Maintain ≥80% accuracy once mixed with other topics`,
  [ActionType.STRATEGY_TRAINING]: () => `Improve question-selection and time allocation efficiency`,
  [ActionType.REASSESS]: (s) => `Confirm the ${s} improvement holds under real conditions`,
  [ActionType.MAINTAIN]: (s) => `Hold current ${s} performance with minimal upkeep`,
  [ActionType.RESTORE]: (s) => `Recover ${s} back to its previous performance level`,
};

const VERIFICATION: Record<ActionType, string> = {
  [ActionType.LEARN]: 'Short concept-check quiz',
  [ActionType.REVISE]: 'Spaced review set',
  [ActionType.PRACTICE]: 'Practice-set accuracy check',
  [ActionType.TIMED_PRACTICE]: 'Mini timed assessment',
  [ActionType.ERROR_REPAIR]: 'Targeted error-pattern drill + spot check',
  [ActionType.MIXED_PRACTICE]: 'Mixed mini-assessment',
  [ActionType.STRATEGY_TRAINING]: 'Strategy simulation',
  [ActionType.REASSESS]: 'Feature 6 mini-assessment',
  [ActionType.MAINTAIN]: 'Periodic spot-check only',
  [ActionType.RESTORE]: 'Focused recovery set + mini assessment',
};

const REQUIRED_FEATURE: Record<ActionType, 'FEATURE_5' | 'FEATURE_6'> = {
  [ActionType.LEARN]: 'FEATURE_5',
  [ActionType.REVISE]: 'FEATURE_5',
  [ActionType.PRACTICE]: 'FEATURE_5',
  [ActionType.TIMED_PRACTICE]: 'FEATURE_5',
  [ActionType.ERROR_REPAIR]: 'FEATURE_5',
  [ActionType.MIXED_PRACTICE]: 'FEATURE_5',
  [ActionType.STRATEGY_TRAINING]: 'FEATURE_5',
  [ActionType.REASSESS]: 'FEATURE_6',
  [ActionType.MAINTAIN]: 'FEATURE_5',
  [ActionType.RESTORE]: 'FEATURE_5',
};

export interface InterventionPlan {
  action_type: ActionType;
  duration_minutes: number;
  success_metric: string;
  verification_method: string;
  required_feature: 'FEATURE_5' | 'FEATURE_6';
  confidence: Confidence;
}

// ============================================================================
// InterventionService — §5 / §34
// Turns a scored problem signal into a concrete, boundable intervention.
// ============================================================================
export class InterventionService {
  static selectFor(signal: ScoredSignal): InterventionPlan {
    const actionType = PROBLEM_TO_ACTION[signal.problem_type] ?? ActionType.PRACTICE;
    const isLowConfidence = signal.confidence === Confidence.LOW;

    // §18 CONFIDENCE-AWARE ACTIONS — an uncertain diagnosis gets a short
    // diagnostic instead of a full training path.
    return {
      action_type: actionType,
      duration_minutes: isLowConfidence
        ? Math.min(5, DEFAULT_DURATION[actionType] || 5)
        : DEFAULT_DURATION[actionType],
      success_metric: SUCCESS_METRIC[actionType](signal.skill_name),
      verification_method: isLowConfidence
        ? `Short diagnostic before committing to a longer ${actionType.toLowerCase().replace('_', ' ')} path`
        : VERIFICATION[actionType],
      required_feature: REQUIRED_FEATURE[actionType],
      confidence: signal.confidence,
    };
  }
}

// ============================================================================
// ExplanationService — §14 "Why this?" + §38 AI responsibilities
// AI is used for phrasing only — it never touches scores or thresholds
// (§39). Falls back to a deterministic template when no API key is set, so
// the product is fully explainable with zero configuration.
// ============================================================================
export class ExplanationService {
  static async explain(signal: ScoredSignal, plan: InterventionPlan): Promise<string> {
    if (usingAiExplanations) {
      try {
        return await ExplanationService.explainWithAI(signal, plan);
      } catch (err) {
        console.warn('[ExplanationService] AI explanation failed, using template fallback:', (err as Error).message);
        return ExplanationService.explainWithTemplate(signal);
      }
    }
    return ExplanationService.explainWithTemplate(signal);
  }

  private static async explainWithAI(signal: ScoredSignal, plan: InterventionPlan): Promise<string> {
    const prompt =
      `A student's diagnostic evidence for "${signal.skill_name}" (${signal.category}) shows: ${signal.details} ` +
      `Detected problem type: ${signal.problem_type}. Recommended intervention: ${plan.action_type}. ` +
      `In 1-2 short sentences, written directly to the student ("you"), explain plainly why this specific ` +
      `intervention is the right next step given this evidence. Reference the numbers. No generic advice.`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) throw new Error(`Anthropic API responded ${res.status}`);
    const data: any = await res.json();
    const text = (data.content || [])
      .map((block: any) => (block.type === 'text' ? block.text : ''))
      .join(' ')
      .trim();
    if (!text) throw new Error('Empty AI response');
    return text;
  }

  private static explainWithTemplate(signal: ScoredSignal): string {
    const templates: Record<string, string> = {
      CONCEPT_GAP: `${signal.details} This is a genuine knowledge gap rather than a speed or carelessness issue, so a short concept walkthrough will help more than another timed drill right now.`,
      UNSTABLE_KNOWLEDGE: `${signal.details} The idea is there but not reliable yet — a focused review does more good than fresh material.`,
      WEAK_EXECUTION: `${signal.details} Understanding isn't the blocker here — applying it under normal practice conditions is, so extra reps target that directly.`,
      SPEED_GAP: `${signal.details} Your accuracy is already solid, so the highest-leverage move is training decision speed, not re-learning the concept.`,
      ERROR_PATTERN: `${signal.details} Because the mistakes cluster around one pattern, a targeted repair drill fixes more than broad practice would.`,
      MIXED_PERFORMANCE_GAP: `${signal.details} You can do this in isolation — the gap only shows up once topics are mixed together like the real assessment, so that's what needs practice now.`,
      STRATEGY_GAP: `${signal.details} The issue is which questions to spend time on, not whether you can solve them — so this session trains selection strategy, not raw skill.`,
      READY_TO_VERIFY: `${signal.details} There's enough recent evidence of improvement here that the useful next step is confirming it under real conditions, not more practice.`,
      STABLE_STRENGTH: `${signal.details} This skill is stable, so we're deliberately not scheduling more time here — it would come at the expense of a higher-impact gap.`,
      REGRESSION: `${signal.details} This was previously a strength, so the priority is a short recovery session before it drifts further.`,
    };
    return templates[signal.problem_type] ?? `${signal.details} This intervention targets that evidence directly.`;
  }
}
