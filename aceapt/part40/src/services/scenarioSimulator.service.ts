import { PoolClient } from 'pg';
import { ConfidenceLevel } from '../types/feature40.types';
import { getRoleEvolution } from './roleEvolution.service';
import * as feature37 from '../integrations/feature37.adapter';
import { narrateCareerScenario } from '../ai/prompts';

export type ScenarioType = 'AI_AUTOMATION_INCREASE' | 'TECH_DECLINE' | 'CLOUD_IMPORTANCE_RISES' | 'DEMAND_SHIFT' | 'NEW_ROLE_EMERGES';

const SCENARIO_TITLES: Record<ScenarioType, string> = {
  AI_AUTOMATION_INCREASE: 'If AI automation increases',
  TECH_DECLINE: 'If a core technology in your stack declines',
  CLOUD_IMPORTANCE_RISES: 'If cloud deployment becomes even more important',
  DEMAND_SHIFT: 'If demand for this role shifts',
  NEW_ROLE_EMERGES: 'If a new adjacent role category emerges',
};

const SCENARIO_ASSUMPTIONS: Record<ScenarioType, string> = {
  AI_AUTOMATION_INCREASE: 'AI-assistable tasks in this role become substantially more automated over the next 1-2 years.',
  TECH_DECLINE: "A technology you currently have evidence in continues its declining market trend.",
  CLOUD_IMPORTANCE_RISES: 'Cloud deployment experience becomes an even more common baseline expectation for this role.',
  DEMAND_SHIFT: 'Overall market demand for this exact role category cools relative to adjacent roles.',
  NEW_ROLE_EMERGES: 'A new role category emerges that combines skills from your current target with an adjacent domain.',
};

/**
 * This is scenario planning, never prophecy (spec ??43). Task/skill impact
 * comes from the role's already-computed AI-impact breakdown and the
 * student's real evidence -- never invented per scenario.
 */
export async function generateCareerScenario(
  client: PoolClient,
  studentId: string,
  roleId: string,
  roleTitle: string,
  scenarioType: ScenarioType,
  period: string
): Promise<{ id: string; title: string; assumptions: string; taskImpact: string[]; skillImpact: string[]; studentPosition: string; studentRisk: string; studentOpportunity: string; adaptation: string; confidence: ConfidenceLevel; narrative: string }> {
  const evolution = await getRoleEvolution(client, roleId, period);
  const evidenceMap = await feature37.getEvidenceMap(client, studentId);

  let taskImpact: string[] = [];
  let skillImpact: string[] = [];
  let studentRisk: string;
  let studentOpportunity: string;
  let adaptation: string;

  if (!evolution) {
    taskImpact = [];
    skillImpact = [];
    studentRisk = 'Insufficient market data to assess risk for this scenario.';
    studentOpportunity = 'Insufficient market data to assess opportunity for this scenario.';
    adaptation = 'Build market data for this role before relying on scenario planning.';
  } else {
    switch (scenarioType) {
      case 'AI_AUTOMATION_INCREASE': {
        taskImpact = evolution.aiImpact.aiAssistedTasks;
        skillImpact = evolution.aiImpact.humanCriticalTasks.concat(evolution.aiImpact.aiComplementarySkills);
        const coveredHumanCritical = evolution.aiImpact.humanCriticalTasks.filter((t) => evidenceMap.has(slugify(t))).length;
        studentRisk = evolution.aiImpact.aiAssistedTasks.length > 0
          ? `Your evidence overlaps with ${evolution.aiImpact.aiAssistedTasks.filter((t) => evidenceMap.has(slugify(t))).length} of ${evolution.aiImpact.aiAssistedTasks.length} currently AI-assistable task areas.`
          : 'No specific AI-assistable task overlap detected in your current evidence.';
        studentOpportunity = `You have evidence in ${coveredHumanCritical} of ${evolution.aiImpact.humanCriticalTasks.length || 'the'} human-critical task area(s) for this role.`;
        adaptation = coveredHumanCritical > 0
          ? 'Continue building depth in human-critical and AI-complementary areas -- they are your strongest hedge.'
          : 'Consider building at least one piece of evidence in a human-critical task area as a hedge.';
        break;
      }
      case 'TECH_DECLINE': {
        const decliningEvidenceSkills = Array.from(evidenceMap.values()).map((e) => e.skillName);
        taskImpact = [];
        skillImpact = decliningEvidenceSkills.slice(0, 5);
        studentRisk = 'Review src/services/skillTrend for any DECLINING classification among your evidenced skills before treating this as a live risk.';
        studentOpportunity = 'Durable and growing skills in your evidence remain unaffected by a single technology\'s decline.';
        adaptation = 'Diversify evidence across more than one technology where a core skill is showing decline signals.';
        break;
      }
      case 'CLOUD_IMPORTANCE_RISES':
      case 'DEMAND_SHIFT':
      case 'NEW_ROLE_EMERGES':
      default: {
        taskImpact = evolution.aiImpact.newResponsibilities;
        skillImpact = evolution.emerging.split(', ').filter(Boolean);
        studentRisk = 'Limited current evidence in newly emerging areas for this role.';
        studentOpportunity = 'Early evidence in emerging areas tends to be scarce market-wide, so modest investment can stand out.';
        adaptation = 'Treat emerging-area evidence as exploratory, not urgent, until signal strength increases.';
        break;
      }
    }
  }

  const studentPosition = `You currently hold evidence in ${evidenceMap.size} skill area(s) relevant to ${roleTitle}.`;
  const narrated = await narrateCareerScenario({
    scenarioTitle: SCENARIO_TITLES[scenarioType], assumptions: SCENARIO_ASSUMPTIONS[scenarioType],
    studentPosition, studentRisk, studentOpportunity,
  });

  const confidence: ConfidenceLevel = evolution?.meta.confidence ?? 'UNKNOWN';

  const { rows } = await client.query(
    `INSERT INTO career_scenarios (student_id, target_role_id, scenario_type, title, assumptions, task_impact,
       skill_impact, student_position, student_risk, student_opportunity, adaptation, confidence)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11,$12) RETURNING id`,
    [studentId, roleId, scenarioType, SCENARIO_TITLES[scenarioType], SCENARIO_ASSUMPTIONS[scenarioType],
      JSON.stringify(taskImpact), JSON.stringify(skillImpact), studentPosition, studentRisk, studentOpportunity, adaptation, confidence]
  );

  return {
    id: rows[0].id, title: SCENARIO_TITLES[scenarioType], assumptions: SCENARIO_ASSUMPTIONS[scenarioType],
    taskImpact, skillImpact, studentPosition, studentRisk, studentOpportunity, adaptation, confidence,
    narrative: narrated.text,
  };
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

export async function listScenarios(client: PoolClient, studentId: string) {
  const { rows } = await client.query(
    `SELECT id, scenario_type, title, assumptions, task_impact, skill_impact, student_position,
            student_risk, student_opportunity, adaptation, confidence, created_at
     FROM career_scenarios WHERE student_id = $1 ORDER BY created_at DESC LIMIT 10`,
    [studentId]
  );
  return rows;
}
