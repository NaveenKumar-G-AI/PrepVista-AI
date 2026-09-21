import { InterventionType } from '../types/intervention';
import { StudentInterventionProfile } from '../types/domain';

const MIN_SAMPLES_FOR_CONCLUSION = 2;

/**
 * Updates a student's adaptive intervention profile after one outcome.
 * Deliberately does NOT draw a "helpful"/"less effective" conclusion until
 * MIN_SAMPLES_FOR_CONCLUSION outcomes exist for that intervention type
 * (Section 35: "do not create permanent conclusions from insufficient evidence").
 */
export function updateProfile(
  profile: StudentInterventionProfile,
  interventionType: InterventionType,
  improved: boolean
): StudentInterventionProfile {
  const stats = [...profile.stats];
  const idx = stats.findIndex((s) => s.interventionType === interventionType);
  const now = new Date().toISOString();

  if (idx >= 0) {
    stats[idx] = {
      ...stats[idx],
      helpfulCount: stats[idx].helpfulCount + (improved ? 1 : 0),
      unhelpfulCount: stats[idx].unhelpfulCount + (improved ? 0 : 1),
      lastOutcomeAt: now,
    };
  } else {
    stats.push({
      interventionType,
      helpfulCount: improved ? 1 : 0,
      unhelpfulCount: improved ? 0 : 1,
      lastOutcomeAt: now,
    });
  }

  return { ...profile, stats };
}

export interface ProfileSummary {
  helpful: { interventionType: InterventionType; helpfulCount: number; unhelpfulCount: number }[];
  lessEffective: { interventionType: InterventionType; helpfulCount: number; unhelpfulCount: number }[];
  insufficientEvidence: InterventionType[];
}

export function summarizeProfile(profile: StudentInterventionProfile): ProfileSummary {
  const helpful: ProfileSummary['helpful'] = [];
  const lessEffective: ProfileSummary['lessEffective'] = [];
  const insufficientEvidence: InterventionType[] = [];

  for (const s of profile.stats) {
    const total = s.helpfulCount + s.unhelpfulCount;
    if (total < MIN_SAMPLES_FOR_CONCLUSION) {
      insufficientEvidence.push(s.interventionType);
      continue;
    }
    if (s.helpfulCount >= s.unhelpfulCount) {
      helpful.push({ interventionType: s.interventionType, helpfulCount: s.helpfulCount, unhelpfulCount: s.unhelpfulCount });
    } else {
      lessEffective.push({ interventionType: s.interventionType, helpfulCount: s.helpfulCount, unhelpfulCount: s.unhelpfulCount });
    }
  }

  return { helpful, lessEffective, insufficientEvidence };
}
