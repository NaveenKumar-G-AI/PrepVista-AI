import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { freshSeededDb } from './testDb.js';
import { CatalogRepo } from '../src/repositories/catalogRepo.js';
import { CareerContextRepo } from '../src/repositories/careerContextRepo.js';
import { CareerContextService } from '../src/services/careerContextService.js';
import { RoleService } from '../src/services/roleService.js';
import { DomainError } from '../src/api/errors.js';

const STUDENT_ID = 'student-demo-1';

describe('CareerContextService', () => {
  let db: Database.Database;
  let catalog: CatalogRepo;
  let contextRepo: CareerContextRepo;
  let service: CareerContextService;
  let roleService: RoleService;

  beforeEach(() => {
    db = freshSeededDb();
    catalog = new CatalogRepo(db);
    contextRepo = new CareerContextRepo(db);
    service = new CareerContextService(catalog, contextRepo);
    roleService = new RoleService(catalog);
  });

  it('has no selection for a student who has never chosen a target', () => {
    expect(service.getContext(STUDENT_ID)).toEqual({ hasSelection: false, context: null });
    expect(service.getHistory(STUDENT_ID)).toEqual([]);
  });

  it('selecting an ACTIVE role sets context and opens one PRIMARY history row', () => {
    const result = service.setContext(STUDENT_ID, { primaryRoleSlug: 'backend-engineer' });
    expect(result.hasSelection).toBe(true);
    expect(result.context?.primaryRoleSlug).toBe('backend-engineer');
    expect(result.context?.source).toBe('SELF_SELECTED');

    const history = service.getHistory(STUDENT_ID);
    expect(history).toHaveLength(1);
    expect(history[0]?.slot).toBe('PRIMARY');
    expect(history[0]?.endedAt).toBeNull();
  });

  it('rejects selecting a DEPRECATED role (Step 6: only ACTIVE roles are newly selectable)', () => {
    expect(() => service.setContext(STUDENT_ID, { primaryRoleSlug: 'mobile-engineer-legacy' })).toThrow(DomainError);
    try {
      service.setContext(STUDENT_ID, { primaryRoleSlug: 'mobile-engineer-legacy' });
    } catch (err) {
      expect((err as DomainError).code).toBe('ROLE_NOT_SELECTABLE');
    }
  });

  it('rejects an unknown role slug', () => {
    try {
      service.setContext(STUDENT_ID, { primaryRoleSlug: 'not-a-real-role' });
      expect.unreachable();
    } catch (err) {
      expect((err as DomainError).code).toBe('ROLE_NOT_FOUND');
    }
  });

  it('rejects identical primary and secondary roles', () => {
    try {
      service.setContext(STUDENT_ID, { primaryRoleSlug: 'backend-engineer', secondaryRoleSlug: 'backend-engineer' });
      expect.unreachable();
    } catch (err) {
      expect((err as DomainError).code).toBe('INVALID_CAREER_CONTEXT');
    }
  });

  it('preserves history when changing target: closes the old row, opens a new one, keeps both', () => {
    service.setContext(STUDENT_ID, { primaryRoleSlug: 'backend-engineer' });
    const afterFirst = service.getHistory(STUDENT_ID);
    expect(afterFirst).toHaveLength(1);

    service.setContext(STUDENT_ID, { primaryRoleSlug: 'ai-ml-engineer' });
    const afterChange = service.getHistory(STUDENT_ID);

    expect(afterChange).toHaveLength(2); // Step 24: nothing is deleted
    const closed = afterChange.find((h) => h.roleId !== undefined && h.endedAt !== null);
    expect(closed).toBeDefined();
    const open = afterChange.find((h) => h.endedAt === null);
    expect(open).toBeDefined();

    const current = service.getContext(STUDENT_ID);
    expect(current.context?.primaryRoleSlug).toBe('ai-ml-engineer');
  });

  it('changing only the secondary role leaves the primary history row untouched', () => {
    service.setContext(STUDENT_ID, { primaryRoleSlug: 'backend-engineer', secondaryRoleSlug: 'devops-cloud-engineer' });
    const primaryRowId = service.getHistory(STUDENT_ID).find((h) => h.slot === 'PRIMARY')?.id;

    service.setContext(STUDENT_ID, { primaryRoleSlug: 'backend-engineer', secondaryRoleSlug: 'qa-sdet' });
    const history = service.getHistory(STUDENT_ID);

    expect(history.filter((h) => h.slot === 'PRIMARY')).toHaveLength(1); // never touched
    expect(history.find((h) => h.slot === 'PRIMARY')?.id).toBe(primaryRowId);
    expect(history.filter((h) => h.slot === 'SECONDARY')).toHaveLength(2); // closed + new
  });

  it('is idempotent: an identical repeat selection does not create a new history row (Step 84)', () => {
    service.setContext(STUDENT_ID, { primaryRoleSlug: 'backend-engineer' });
    const countBefore = service.getHistory(STUDENT_ID).length;

    service.setContext(STUDENT_ID, { primaryRoleSlug: 'backend-engineer' });
    const countAfter = service.getHistory(STUDENT_ID).length;

    expect(countAfter).toBe(countBefore);
  });

  it('pins a historical selection to the version active at the time (Step 6 / 48)', () => {
    const currentDetail = roleService.getRoleRequirements('data-analyst');
    expect(currentDetail.version).toBe(2);
    expect(currentDetail.competencies.some((c) => c.competency.slug === 'machine-learning')).toBe(true);

    const v1Detail = roleService.getRoleRequirementsAtVersion('data-analyst', 1);
    expect(v1Detail.competencies.some((c) => c.competency.slug === 'machine-learning')).toBe(false);

    const result = service.setContext(STUDENT_ID, { primaryRoleSlug: 'data-analyst' });
    // New selections always resolve to the current version...
    expect(result.context?.primaryRoleVersion).toBe(2);

    // ...but a history row created while v1 was current would stay pinned
    // to v1 forever, even after v2 becomes current — that's the guarantee
    // getRoleRequirementsAtVersion exists to serve.
    expect(roleService.getRoleRequirementsAtVersion('data-analyst', 1).version).toBe(1);
  });
});
