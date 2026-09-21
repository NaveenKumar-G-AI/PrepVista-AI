import {
  SelectionContext,
  NextBestChallenge,
  SelectionAuditRecord,
  CandidateScoreBreakdown,
  PathIntent,
  StudentModel,
} from '../types';
import { DEFAULT_WEIGHTS_V1, applyIntentBias } from '../config/selectionWeights';
import {
  applyHardConstraints,
  applyPrerequisiteFilter,
  applyAvailabilityFilter,
  applyRepetitionFilter,
} from './filters';
import { prioritizeSkills } from './pathIntent';
import { computeTargetDifficulty } from './difficultyAdaptation';
import { scoreCandidate } from './scoring';
import { EnginePorts } from '../integration/ports';

export const SELECTOR_VERSION = 'selector-v1';

export interface SelectionResult {
  nextBestChallenge: NextBestChallenge | null;
  audit: SelectionAuditRecord;
}

function countConsecutive(evidence: { outcome: string }[], outcome: string): number {
  let n = 0;
  for (let i = evidence.length - 1; i >= 0; i--) {
    if (evidence[i].outcome === outcome) n++;
    else break;
  }
  return n;
}

function buildSelectionReason(intent: PathIntent, targetSkillId: string | undefined, student: StudentModel): string {
  const skillLabel = targetSkillId ?? 'general progression';
  switch (intent) {
    case 'DIAGNOSTIC':
      return `Confidence in ${skillLabel} is currently low — this challenge is chosen to reduce that uncertainty rather than assume strength or weakness.`;
    case 'REMEDIATION':
      return `Recent evidence shows a gap in ${skillLabel}. This challenge holds the surrounding difficulty steady and isolates that specific weak point.`;
    case 'REINFORCEMENT':
      return `${skillLabel} was previously strong but hasn't been demonstrated recently — this is a compact check to confirm it's still solid.`;
    case 'TRANSFER':
      return `${skillLabel} is well-established in familiar contexts — this challenge tests whether the underlying concept transfers to a new one.`;
    case 'RETENTION_CHECK':
      return `${skillLabel} shows early signs of regression after a long gap — a short check before deciding whether remediation is needed.`;
    case 'ROLE_ASSESSMENT':
      return `Selected to directly reflect ${student.targetRole ?? 'your target role'}'s expectations.`;
    default:
      return `Builds on demonstrated strength in ${skillLabel} with a moderate step up in difficulty.`;
  }
}

