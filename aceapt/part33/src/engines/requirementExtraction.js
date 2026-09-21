'use strict';

const { findCapabilityByText } = require('../seed/capabilities');

function splitRequirementText(raw) {
  if (!raw) return [];
  return raw
    .split(/\n|,|;|•|·/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const IMPORTANCE_BY_TYPE = {
  required: 'important',
  preferred: 'nice_to_have',
};

/**
 * Turns raw requirement text into structured OpportunityRequirement rows,
 * keeping REQUIRED and PREFERRED strictly separate (spec section 10 - never
 * tell a student they "must" do something that was only ever preferred).
 *
 * Rule-based by default. If an AI provider is configured and available, it
 * gets one narrow job: propose a capability match for requirement text the
 * rule-based matcher left unmapped. It never adds requirements that weren't
 * in the source text, and never decides required vs. preferred or
 * importance - see spec section 65 (NO FABRICATION) and 66 (AI ROLE).
 */
async function extractRequirements({ opportunityId, requiredText, preferredText, coreCapabilityIds = [], aiProvider }) {
  const requirements = [];

  const buildFromList = (items, requirementType) => items.map((sourceText) => {
    const capability = findCapabilityByText(sourceText);
    const importance = capability && requirementType === 'required' && coreCapabilityIds.includes(capability.id)
      ? 'critical'
      : IMPORTANCE_BY_TYPE[requirementType];
    return {
      id: undefined, // assigned by the repository on save
      opportunityId,
      capabilityId: capability ? capability.id : null,
      requirementType,
      importance,
      sourceText,
      confidence: capability ? 'high' : 'low',
    };
  });

  requirements.push(...buildFromList(splitRequirementText(requiredText), 'required'));
  requirements.push(...buildFromList(splitRequirementText(preferredText), 'preferred'));

  if (aiProvider && aiProvider.isAvailable()) {
    const unmapped = requirements.filter((r) => !r.capabilityId);
    if (unmapped.length > 0) {
      try {
        const suggestions = await aiProvider.classifyRequirements(unmapped.map((r) => r.sourceText));
        unmapped.forEach((r, i) => {
          const suggestion = suggestions[i];
          if (suggestion && suggestion.capabilityId) {
            r.capabilityId = suggestion.capabilityId;
            r.confidence = 'medium'; // AI-assisted match, not exact/alias
          }
        });
      } catch (err) {
        // AI assistance is best-effort only - extraction still works without it.
        console.warn('[requirementExtraction] AI classification unavailable:', err.message);
      }
    }
  }

  return requirements;
}

module.exports = { extractRequirements, splitRequirementText };
