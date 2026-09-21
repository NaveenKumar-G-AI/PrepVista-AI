import { CAP_APPLIED, CAP_COMMUNICATION, CAP_DECISION, CAP_FOUNDATIONS, CAP_TRANSFER, getCapabilityLabel } from '@/lib/content/targets';
import type { NextBestAction } from '@/lib/db/schema';

// NOTE on responsibility separation (spec §26): this module intentionally
// does NOT implement adaptive learning content or a curriculum — it only
// answers "which intervention type addresses this bottleneck," which is the
// minimum Feature 31 needs to recommend a next step and hand off to the real
// ADAPT engine. `recommend()` is the seam: swap its body for a call to
// ADAPT's real API and every caller (path-engine, the complete route) is
// unaffected.

const INTERVENTIONS: Record<string, { title: string; reason: string }> = {
  [CAP_FOUNDATIONS]: { title: 'Foundations Refresher', reason: 'revisit core fundamentals before your next simulation' },
  [CAP_APPLIED]: { title: 'Applied Problem-Solving Drills', reason: 'practice applying fundamentals to realistic, concrete problems' },
  [CAP_TRANSFER]: { title: 'Targeted Transfer Intervention', reason: 'practice recognizing familiar patterns inside unfamiliar, modified problems under a time limit' },
  [CAP_DECISION]: { title: 'Structured Decision-Making Practice', reason: 'practice triaging under time pressure using a simple strong/adequate/weak framework' },
  [CAP_COMMUNICATION]: { title: 'Technical Communication Practice', reason: 'practice concisely explaining an approach and its trade-offs' },
};

export function recommend(capabilityId: string | null): NextBestAction {
  if (!capabilityId) {
    return {
      title: 'Attempt a Higher-Level Simulation',
      reason: 'No material bottleneck was detected this round — a more difficult simulation level will keep sharpening your readiness signal.',
      capabilityId: null,
    };
  }
  const cfg = INTERVENTIONS[capabilityId] ?? INTERVENTIONS[CAP_FOUNDATIONS];
  return {
    title: cfg.title,
    reason: `Your current bottleneck is ${getCapabilityLabel(capabilityId)} — ${cfg.reason} before re-simulating.`,
    capabilityId,
  };
}
