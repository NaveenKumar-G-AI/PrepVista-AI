import { DetectedProblem, InterventionCandidate, InterventionType, ProblemCategory } from '../domain/types';

// Only lists candidates this prototype can actually execute
// (see IMPLEMENTED_INTERVENTION_TYPES in domain/types.ts).
const CANDIDATE_MAP: Partial<Record<ProblemCategory, InterventionType[]>> = {
  SPEED_GAP: ['TIMED_DRILL', 'MICRO_ASSESSMENT'],
  CONCEPT_GAP: ['CONCEPT_RETEACH', 'WORKED_EXAMPLE', 'GUIDED_PRACTICE'],
  CALCULATION_GAP: ['TARGETED_PRACTICE', 'GUIDED_PRACTICE', 'MICRO_ASSESSMENT'],
  RETENTION_GAP: ['SPACED_REVIEW', 'MICRO_ASSESSMENT'],
  TRANSFER_GAP: ['TRANSFER_PRACTICE']
};

function rationaleFor(type: InterventionType, problem: DetectedProblem): string {
  switch (type) {
    case 'TIMED_DRILL':
      return 'Directly practices the skill under the same time pressure where the gap shows up.';
    case 'MICRO_ASSESSMENT':
      return 'A short, unaided check to confirm the gap is real before committing more time.';
    case 'CONCEPT_RETEACH':
      return 'Rebuilds the underlying idea before asking for more practice.';
    case 'WORKED_EXAMPLE':
      return 'Shows the full reasoning chain once, as a lighter-touch alternative to a full reteach.';
    case 'GUIDED_PRACTICE':
      return 'Lets the student apply the concept with scaffolding available if they get stuck.';
    case 'TARGETED_PRACTICE':
      return 'Isolates the calculation step so execution mistakes surface and get corrected.';
    case 'SPACED_REVIEW':
      return 'Re-activates the skill after a delay, which is what retention gaps respond to.';
    case 'TRANSFER_PRACTICE':
      return 'Exposes the student to varied formats so the skill generalises beyond familiar questions.';
    default:
      return `Addresses the detected ${problem.category.toLowerCase().replace(/_/g, ' ')}.`;
  }
}

export function generateCandidates(problem: DetectedProblem): InterventionCandidate[] {
  const types = CANDIDATE_MAP[problem.category] ?? [];
  return types.map(type => ({ type, problemId: problem.id, rationale: rationaleFor(type, problem) }));
}
