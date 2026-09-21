import { describe, expect, it } from 'vitest';
import { canTriggerRecalculation, canViewCohortAggregate, canViewReadiness, type AuthContext } from '../src/api/authorization';

const org1 = 'org_1';
const org2 = 'org_2';

const student: AuthContext = { actorId: 's1', actorRole: 'student', organizationId: org1 };
const trainer: AuthContext = { actorId: 't1', actorRole: 'trainer', organizationId: org1 };
const orgAdmin: AuthContext = { actorId: 'a1', actorRole: 'org_admin', organizationId: org1 };

describe('canViewReadiness', () => {
  it('denies cross-organization access even for staff roles', () => {
    const result = canViewReadiness(orgAdmin, { studentId: 's2', organizationId: org2, isSelf: false });
    expect(result).toBe(false);
  });

  it('allows a student to view only their own readiness', () => {
    expect(canViewReadiness(student, { studentId: 's1', organizationId: org1, isSelf: true })).toBe(true);
    expect(canViewReadiness(student, { studentId: 's2', organizationId: org1, isSelf: false })).toBe(false);
  });

  it('allows staff roles to view any in-org student', () => {
    expect(canViewReadiness(trainer, { studentId: 's2', organizationId: org1, isSelf: false })).toBe(true);
    expect(canViewReadiness(orgAdmin, { studentId: 's2', organizationId: org1, isSelf: false })).toBe(true);
  });
});

describe('canTriggerRecalculation', () => {
  it('denies a student from triggering recalculation for someone else', () => {
    expect(canTriggerRecalculation(student, { organizationId: org1, isSelf: false })).toBe(false);
  });

  it('allows a student to trigger their own recalculation', () => {
    expect(canTriggerRecalculation(student, { organizationId: org1, isSelf: true })).toBe(true);
  });

  it('denies cross-org recalculation even for a trainer', () => {
    expect(canTriggerRecalculation(trainer, { organizationId: org2, isSelf: false })).toBe(false);
  });
});

describe('canViewCohortAggregate', () => {
  it('denies students and trainers', () => {
    expect(canViewCohortAggregate(student, { organizationId: org1 })).toBe(false);
    expect(canViewCohortAggregate(trainer, { organizationId: org1 })).toBe(false);
  });

  it('allows org admins in their own org only', () => {
    expect(canViewCohortAggregate(orgAdmin, { organizationId: org1 })).toBe(true);
    expect(canViewCohortAggregate(orgAdmin, { organizationId: org2 })).toBe(false);
  });
});
