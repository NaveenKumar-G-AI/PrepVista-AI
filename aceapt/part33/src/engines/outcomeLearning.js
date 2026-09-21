'use strict';

const confidenceByCount = (n) => (n >= 5 ? 'HIGH' : n >= 3 ? 'MEDIUM' : 'LOW');

/**
 * Detects recurring bottlenecks from a student's recorded outcomes. Never
 * claims a definitive pattern from a tiny sample - every message states the
 * sample size it's based on (spec section 49: "Based on 3 opportunities",
 * not "Your success rate is 33% - definitive").
 */
function detectPatterns(outcomes) {
  const rejections = outcomes.filter((o) => o.outcome === 'rejected' && o.skillTag);
  const groups = new Map();
  for (const o of rejections) {
    const key = `${o.stageReached}::${o.skillTag}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  }

  const bottlenecks = [];
  for (const [key, group] of groups.entries()) {
    if (group.length >= 2) {
      const [stageReached, skillTag] = key.split('::');
      bottlenecks.push({
        stageReached,
        skillTag,
        occurrences: group.length,
        sampleSize: outcomes.length,
        confidence: confidenceByCount(group.length),
        message: `Across ${outcomes.length} tracked opportunities, ${group.length} rejections trace back to ${skillTag.replace(/_/g, ' ')} at the ${stageReached} stage.`,
      });
    }
  }
  bottlenecks.sort((a, b) => b.occurrences - a.occurrences);

  let strength = null;
  if (outcomes.length >= 3) {
    const pastScreeningRate = outcomes.filter((o) => o.stageReached !== 'applied').length / outcomes.length;
    if (pastScreeningRate >= 0.66) {
      strength = { message: `Based on ${outcomes.length} opportunities, you consistently progress past the initial screening stage.`, sampleSize: outcomes.length };
    }
  }

  return { bottlenecks, strength };
}

module.exports = { detectPatterns };
