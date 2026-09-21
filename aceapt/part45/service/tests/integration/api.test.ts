import request from 'supertest';
import { resetTestDatabase } from '../testDb';

resetTestDatabase();

// Imported AFTER resetTestDatabase() so the db client opens the fresh file.
// eslint-disable-next-line import/first
import { createApp } from '../../src/app';
// eslint-disable-next-line import/first
import { createSkill, createRelationship, publishPendingChanges } from '../../src/services/graphAdmin.service';
// eslint-disable-next-line import/first
import { evidenceRepository } from '../../src/repositories/studentState.repository';
// eslint-disable-next-line import/first
import { recomputeStudentSkillState } from '../../src/services/studentSkillState.service';

const app = createApp();
const asStudent1 = { Authorization: 'Bearer student_demo_1:student' };
const asStudent2 = { Authorization: 'Bearer student_demo_2:student' };
const asAdmin = { Authorization: 'Bearer admin_1:admin' };

let ratioId: string;
let profitLossId: string;

beforeAll(async () => {
  const ratio = await createSkill({ code: 'QUANT.RATIO', displayName: 'Ratio', domain: 'QUANTITATIVE_APTITUDE', level: 'SKILL' });
  const profitLoss = await createSkill({ code: 'QUANT.PROFIT_LOSS', displayName: 'Profit & Loss', domain: 'QUANTITATIVE_APTITUDE', level: 'SKILL' });
  ratioId = ratio.id;
  profitLossId = profitLoss.id;
  await createRelationship({ fromSkillId: ratioId, toSkillId: profitLossId, relationshipType: 'PREREQUISITE', weight: 0.8, confidence: 'MODERATE', source: 'CURRICULUM' });
  const publishResult = await publishPendingChanges();
  if (!publishResult.published) throw new Error('Test fixture graph failed to publish: ' + JSON.stringify(publishResult.report));

  // Give student_demo_1 some weak evidence on Profit & Loss so gaps/root-cause have something to find.
  for (const isCorrect of [false, false, true, false]) {
    await evidenceRepository.createEvent({ studentId: 'student_demo_1', skillId: profitLossId, eventType: 'PRACTICE', isCorrect, weight: 1, occurredAt: new Date() });
  }
  await recomputeStudentSkillState('student_demo_1', profitLossId);
});

describe('unauthenticated access', () => {
  test('GET /api/skill-graph without a token returns 401', async () => {
    const res = await request(app).get('/api/skill-graph');
    expect(res.status).toBe(401);
  });

  test('GET a student route without a token returns 401 (not 403 — auth precedes ownership)', async () => {
    const res = await request(app).get('/api/students/student_demo_1/skill-graph');
    expect(res.status).toBe(401);
  });
});

describe('global graph reads', () => {
  test('lists published skills', async () => {
    const res = await request(app).get('/api/skill-graph').set(asStudent1);
    expect(res.status).toBe(200);
    expect(res.body.skills.some((s: { code: string }) => s.code === 'QUANT.RATIO')).toBe(true);
  });

  test('returns prerequisites for a skill by its stable code', async () => {
    const res = await request(app).get('/api/skill-graph/QUANT.PROFIT_LOSS/prerequisites').set(asStudent1);
    expect(res.status).toBe(200);
    expect(res.body.prerequisites[0].skill.code).toBe('QUANT.RATIO');
  });

  test('404s for an unknown skill code rather than crashing', async () => {
    const res = await request(app).get('/api/skill-graph/NOT.A.REAL.SKILL').set(asStudent1);
    expect(res.status).toBe(404);
  });
});

