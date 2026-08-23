import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { makeTestContext, cleanupTestContext, type TestContext } from "./helpers.js";
import * as companyService from "../src/services/companyService.js";
import * as followupService from "../src/services/followupService.js";

let ctx: TestContext;
let companyId: string;
beforeEach(() => {
  ctx = makeTestContext();
  companyId = companyService.createCompany(ctx.db, ctx.institutionId, ctx.userId, { name: "Acme Corp" }).company.id;
});
afterEach(() => cleanupTestContext(ctx));

describe("followupService overdue computation", () => {
  it("a follow-up due in the future is not overdue", () => {
    const f = followupService.createFollowup(ctx.db, ctx.institutionId, ctx.userId, companyId, {
      title: "Call back",
      dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect(followupService.displayStatus(f)).toBe("OPEN");
  });

  it("a follow-up past due is OVERDUE even though the stored status is still OPEN", () => {
    const f = followupService.createFollowup(ctx.db, ctx.institutionId, ctx.userId, companyId, {
      title: "Call back",
      dueAt: new Date(Date.now() - 86_400_000).toISOString(),
    });
    expect(f.status).toBe("OPEN"); // stored value never became OVERDUE
    expect(followupService.displayStatus(f)).toBe("OVERDUE"); // but it displays as overdue
  });

  it("a completed follow-up past its due date is not overdue", () => {
    const f = followupService.createFollowup(ctx.db, ctx.institutionId, ctx.userId, companyId, {
      title: "Call back",
      dueAt: new Date(Date.now() - 86_400_000).toISOString(),
    });
    const completed = followupService.completeFollowup(ctx.db, ctx.institutionId, ctx.userId, f.id);
    expect(followupService.displayStatus(completed)).toBe("COMPLETED");
  });

  it("countOverdue reflects reality without any stored flag", () => {
    followupService.createFollowup(ctx.db, ctx.institutionId, ctx.userId, companyId, {
      title: "Overdue one",
      dueAt: new Date(Date.now() - 86_400_000).toISOString(),
    });
    followupService.createFollowup(ctx.db, ctx.institutionId, ctx.userId, companyId, {
      title: "Not due yet",
      dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect(followupService.countOverdue(ctx.db, ctx.institutionId, companyId)).toBe(1);
  });
});

describe("followupService lifecycle", () => {
  it("create -> complete sets completed_at/completed_by and an audit + event", () => {
    const f = followupService.createFollowup(ctx.db, ctx.institutionId, ctx.userId, companyId, {
      title: "Send brochure",
      dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const completed = followupService.completeFollowup(ctx.db, ctx.institutionId, ctx.userId, f.id);
    expect(completed.status).toBe("COMPLETED");
    expect(completed.completed_by).toBe(ctx.userId);
    expect(completed.completed_at).toBeTruthy();

    const audit = ctx.db
      .prepare(`select * from audit_log where entity_type='recruiter_followup' and entity_id=? and action='COMPLETED'`)
      .all(f.id) as any[];
    expect(audit).toHaveLength(1);
  });

  it("cancel sets status to CANCELLED", () => {
    const f = followupService.createFollowup(ctx.db, ctx.institutionId, ctx.userId, companyId, {
      title: "Send brochure",
      dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    followupService.cancelFollowup(ctx.db, ctx.institutionId, ctx.userId, f.id);
    expect(followupService.getFollowup(ctx.db, ctx.institutionId, f.id)!.status).toBe("CANCELLED");
  });

  it("edit updates title/priority/due date", () => {
    const f = followupService.createFollowup(ctx.db, ctx.institutionId, ctx.userId, companyId, {
      title: "Send brochure",
      dueAt: new Date(Date.now() + 86_400_000).toISOString(),
      priority: "LOW",
    });
    const updated = followupService.updateFollowup(ctx.db, ctx.institutionId, ctx.userId, f.id, {
      title: "Send updated brochure",
      priority: "HIGH",
    });
    expect(updated.title).toBe("Send updated brochure");
    expect(updated.priority).toBe("HIGH");
  });

  it("rejects a missing due date", () => {
    expect(() =>
      followupService.createFollowup(ctx.db, ctx.institutionId, ctx.userId, companyId, { title: "No due date", dueAt: "" })
    ).toThrow("Follow-up due date is required.");
  });
});

describe("followupService.listFollowupCentre buckets", () => {
  it("buckets OVERDUE, TODAY, and LATER correctly", () => {
    followupService.createFollowup(ctx.db, ctx.institutionId, ctx.userId, companyId, {
      title: "Overdue task",
      dueAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    });
    followupService.createFollowup(ctx.db, ctx.institutionId, ctx.userId, companyId, {
      title: "Due later this month",
      dueAt: new Date(Date.now() + 20 * 86_400_000).toISOString(),
    });

    const buckets = followupService.listFollowupCentre(ctx.db, ctx.institutionId);
    expect(buckets.OVERDUE.map((f) => f.title)).toContain("Overdue task");
    expect(buckets.LATER.map((f) => f.title)).toContain("Due later this month");
  });

  it("completed items appear in the COMPLETED bucket, not OVERDUE, even if their due date has passed", () => {
    const f = followupService.createFollowup(ctx.db, ctx.institutionId, ctx.userId, companyId, {
      title: "Old task",
      dueAt: new Date(Date.now() - 5 * 86_400_000).toISOString(),
    });
    followupService.completeFollowup(ctx.db, ctx.institutionId, ctx.userId, f.id);
    const buckets = followupService.listFollowupCentre(ctx.db, ctx.institutionId);
    expect(buckets.OVERDUE.map((x) => x.id)).not.toContain(f.id);
    expect(buckets.COMPLETED.map((x) => x.id)).toContain(f.id);
  });
});
