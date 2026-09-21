/**
 * Growth insights — natural-language explanations of evidence-backed growth
 * (section 44-47, 81-82). AI may *phrase* an insight; it may never
 * originate the facts inside one. Every insight that reaches a student or
 * instructor has passed src/insights/insight-schema.ts validation against
 * the evidence/skills/events that were actually supplied to the model.
 */

export type TimeWindowLabel = 'recent' | 'short_term' | 'medium_term' | 'long_term' | 'all_time';

export interface TimeWindow {
  label: TimeWindowLabel;
  startTimestamp: string;
  endTimestamp: string;
}

export interface GrowthInsight {
  type: 'growth_insight';
  title: string;
  summary: string;
  evidenceRefs: string[];
  skills: string[];
  confidence: import('./skill-state.js').ConfidenceLevel;
  timeWindow: TimeWindow;
  /** "ai" if an AI provider phrased this, "deterministic" if template-generated because AI was unavailable or failed validation. */
  generatedBy: 'ai' | 'deterministic';
  modelVersion: string;
}
