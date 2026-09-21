import { PoolClient } from 'pg';
import { getOpenFutureGaps } from './futureGap.service';
import { writeOutboxEvent } from '../integrations/outbox';

/**
 * Spec ??40 "Test This Career": generates a real task list from the role's
 * OWN highest-priority gap rather than a fixed generic checklist -- so two
 * students testing different roles (or the same role at different times) get
 * different, grounded experiments.
 */
export async function startCareerExperiment(client: PoolClient, studentId: string, roleId: string, roleTitle: string, durationDays = 14) {
  const gaps = await getOpenFutureGaps(client, studentId, roleId);
  const topGap = gaps[0];

  const tasks = [
    { title: 'Small project', detail: topGap ? `Build a small project that specifically exercises ${topGap.skillName}.` : `Build a small project representative of core ${roleTitle} work.` },
    { title: 'Skill challenge', detail: topGap ? `Complete a timed practice challenge focused on ${topGap.skillName}.` : `Complete a timed practice challenge in a core skill for ${roleTitle}.` },
    { title: 'Real-world task', detail: `Find and attempt one real task or open-source issue typical of ${roleTitle} work.` },
    { title: 'Self-reflection', detail: 'Write a short reflection: what energized you, what drained you, what surprised you.' },
    { title: 'Evidence assessment', detail: 'Review what you produced against the role\'s current market expectations.' },
  ];

  const { rows } = await client.query(
    `INSERT INTO career_experiments (student_id, role_id, status, duration_days, tasks)
     VALUES ($1,$2,'ACTIVE',$3,$4::jsonb) RETURNING id, started_at`,
    [studentId, roleId, durationDays, JSON.stringify(tasks)]
  );

  return { id: rows[0].id, startedAt: rows[0].started_at, durationDays, tasks, targetedGap: topGap ? { skillName: topGap.skillName, severity: topGap.severity } : null };
}

export async function completeCareerExperiment(
  client: PoolClient,
  studentId: string,
  experimentId: string,
  reflection: string,
  interestRating: number, // 1-5
  difficultyRating: number // 1-5
) {
  const { rows } = await client.query(
    `SELECT ce.*, r.title AS role_title FROM career_experiments ce JOIN roles r ON r.id = ce.role_id
     WHERE ce.id = $1 AND ce.student_id = $2`,
    [experimentId, studentId]
  );
  if (rows.length === 0) throw new Error('Experiment not found');
  const experiment = rows[0];

  const gaps = await getOpenFutureGaps(client, studentId, experiment.role_id);
  const marketAlignmentGood = gaps.filter((g) => g.severity === 'CRITICAL').length === 0;

  // Deterministic fit classification (spec: never a black-box "you're 87%
  // suited for this"). High interest + manageable difficulty + reasonable
  // market alignment => STRONG_FIT; any one strongly negative signal pulls it
  // down; genuinely mixed signals are reported as such rather than forced
  // into a bucket.
  let fitResult: string;
  if (interestRating >= 4 && difficultyRating <= 3 && marketAlignmentGood) fitResult = 'STRONG_FIT';
  else if (interestRating <= 2 || difficultyRating >= 5) fitResult = 'WEAK_FIT';
  else if (interestRating >= 3 && difficultyRating <= 4) fitResult = 'MODERATE_FIT';
  else fitResult = 'INCONCLUSIVE';

  await client.query(
    `UPDATE career_experiments SET status = 'COMPLETED', reflection = $3, fit_result = $4,
       evidence_generated = $5::jsonb, completed_at = now() WHERE id = $1 AND student_id = $2`,
    [experimentId, studentId, reflection, fitResult, JSON.stringify({ interestRating, difficultyRating })]
  );

  await writeOutboxEvent(client, {
    eventType: 'FEATURE40.CAREER_EXPERIMENT.COMPLETED',
    targetFeature: 'FEATURE36',
    studentId,
    payload: { experimentId, roleId: experiment.role_id, roleTitle: experiment.role_title, fitResult },
  });

  return {
    fitResult,
    nextRecommendation:
      fitResult === 'STRONG_FIT'
        ? `Consider making ${experiment.role_title} a primary target -- your experiment signals a strong match.`
        : fitResult === 'WEAK_FIT'
          ? `Consider exploring an adjacent role -- this experiment suggests ${experiment.role_title} may not be the best fit right now.`
          : `Consider a second, longer experiment before deciding on ${experiment.role_title}.`,
  };
}

export async function listExperiments(client: PoolClient, studentId: string) {
  const { rows } = await client.query(
    `SELECT ce.id, ce.status, ce.duration_days, ce.tasks, ce.reflection, ce.fit_result, ce.started_at, ce.completed_at,
            r.title AS role_title
     FROM career_experiments ce JOIN roles r ON r.id = ce.role_id
     WHERE ce.student_id = $1 ORDER BY ce.started_at DESC`,
    [studentId]
  );
  return rows;
}
