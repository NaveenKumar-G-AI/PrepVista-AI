import { logger } from '../utils/logger';

export const ANALYTICS_EVENTS = {
  SKILL_GRAPH_VIEWED: 'skill_graph_viewed',
  SKILL_NODE_OPENED: 'skill_node_opened',
  SKILL_RELATIONSHIP_OPENED: 'skill_relationship_opened',
  SKILL_PATH_EXPLORED: 'skill_path_explored',
  SKILL_GAP_VIEWED: 'skill_gap_viewed',
  SKILL_RECOMMENDATION_CLICKED: 'skill_recommendation_clicked',
  SKILL_LEARNING_STARTED: 'skill_learning_started',
  SKILL_FILTER_USED: 'skill_filter_used',
  SKILL_PREREQUISITE_VIEWED: 'skill_prerequisite_viewed',
  SKILL_DEPENDENT_VIEWED: 'skill_dependent_viewed',
} as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

/**
 * Section 70/72: track *decision-relevant* events, not vanity counters.
 * This is a thin logging shim — wire it to ACEAPT's real analytics
 * pipeline (Segment/Amplitude/internal) by replacing the body of `track`.
 */
export function track(event: AnalyticsEventName, properties: Record<string, unknown> = {}) {
  logger.info('analytics_event', { event, ...properties });
}
