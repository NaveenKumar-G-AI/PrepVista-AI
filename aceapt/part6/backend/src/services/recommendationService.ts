import { Difficulty, PracticeRecommendation, RiskArea, SkillPerformance } from '../domain/types';
import { feature5Adapter } from '../adapters/feature5Adapter';
import { PracticeSessionRequest } from '../domain/types';

const MAX_RECOMMENDATIONS = 3;

// computeRiskAreas lives in reportService.ts, not here - building a RiskArea needs
// per-question skill + time-investment-flag + error-classification data all at once
// (to set dominantErrorType and timeRelated accurately), and reportService is the
// one place that already has all three in scope after orchestrating the other services.

function nextTargetDifficulty(current: SkillPerformance): Difficulty {
  // Rebuild fundamentals for a critical gap; push the growth edge for a milder risk.
  if (current.label === 'CRITICAL') return 'MEDIUM';
  return 'MEDIUM_PLUS';
}

export function buildRecommendations(riskAreas: RiskArea[], skillPerformance: SkillPerformance[]): PracticeRecommendation[] {
  if (riskAreas.length === 0) {
    // No risk areas - still give a forward-looking recommendation rather than nothing (section 35: always answer "what next").
    const hardestAttempted = [...skillPerformance].sort((a, b) => b.accuracyPct - a.accuracyPct)[0];
    if (!hardestAttempted) return [];
    return [
      {
        priority: 'LOW',
        domain: hardestAttempted.domain,
        topic: hardestAttempted.topic,
        skill: hardestAttempted.skill,
        targetDifficulty: 'HARD',
        timeIssue: false,
        objective: `No significant risk areas this attempt - push into harder ${hardestAttempted.skill.replace(/-/g, ' ')} questions to keep extending the ceiling.`,
        suggestedQuestionCount: 6,
      },
    ];
  }

  const skillByKey = new Map(skillPerformance.map((s) => [`${s.topic}::${s.skill}`, s]));

  return riskAreas.slice(0, MAX_RECOMMENDATIONS).map((risk) => {
    const skillPerf = risk.skill ? skillByKey.get(`${risk.topic}::${risk.skill}`) : undefined;
    const targetDifficulty = skillPerf ? nextTargetDifficulty(skillPerf) : 'MEDIUM';
    const timeNote = risk.timeRelated ? ' with a strict per-question timer to rebuild pacing' : '';
    const errorNote = risk.dominantErrorType ? ` (recent errors lean ${risk.dominantErrorType.replace(/_/g, ' ').toLowerCase()})` : '';

    return {
      priority: risk.severity === 'HIGH' ? 'HIGH' : risk.severity === 'MEDIUM' ? 'MEDIUM' : 'LOW',
      domain: risk.domain,
      topic: risk.topic,
      skill: risk.skill,
      targetDifficulty,
      errorPattern: risk.dominantErrorType,
      timeIssue: risk.timeRelated,
      objective: `Targeted ${targetDifficulty.replace('_', ' ').toLowerCase()} practice on ${(risk.skill ?? risk.topic).replace(/-/g, ' ')}${timeNote}${errorNote}.`,
      suggestedQuestionCount: risk.severity === 'HIGH' ? 12 : 8,
    };
  });
}

export async function handOffTopRecommendation(
  studentId: string,
  assessmentId: string,
  recommendations: PracticeRecommendation[]
) {
  if (recommendations.length === 0) return null;
  const request: PracticeSessionRequest = {
    studentId,
    recommendation: recommendations[0],
    sourceAssessmentId: assessmentId,
  };
  return feature5Adapter.requestPractice(request);
}
