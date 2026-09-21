'use strict';

function normalize(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Conservative heuristic: same organization (normalized) plus substantially
 * overlapping title. Flags a candidate for review rather than silently
 * merging - false positives here are worse than the occasional missed
 * duplicate (spec section 56).
 */
function findDuplicate(newOpportunity, existingOpportunities) {
  const org = normalize(newOpportunity.organization);
  const titleWords = new Set(normalize(newOpportunity.title).split(' ').filter((w) => w.length > 2));

  for (const existing of existingOpportunities) {
    if (existing.id === newOpportunity.id) continue;
    if (normalize(existing.organization) !== org) continue;
    const existingWords = new Set(normalize(existing.title).split(' ').filter((w) => w.length > 2));
    const overlap = [...titleWords].filter((w) => existingWords.has(w)).length;
    const union = new Set([...titleWords, ...existingWords]).size || 1;
    const similarity = overlap / union;
    if (similarity >= 0.6) {
      return { duplicateOfId: existing.id, similarity: Math.round(similarity * 100) };
    }
  }
  return null;
}

module.exports = { findDuplicate };