describe('student ownership (section 61: student A must never read student B)', () => {
  test('a student can read their own graph', async () => {
    const res = await request(app).get('/api/students/student_demo_1/skill-graph').set(asStudent1);
    expect(res.status).toBe(200);
  });

  test('a student CANNOT read another student\'s graph', async () => {
    const res = await request(app).get('/api/students/student_demo_2/skill-graph').set(asStudent1);
    expect(res.status).toBe(403);
  });

  test('a student CANNOT read another student\'s gaps, priorities, or root-cause either', async () => {
    const gaps = await request(app).get('/api/students/student_demo_2/skill-graph/gaps').set(asStudent1);
    const priorities = await request(app).get('/api/students/student_demo_2/skill-graph/priorities').set(asStudent1);
    const rootCause = await request(app).get('/api/students/student_demo_2/skill-graph/root-cause/QUANT.PROFIT_LOSS').set(asStudent1);
    expect(gaps.status).toBe(403);
    expect(priorities.status).toBe(403);
    expect(rootCause.status).toBe(403);
  });

  test('an admin CAN read any student\'s graph', async () => {
    const res = await request(app).get('/api/students/student_demo_2/skill-graph').set(asAdmin);
    expect(res.status).toBe(200);
  });

  test('gaps reflect real seeded weakness, and root-cause traces it to the real prerequisite', async () => {
    const gaps = await request(app).get('/api/students/student_demo_1/skill-graph/gaps').set(asStudent1);
    expect(gaps.body.gaps.some((g: { code: string }) => g.code === 'QUANT.PROFIT_LOSS')).toBe(true);

    const rootCause = await request(app).get('/api/students/student_demo_1/skill-graph/root-cause/QUANT.PROFIT_LOSS').set(asStudent1);
    expect(rootCause.status).toBe(200);
    expect(rootCause.body.target_skill).toBe('QUANT.PROFIT_LOSS');
    // Ratio has zero evidence for this student, so it should NOT be fabricated as the cause.
    expect(rootCause.body.possible_prerequisite_gap).toBeNull();
    expect(rootCause.body.confidence).toBe('insufficient_evidence');
  });
});

describe('admin authorization (sections 58, 61, 76)', () => {
  test('a student cannot create a skill', async () => {
    const res = await request(app).post('/api/admin/skill-graph/skills').set(asStudent1).send({ code: 'X.Y', displayName: 'Should Fail', domain: 'QUANTITATIVE_APTITUDE', level: 'SKILL' });
    expect(res.status).toBe(403);
  });

  test('a student cannot publish the graph', async () => {
    const res = await request(app).post('/api/admin/skill-graph/publish').set(asStudent1);
    expect(res.status).toBe(403);
  });

  test('an admin can validate the graph and gets zero critical issues on this clean fixture', async () => {
    const res = await request(app).post('/api/admin/skill-graph/validate').set(asAdmin);
    expect(res.status).toBe(200);
    expect(res.body.criticalCount).toBe(0);
  });

  test('an admin creating a relationship with an invalid relationshipType is rejected (400), not silently accepted', async () => {
    const res = await request(app)
      .post('/api/admin/skill-graph/relationships')
      .set(asAdmin)
      .send({ fromSkillId: ratioId, toSkillId: profitLossId, relationshipType: 'MADE_UP_TYPE', source: 'CURRICULUM' });
    expect(res.status).toBe(400);
  });

  test('a duplicate skill code is rejected with 409, not a silent overwrite', async () => {
    const res = await request(app).post('/api/admin/skill-graph/skills').set(asAdmin).send({ code: 'QUANT.RATIO', displayName: 'Duplicate', domain: 'QUANTITATIVE_APTITUDE', level: 'SKILL' });
    expect(res.status).toBe(409);
  });
});

describe('institution/cohort tenant isolation (sections 47, 62)', () => {
  test('an institution_viewer scoped to institution A cannot read institution B\'s cohort', async () => {
    const res = await request(app).get('/api/institutions/institution-b/skill-graph/cohort').set({ Authorization: 'Bearer viewer_1:institution_viewer:institution-a' });
    expect(res.status).toBe(403);
  });

  test('an institution_viewer CAN read their own institution\'s cohort', async () => {
    const res = await request(app).get('/api/institutions/institution-a/skill-graph/cohort').set({ Authorization: 'Bearer viewer_1:institution_viewer:institution-a' });
    expect(res.status).toBe(200);
  });
});
