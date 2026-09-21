import type { Domain, EvidenceConfidence, SkillState } from '../api/types';

export const DOMAIN_META: Record<Domain, { label: string; short: string; text: string; bg: string; bar: string }> = {
  QUANTITATIVE_APTITUDE: { label: 'Quantitative', short: 'Quant', text: 'text-quant', bg: 'bg-quant-soft', bar: 'bg-quant' },
  LOGICAL_REASONING: { label: 'Logical', short: 'Logical', text: 'text-logic', bg: 'bg-logic-soft', bar: 'bg-logic' },
  VERBAL_APTITUDE: { label: 'Verbal', short: 'Verbal', text: 'text-verbal', bg: 'bg-verbal-soft', bar: 'bg-verbal' },
};

export const STATE_META: Record<SkillState, { label: string; text: string; bg: string; bar: string }> = {
  UNKNOWN: { label: 'Not yet evaluated', text: 'text-ink-soft', bg: 'bg-ink-soft/10', bar: 'bg-ink-soft/40' },
  DEVELOPING: { label: 'Developing', text: 'text-warn', bg: 'bg-warn-soft', bar: 'bg-warn' },
  STRONG: { label: 'Strong', text: 'text-verbal', bg: 'bg-verbal-soft', bar: 'bg-verbal' },
  MASTERED: { label: 'Mastered', text: 'text-verbal', bg: 'bg-verbal-soft', bar: 'bg-verbal' },
  MAINTENANCE: { label: 'Needs a refresh', text: 'text-focus', bg: 'bg-focus-soft', bar: 'bg-focus' },
};

export const CONFIDENCE_LABEL: Record<EvidenceConfidence, string> = {
  NONE: 'No evidence yet',
  LOW: 'Limited evidence',
  MODERATE: 'Moderate evidence',
  HIGH: 'Strong evidence base',
};

export const RELATIONSHIP_SENTENCE: Record<string, (a: string, b: string) => string> = {
  PREREQUISITE: (a, b) => `${a} is a prerequisite/supporting skill for ${b}.`,
  DEPENDS_ON: (a, b) => `${b} depends on ${a}.`,
  RELATED_TO: (a, b) => `${a} and ${b} are related and often practiced together.`,
  BUILDS: (a, b) => `Practicing ${a} helps build ${b}.`,
  TRANSFER_TO: (a, b) => `Skill built in ${a} tends to transfer into ${b}.`,
  PART_OF: (a, b) => `${a} is one specific type of ${b}.`,
  COMMON_ERROR_SOURCE: (a, b) => `Mistakes in ${a} are a common source of errors in ${b}.`,
};

export function formatCapability(capability: number | null): string {
  return capability === null ? '—' : `${Math.round(capability)}%`;
}
