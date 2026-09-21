import type { AssistanceIssueType, StepResult } from '../problemBank/types.js';

export interface AssistanceClassificationInput {
  /** The deterministic validator's verdict on the student's last attempt, if any. */
  lastResult?: StepResult;
  /** Optional free-text note from the student, e.g. "I know the formula but don't know what to plug in." */
  studentNote?: string;
}

/**
 * Rule-based classification of *what kind* of help a student needs
 * (Sections 35-38). This runs with zero AI dependency (Section 66: the
 * feature must work without an LLM) and is what the AI hint generator is
 * later told to focus on - it decides *what* to help with, never *whether*
 * the student is right (that is validateStep's job, Section 57/63).
 *
 * Keyword rules are intentionally simple and reviewable; this is meant to
 * be a fast, transparent triage step; not a subtle NLP model.
 */
export function classifyAssistanceNeed(input: AssistanceClassificationInput): AssistanceIssueType {
  const note = input.studentNote?.toLowerCase().trim() ?? '';

  if (note) {
    if (/plug ?in|which (values|numbers)|what goes where|substitut/.test(note)) return 'INTERPRETATION';
    if (/arithmetic|calculat|silly mistake|maths? wrong|kept getting/.test(note)) return 'CALCULATION';
    if (/no idea|don'?t know what to do|stuck|where (do|to) (i )?start/.test(note)) return 'STRATEGY';
    if (/formula|equation|which relationship|which method/.test(note)) return 'FORMULA';
    if (/unit|convert|hours|km|seconds|minutes/.test(note)) return 'UNIT';
    if (/why|what does this mean|don'?t understand the concept/.test(note)) return 'CONCEPT';
    if (/check|make sense|is this right|verify/.test(note)) return 'VERIFICATION';
  }

  // Fall back to inferring from the validator's own verdict when there is no
  // (or no useful) free-text note - Section 38's "I have no idea" default.
  switch (input.lastResult) {
    case 'UNIT_ERROR':
      return 'UNIT';
    case 'FORMAT_ERROR':
      return 'INTERPRETATION';
    case 'PARTIALLY_CORRECT':
      return 'CALCULATION';
    case 'INCOMPLETE':
      return 'STRATEGY';
    default:
      return 'STRATEGY';
  }
}
