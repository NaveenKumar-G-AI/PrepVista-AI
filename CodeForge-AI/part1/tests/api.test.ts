import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type Database from 'better-sqlite3';
import { freshSeededDb } from './testDb.js';
import { buildApp } from '../src/api/app.js';

describe('codeforge API', () => {
  let db: Database.Database;
  let app: Express;

  beforeEach(() => {
    db = freshSeededDb();
    app = buildApp(db);
  });

  describe('authentication', () => {
    it('rejects requests with no student header', async () => {
      const res = await request(app).get('/codeforge/roles');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects an unknown student id', async () => {
      const res = await request(app).get('/codeforge/roles').set('x-student-id', 'does-not-exist');
      expect(res.status).toBe(401);
    });
  });

  describe('catalog reads', () => {
    it('lists only ACTIVE roles', async () => {
      const res = await request(app).get('/codeforge/roles').set('x-student-id', 'student-demo-1');
      expect(res.status).toBe(200);
      expect(res.body.roles).toHaveLength(10);
      expect(res.body.roles.some((r: { slug: string }) => r.slug === 'mobile-engineer-legacy')).toBe(false);
    });

    it('still resolves a DEPRECATED role by direct slug, for historical records (Step 6)', async () => {
      const res = await request(app).get('/codeforge/roles/mobile-engineer-legacy').set('x-student-id', 'student-demo-1');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('DEPRECATED');
    });

    it('returns ROLE_NOT_FOUND for an unknown role', async () => {
      const res = await request(app).get('/codeforge/roles/not-a-role').set('x-student-id', 'student-demo-1');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('ROLE_NOT_FOUND');
    });

    it('exposes no route to create, update, or delete catalog data (Step 49: not exposed at all, not just permission-denied)', async () => {
      const res = await request(app).post('/codeforge/roles').set('x-student-id', 'student-demo-1').send({ name: 'Hacked Role' });
      expect(res.status).toBe(404);
    });
  });

  describe('career context RBAC', () => {
    it('a student can set and read their own career context', async () => {
      const put = await request(app)
        .put('/codeforge/student/career-context')
        .set('x-student-id', 'student-demo-1')
        .send({ primaryRoleSlug: 'backend-engineer' });
      expect(put.status).toBe(200);

      const get = await request(app).get('/codeforge/student/career-context').set('x-student-id', 'student-demo-1');
      expect(get.body.context.primaryRoleSlug).toBe('backend-engineer');
    });

    it("one student's selection is invisible to another student (IDOR check)", async () => {
      await request(app)
        .put('/codeforge/student/career-context')
        .set('x-student-id', 'student-demo-1')
        .send({ primaryRoleSlug: 'backend-engineer' });

      const otherStudent = await request(app).get('/codeforge/student/career-context').set('x-student-id', 'student-demo-2');
      expect(otherStudent.body.hasSelection).toBe(false);
    });

    it('rejects an unrecognized field in the update payload, including an attempted studentId override', async () => {
      const res = await request(app)
        .put('/codeforge/student/career-context')
        .set('x-student-id', 'student-demo-1')
        .send({ primaryRoleSlug: 'backend-engineer', studentId: 'student-demo-2' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_CAREER_CONTEXT');
    });

    it('rejects selecting a deprecated role through the API', async () => {
      const res = await request(app)
        .put('/codeforge/student/career-context')
        .set('x-student-id', 'student-demo-1')
        .send({ primaryRoleSlug: 'mobile-engineer-legacy' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ROLE_NOT_SELECTABLE');
    });
  });

  describe('tenant isolation (Step 50 / 78)', () => {
    it('a student can read their own institution role variants', async () => {
      const demoInstitute = db.prepare("select id from institution where slug = 'demo-institute-of-technology'").get() as { id: string };
      const res = await request(app)
        .get(`/codeforge/institutions/${demoInstitute.id}/role-variants`)
        .set('x-student-id', 'student-demo-1'); // belongs to demo-institute-of-technology
      expect(res.status).toBe(200);
      expect(res.body.variants.length).toBeGreaterThan(0);
    });

    it('a cross-tenant request gets the same not-found response as a nonexistent institution', async () => {
      const demoInstitute = db.prepare("select id from institution where slug = 'demo-institute-of-technology'").get() as { id: string };

      const crossTenant = await request(app)
        .get(`/codeforge/institutions/${demoInstitute.id}/role-variants`)
        .set('x-student-id', 'student-demo-3'); // belongs to northbridge-college, not demo-institute
      const nonexistent = await request(app)
        .get('/codeforge/institutions/00000000-0000-0000-0000-000000000000/role-variants')
        .set('x-student-id', 'student-demo-3');

      expect(crossTenant.status).toBe(404);
      expect(nonexistent.status).toBe(404);
      expect(crossTenant.body.error.code).toBe(nonexistent.body.error.code);
    });
  });

  describe('search and compare', () => {
    it('search surfaces roles by shared technology', async () => {
      const res = await request(app).get('/codeforge/roles/search?q=python').set('x-student-id', 'student-demo-1');
      const slugs = res.body.results.map((r: { slug: string }) => r.slug);
      expect(slugs).toContain('backend-engineer');
      expect(slugs).toContain('data-scientist');
    });

    it('compare returns shared and unique competencies for two real roles', async () => {
      const res = await request(app)
        .get('/codeforge/roles/compare?a=software-engineer&b=ai-ml-engineer')
        .set('x-student-id', 'student-demo-1');
      expect(res.status).toBe(200);
      const programming = res.body.competencies.find((c: { slug: string }) => c.slug === 'programming');
      expect(programming.shared).toBe(true);
    });
  });
});
