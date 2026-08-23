// services/signals/audience.ts
//
// Sections 46/47 — the same underlying event can matter differently to
// each role. This is the single place that decides who sees a signal and
// how much of it they see, so "never leak a TPO-only signal to students"
// and "never expose institutional risk to students" are enforced once,
// not scattered across every API route and UI component.

import type { Audience, ProactiveSignal } from './types';

export interface AudienceView {
  visible: boolean;
  title: string;
  summary: string;
  showEvidence: boolean;
  showRecommendedAction: boolean;
}

export function renderForAudience(signal: ProactiveSignal, audience: Audience): AudienceView {
  if (!signal.audiences.includes(audience)) {
    return { visible: false, title: '', summary: '', showEvidence: false, showRecommendedAction: false };
  }

  switch (audience) {
    case 'STUDENT':
      // Students get their own situation in plain terms — never
      // institutional framing, never other students' data, never the raw
      // evidence counts that belong to the TPO view (sections 36/37).
      return { visible: true, title: signal.title, summary: signal.summary, showEvidence: false, showRecommendedAction: false };

    case 'MANAGEMENT':
      // Strategic framing, not the operational blow-by-blow — evidence
      // yes, but no snooze/acknowledge workflow, no per-student detail
      // (sections 43/73).
      return { visible: true, title: signal.title, summary: signal.summary, showEvidence: true, showRecommendedAction: false };

    case 'TPO':
    default:
      // TPO is the operational owner — full evidence and the recommended
      // next step (section 47).
      return { visible: true, title: signal.title, summary: signal.summary, showEvidence: true, showRecommendedAction: true };
  }
}

export function filterSignalsForAudience(signals: ProactiveSignal[], audience: Audience): ProactiveSignal[] {
  return signals.filter((s) => s.audiences.includes(audience));
}
