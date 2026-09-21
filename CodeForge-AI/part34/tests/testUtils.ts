import { asOrgId, asStudentId, asUserId, type ActorContext } from "../src/domain/types.js";
import { EXAMPLE_ORG_ID, EXAMPLE_ROLE_ID, EXAMPLE_STUDENT_ID } from "../src/integration/adapters/fixtures.js";

export { EXAMPLE_ORG_ID, EXAMPLE_ROLE_ID, EXAMPLE_STUDENT_ID };

export function studentActor(studentId = EXAMPLE_STUDENT_ID): ActorContext {
  return { userId: asUserId(`user_${studentId}`), orgId: EXAMPLE_ORG_ID, roles: ["STUDENT"], studentId };
}

export function trainerActor(): ActorContext {
  return { userId: asUserId("user_trainer_1"), orgId: EXAMPLE_ORG_ID, roles: ["TRAINER"] };
}

export function otherOrgStudentActor(): ActorContext {
  return {
    userId: asUserId("user_other_org_student"),
    orgId: asOrgId("org_other_college"),
    roles: ["STUDENT"],
    studentId: asStudentId("student_other_org"),
  };
}

export function otherStudentInSameOrgActor(): ActorContext {
  return { userId: asUserId("user_other_student"), orgId: EXAMPLE_ORG_ID, roles: ["STUDENT"], studentId: asStudentId("student_other") };
}
