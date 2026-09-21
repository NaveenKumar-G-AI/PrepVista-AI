import { FAILURE_CATEGORY_LABELS } from '../constants';
import type { FailureCategory, PatternStrength } from '../types';

export interface ActionSpec {
  title: string;
  description: string;
}

export interface RecoveryTemplate {
  primary: ActionSpec;
  supporting: ActionSpec[];
}

// One primary action per failure category, plus at most two supporting ones
// (Section 15: never 15 tasks). Every action targets the specific category —
// no generic "complete 10 courses" filler (Section 16).
export const RECOVERY_TEMPLATES: Record<FailureCategory, RecoveryTemplate> = {
  TECHNICAL_PERFORMANCE: {
    primary: {
      title: 'Role-specific technical interview simulation',
      description:
        'Run a simulated technical round matched to this role category, with structured feedback on what to fix first.',
    },
    supporting: [
      {
        title: 'Review recently missed concepts',
        description: 'Revisit the specific technical concepts that came up in recent technical rounds.',
      },
      {
        title: 'Practice a project deep-dive',
        description: 'Rehearse explaining one flagship project at full technical depth, including trade-offs made.',
      },
    ],
  },
  COMMUNICATION_PERFORMANCE: {
    primary: {
      title: 'Structured communication mock interview',
      description: 'Practice a full round with feedback focused specifically on clarity, pacing, and structure.',
    },
    supporting: [
      {
        title: 'Record a two-minute self-introduction',
        description: 'Record and review a self-introduction for clarity and conciseness.',
      },
      {
        title: 'Practice STAR-format answers',
        description: 'Rehearse two or three recent examples using the Situation-Task-Action-Result structure.',
      },
    ],
  },
  BEHAVIORAL_INTERVIEW: {
    primary: {
      title: 'Behavioral interview simulation',
      description: 'Run a simulated behavioral round with feedback on story structure and specificity.',
    },
    supporting: [
      {
        title: 'Prepare three STAR stories',
        description: 'Draft three concrete stories from recent experience that adapt to common behavioral prompts.',
      },
      {
        title: 'Review common behavioral patterns',
        description: 'Skim the most frequently asked behavioral question types for this role category.',
      },
    ],
  },
  PROJECT_EXPERIENCE_EVIDENCE: {
    primary: {
      title: 'Strengthen the flagship project write-up',
      description: 'Rework one project write-up and demo so its technical depth and impact are immediately clear.',
    },
    supporting: [
      {
        title: 'Add measurable outcomes',
        description: 'Attach concrete numbers or results to project descriptions wherever possible.',
      },
      {
        title: 'Rehearse a five-minute walkthrough',
        description: 'Practice narrating the project end-to-end at interview pace.',
      },
    ],
  },
  ROLE_SPECIFIC_KNOWLEDGE: {
    primary: {
      title: 'Role-specific knowledge assessment',
      description: 'Take a targeted assessment for this role category and build a study plan from the gaps it surfaces.',
    },
    supporting: [
      {
        title: 'Review core role concepts',
        description: 'Revisit the foundational concepts most associated with this role category.',
      },
      {
        title: 'Complete one practice assessment',
        description: 'Finish one more role-specific practice assessment before the next application.',
      },
    ],
  },
  INTERVIEW_PERFORMANCE: {
    primary: {
      title: 'General interview simulation with feedback',
      description: 'Run a full mock interview and get structured feedback across every stage.',
    },
    supporting: [
      {
        title: 'Review notes from the last interview',
        description: 'Look back at what is remembered from recent interviews for repeat friction points.',
      },
      {
        title: 'Practice with a peer or mentor',
        description: 'Get a second live perspective before the next real interview.',
      },
    ],
  },
  APPLICATION_MISMATCH: {
    primary: {
      title: 'Resume alignment review',
      description: 'Check the resume against this role category and tighten the match.',
    },
    supporting: [
      {
        title: 'Tailor keywords to the role',
        description: 'Adjust resume language to reflect the specific role category being targeted.',
      },
      {
        title: 'Get a second resume review',
        description: 'Compare the resume against two recent, similar job descriptions.',
      },
    ],
  },
  TARGET_MISMATCH: {
    primary: {
      title: 'Re-evaluate target role fit',
      description: 'Review whether recent applications actually match the stated target role.',
    },
    supporting: [
      {
        title: 'Compare recent applications to the target',
        description: 'List the last five applications next to the stated target profile.',
      },
      {
        title: 'Shortlist three better-aligned roles',
        description: 'Identify three upcoming opportunities with stronger alignment signals.',
      },
    ],
  },
  OPPORTUNITY_FIT: {
    primary: {
      title: 'Reassess opportunity fit before applying',
      description: 'Check role requirements against the current profile before the next application.',
    },
    supporting: [
      {
        title: 'Build a personal fit checklist',
        description: 'Write down the three or four signals that best predict a good fit.',
      },
      {
        title: 'Prioritize higher-fit opportunities',
        description: 'Rank upcoming opportunities by fit before applying.',
      },
    ],
  },
  ELIGIBILITY_MISMATCH: {
    primary: {
      title: 'Review eligibility criteria before applying',
      description: 'Double-check eligibility requirements against the current profile before the next application.',
    },
    supporting: [
      {
        title: 'Build an eligibility checklist',
        description: 'Create a short checklist of eligibility criteria that are often overlooked.',
      },
      {
        title: 'Filter future opportunities by eligibility',
        description: 'Screen out clearly ineligible opportunities earlier in the search.',
      },
    ],
  },
  PREPARATION_GAP: {
    primary: {
      title: 'Structured preparation sprint',
      description: 'Set a focused preparation plan before the next application in this role category.',
    },
    supporting: [
      {
        title: 'Set a weekly preparation checklist',
        description: 'Break preparation into small, trackable weekly goals.',
      },
      {
        title: 'Schedule a mock interview',
        description: 'Book a mock interview before the next real one.',
      },
    ],
  },
  EXTERNAL_UNKNOWN: {
    primary: {
      title: 'Gather more evidence before acting',
      description:
        'There is not yet enough evidence to target a specific fix — the most useful next step is more information, not more effort in one direction.',
    },
    supporting: [
      {
        title: 'Add recruiter feedback if it arrives',
        description: 'If a specific reason comes back later, add it to this outcome.',
      },
      {
        title: 'Continue applying to well-aligned opportunities',
        description: 'Keep targeting roles that match the profile while more evidence accumulates.',
      },
    ],
  },
};

export function buildFallbackRationale(category: FailureCategory, strength: PatternStrength): string {
  if (category === 'EXTERNAL_UNKNOWN') {
    return 'There is not yet a specific, evidence-backed reason for this outcome, so this plan focuses on gathering more evidence rather than guessing at a cause.';
  }
  const label = FAILURE_CATEGORY_LABELS[category].toLowerCase();
  const strengthPhrase =
    strength === 'repeated_pattern'
      ? 'a repeated pattern'
      : strength === 'emerging_pattern'
        ? 'an emerging pattern'
        : 'direct evidence from this outcome';
  return `Based on ${strengthPhrase} around ${label}, this plan targets that area directly rather than general preparation.`;
}
