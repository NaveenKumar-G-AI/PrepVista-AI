/**
 * Analytics event names (§149) — kept as a single source of truth so nothing
 * accidentally introduces a near-duplicate event name. Re-exports the type
 * from ports.ts for convenience.
 */
import type { AnalyticsEventName } from './ports';

export const ANALYTICS_EVENTS: readonly AnalyticsEventName[] = [
  'decision_started',
  'confidence_recorded',
  'option_eliminated',
  'partial_progress_recorded',
  'action_selected',
  'guess_made',
  'informed_guess_recorded',
  'blind_guess_recorded',
  'skip_selected',
  'return_later',
  'answer_changed',
  'answer_kept',
  'decision_completed',
  'decision_reviewed',
  'confidence_calibration_updated',
  'decision_insight_generated',
] as const;

export type { AnalyticsEventName };
