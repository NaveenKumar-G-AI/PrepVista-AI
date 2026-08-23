import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { makeTestContext, cleanupTestContext, type TestContext } from "./helpers.js";
import * as companyService from "../src/services/companyService.js";
import * as activityService from "../src/services/activityService.js";
import * as followupService from "../src/services/followupService.js";
import { getRecruiterOpportunities } from "../src/services/opportunityService.js";

let ctx: TestContext;
beforeEach(() => {
  ctx = makeTestContext();
});
afterEach(() => cleanupTestContext(ctx));

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

describe("getRecruiterOpportunities", () => {
  it("returns nothing for an institution with no companies", () => {
    expect(getRecruiterOpportunities(ctx.db, ctx.institutionId)).toEqual([]);
  });

  it("flags an overdue follow-up with real evidence (title, days overdue)", () => {
    const company = companyService.createCompany(ctx.db, ctx.institutionId, ctx.userId, { name: "Acme Corp" }).company;
    followupService.createFollowup(ctx.db, ctx.institutionId, ctx.userId, company.id, {
      title: "Send JD template",
      dueAt: daysAgo(4),
    });

    const insights = getRecruiterOpportunities(ctx.db, ctx.institutionId);
    const overdue = insights.find((i) => i.type === "FOLLOWUP_OVERDUE" && i.company_id === company.id);
    expect(overdue).toBeTruthy();
    expect(overdue!.evidence.oldestOverdueTitle).toBe("Send JD template");
    expect(overdue!.evidence.daysOverdue).toBe(4);
  });

  it("does NOT flag a company with a future-dated follow-up as overdue", () => {
    const company = companyService.createCompany(ctx.db, ctx.institutionId, ctx.userId, { name: "Acme Corp" }).company;
    followupService.createFollowup(ctx.db, ctx.institutionId, ctx.userId, company.id, {
      title: "Upcoming call",
      dueAt: daysFromNow(3),
    });
    const insights = getRecruiterOpportunities(ctx.db, ctx.institutionId);
    expect(insights.find((i) => i.type === "FOLLOWUP_OVERDUE" && i.company_id === company.id)).toBeUndefined();
  });

  it("flags recent contact with nothing scheduled next", () => {
    const company = companyService.createCompany(ctx.db, ctx.institutionId, ctx.userId, { name: "Acme Corp" }).company;
    activityService.logActivity(ctx.db, ctx.institutionId, ctx.userId, company.id, {
      type: "CALL",
      occurredAt: daysAgo(2),
    });
    const insights = getRecruiterOpportunities(ctx.db, ctx.institutionId);
    expect(insights.some((i) => i.type === "NO_NEXT_ACTION" && i.company_id === company.id)).toBe(true);
  });

  it("does NOT flag NO_NEXT_ACTION when a follow-up is already scheduled", () => {
    const company = companyService.createCompany(ctx.db, ctx.institutionId, ctx.userId, { name: "Acme Corp" }).company;
    activityService.logActivity(ctx.db, ctx.institutionId, ctx.userId, company.id, { type: "CALL", occurredAt: daysAgo(2) });
    followupService.createFollowup(ctx.db, ctx.institutionId, ctx.userId, company.id, {
      title: "Next step",
      dueAt: daysFromNow(5),
    });
    const insights = getRecruiterOpportunities(ctx.db, ctx.institutionId);
    expect(insights.find((i) => i.type === "NO_NEXT_ACTION" && i.company_id === company.id)).toBeUndefined();
  });

  it("flags a repeat recruiter (derived from 2x HIRING history) that has gone quiet", () => {
    const company = companyService.createCompany(ctx.db, ctx.institutionId, ctx.userId, { name: "Acme Corp" }).company;
    companyService.changeRelationshipStage(ctx.db, ctx.institutionId, ctx.userId, company.id, "HIRING");
    companyService.changeRelationshipStage(ctx.db, ctx.institutionId, ctx.userId, company.id, "CONTACTED");
    companyService.changeRelationshipStage(ctx.db, ctx.institutionId, ctx.userId, company.id, "HIRING");
    activityService.logActivity(ctx.db, ctx.institutionId, ctx.userId, company.id, { type: "EMAIL", occurredAt: daysAgo(45) });

    const insights = getRecruiterOpportunities(ctx.db, ctx.institutionId);
    const stale = insights.find((i) => i.type === "STALE_REPEAT_RECRUITER" && i.company_id === company.id);
    expect(stale).toBeTruthy();
    expect(stale!.evidence.hiringCycles).toBe(2);
  });

  it("does not flag a non-repeat recruiter as STALE_REPEAT_RECRUITER even if silent for a long time", () => {
    const company = companyService.createCompany(ctx.db, ctx.institutionId, ctx.userId, { name: "Acme Corp" }).company;
    activityService.logActivity(ctx.db, ctx.institutionId, ctx.userId, company.id, { type: "EMAIL", occurredAt: daysAgo(45) });
    const insights = getRecruiterOpportunities(ctx.db, ctx.institutionId);
    expect(insights.find((i) => i.type === "STALE_REPEAT_RECRUITER" && i.company_id === company.id)).toBeUndefined();
  });

  it("sorts CRITICAL/HIGH priority insights ahead of MEDIUM/LOW", () => {
    const a = companyService.createCompany(ctx.db, ctx.institutionId, ctx.userId, { name: "A Co" }).company;
    const b = companyService.createCompany(ctx.db, ctx.institutionId, ctx.userId, { name: "B Co" }).company;
    // b: two overdue follow-ups -> CRITICAL
    followupService.createFollowup(ctx.db, ctx.institutionId, ctx.userId, b.id, { title: "1", dueAt: daysAgo(1) });
    followupService.createFollowup(ctx.db, ctx.institutionId, ctx.userId, b.id, { title: "2", dueAt: daysAgo(2) });
    // a: recent contact, nothing scheduled -> MEDIUM
    activityService.logActivity(ctx.db, ctx.institutionId, ctx.userId, a.id, { type: "CALL", occurredAt: daysAgo(1) });

    const insights = getRecruiterOpportunities(ctx.db, ctx.institutionId);
    expect(insights[0].priority).toBe("CRITICAL");
    expect(insights[0].company_id).toBe(b.id);
  });
});