export async function selectNextChallenge(
  studentId: string,
  ctx: SelectionContext,
  ports: EnginePorts
): Promise<SelectionResult> {
  const timestamp = new Date().toISOString();
  const student = await ports.studentSkillModel.getStudentModel(studentId);

  // --- Human override short-circuit (spec: "Human Override") ---------------
  const override = await ports.curriculum.getActiveManualOverride(studentId);
  if (override) {
    const selected: NextBestChallenge = {
      challengeId: override.challengeId,
      selectionReason: `Instructor override: ${override.reason}`,
      primaryLearningTarget: 'instructor-specified',
      supportingTargets: [],
      difficultyFit: 1,
      uncertaintyValue: 0,
      roleRelevance: 1,
      confidence: 1,
      selectorVersion: SELECTOR_VERSION,
      pathIntent: 'ROLE_ASSESSMENT',
    };
    const audit: SelectionAuditRecord = {
      studentId,
      studentModelVersion: student.studentModelVersion,
      selectorVersion: SELECTOR_VERSION,
      weightsVersion: 'n/a-override',
      candidateSet: [override.challengeId],
      hardConstraintsApplied: ['INSTRUCTOR_OVERRIDE'],
      stageTrace: [],
      rankingFactors: [],
      selected,
      timestamp,
    };
    await ports.auditLog.recordSelection(audit);
    return { nextBestChallenge: selected, audit };
  }

  // --- Candidate pool --------------------------------------------------------
  const pool = await ports.challengeCatalog.getCandidateChallenges({
    role: student.targetRole,
    curriculumTags: student.curriculumConstraints?.requiredCurriculumTags,
  });
  const health = await ports.challengeCatalog.getChallengeHealth(pool.map((c) => c.challengeId));

  const stageTrace: SelectionAuditRecord['stageTrace'] = [];
  const record = (r: { stage: string; candidatesIn: number; candidatesOut: number }) => stageTrace.push(r);

  let candidates = pool;
  const hard = applyHardConstraints(candidates, student, ctx, health);
  record(hard);
  candidates = hard.survivors;

  const prereq = applyPrerequisiteFilter(candidates, student);
  record(prereq);
  candidates = prereq.survivors;

  const avail = applyAvailabilityFilter(candidates, health);
  record(avail);
  candidates = avail.survivors;

  const repetition = applyRepetitionFilter(candidates, student, ctx);
  record(repetition);
  candidates = repetition.survivors;

  const hardConstraintsApplied = [
    'status=ACTIVE',
    'language',
    'role',
    'curriculum',
    'health',
    'prerequisites',
    'repetition',
  ];

  if (candidates.length === 0) {
    const audit: SelectionAuditRecord = {
      studentId,
      studentModelVersion: student.studentModelVersion,
      selectorVersion: SELECTOR_VERSION,
      weightsVersion: DEFAULT_WEIGHTS_V1.version,
      candidateSet: pool.map((c) => c.challengeId),
      hardConstraintsApplied,
      stageTrace,
      rankingFactors: [],
      selected: null,
      noEligibleReason: 'No candidates survived hard constraints, prerequisites, or the repetition policy.',
      timestamp,
    };
    await ports.auditLog.recordSelection(audit);
    return { nextBestChallenge: null, audit };
  }

  // --- Determine what we're targeting next (spec: skill-gap targeting, uncertainty reduction) ---
  const priorities = prioritizeSkills(student);
  const top = priorities[0];
  const intent: PathIntent = top ? top.suggestedIntent : 'PROGRESSION';
  const targetSkillId: string | undefined = top ? top.skillId : undefined;

  const evidenceForTarget = targetSkillId ? student.evidenceBySkill[targetSkillId] || [] : [];
  const consecutiveFailures = countConsecutive(evidenceForTarget, 'FAILURE');
  const consecutiveSuccesses = countConsecutive(evidenceForTarget, 'SUCCESS');

  const targetDifficulty = computeTargetDifficulty(evidenceForTarget, intent, consecutiveFailures, consecutiveSuccesses);
  const weights = applyIntentBias(DEFAULT_WEIGHTS_V1, intent);

  // --- Score & rank ------------------------------------------------------------
  const recentFamilies = student.completedChallenges.slice(-5).map((c) => c.challengeFamily);
  const recentTransferGroups = new Set(student.completedChallenges.slice(-5).map((c) => c.transferGroup));

  // Score every surviving candidate, not just ones tagged with the #1
  // priority skill. skillGapFit/uncertaintyReduction/transferValue/etc.
  // each already look up whichever skill is relevant to THAT candidate,
  // so an irrelevant candidate naturally scores low without needing a
  // hard pre-filter — and a good candidate for the #2-priority skill
  // stays reachable when the #1 priority skill has no strong match in
  // this round's pool (see tests/goldenScenario.test.ts, the
  // differentiated-profiles case).
  const scored: CandidateScoreBreakdown[] = candidates.map((c) =>
    scoreCandidate(c, student, weights, targetDifficulty, ctx, health, recentFamilies, recentTransferGroups)
  );
  scored.sort((a, b) => b.totalScore - a.totalScore);

  const winnerScore = scored[0];
  const winner = candidates.find((c) => c.challengeId === winnerScore.challengeId)!;

  const nextBestChallenge: NextBestChallenge = {
    challengeId: winner.challengeId,
    selectionReason: buildSelectionReason(intent, targetSkillId, student),
    primaryLearningTarget: winner.primarySkillId,
    supportingTargets: winner.supportingSkillIds,
    difficultyFit: winnerScore.components.difficultyFit,
    uncertaintyValue: winnerScore.components.uncertaintyReduction,
    roleRelevance: winnerScore.components.roleRelevance,
    confidence: targetSkillId ? student.skills[targetSkillId]?.confidence ?? 0.5 : 0.5,
    selectorVersion: SELECTOR_VERSION,
    pathIntent: intent,
  };

  const audit: SelectionAuditRecord = {
    studentId,
    studentModelVersion: student.studentModelVersion,
    selectorVersion: SELECTOR_VERSION,
    weightsVersion: weights.version,
    candidateSet: pool.map((c) => c.challengeId),
    hardConstraintsApplied,
    stageTrace,
    rankingFactors: scored.slice(0, 5),
    selected: nextBestChallenge,
    timestamp,
  };

  await ports.auditLog.recordSelection(audit);
  return { nextBestChallenge, audit };
}
