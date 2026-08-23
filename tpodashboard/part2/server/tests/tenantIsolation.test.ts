import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { makeTestContext, addSecondInstitution, cleanupTestContext, type TestContext } from "./helpers.js";
import * as companyService from "../src/services/companyService.js";
import * as contactService from "../src/services/contactService.js";
import * as followupService from "../src/services/followupService.js";

let ctx: TestContext;
let other: ReturnType<typeof addSecondInstitution>;
beforeEach(() => {
  ctx = makeTestContext();
  other = addSecondInstitution(ctx);
});
afterEach(() => cleanupTestContext(ctx));

describe("tenant isolation at the service layer", () => {
  it("a company created in institution A is invisible to institution B's list", () => {
    companyService.createCompany(ctx.db, ctx.institutionId, ctx.userId, { name: "Institution A Co" });
    const { items } = companyService.listCompanies(ctx.db, other.institutionId, {});
    expect(items).toHaveLength(0);
  });

  it("institution B cannot fetch institution A's company by id", () => {
    const { company } = companyService.createCompany(ctx.db, ctx.institutionId, ctx.userId, { name: "Institution A Co" });
    const fetched = companyService.getCompany(ctx.db, other.institutionId, company.id);
    expect(fetched).toBeNull();
  });

  it("institution B cannot update institution A's company (throws 404, not a silent no-op)", () => {
    const { company } = companyService.createCompany(ctx.db, ctx.institutionId, ctx.userId, { name: "Institution A Co" });
    expect(() =>
      companyService.updateCompany(ctx.db, other.institutionId, other.userId, company.id, { headquartersCity: "Nowhere" })
    ).toThrow("Company not found.");
  });

  it("institution B cannot add a contact to institution A's company", () => {
    const { company } = companyService.createCompany(ctx.db, ctx.institutionId, ctx.userId, { name: "Institution A Co" });
    expect(() =>
      contactService.createContact(ctx.db, other.institutionId, other.userId, company.id, { name: "Intruder Contact" })
    ).toThrow("Company not found.");
  });

  it("institution B cannot create a follow-up against institution A's company", () => {
    const { company } = companyService.createCompany(ctx.db, ctx.institutionId, ctx.userId, { name: "Institution A Co" });
    expect(() =>
      followupService.createFollowup(ctx.db, other.institutionId, other.userId, company.id, {
        title: "Sneaky follow-up",
        dueAt: new Date().toISOString(),
      })
    ).toThrow("Company not found.");
  });

  it("duplicate detection never crosses institution boundaries", () => {
    companyService.createCompany(ctx.db, ctx.institutionId, ctx.userId, { name: "Shared Name Inc" });
    // Institution B creating the exact same name should succeed — it's a different tenant's data entirely.
    expect(() =>
      companyService.createCompany(ctx.db, other.institutionId, other.userId, { name: "Shared Name Inc" })
    ).not.toThrow();
  });
});
