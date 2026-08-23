import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { makeTestContext, cleanupTestContext, type TestContext } from "./helpers.js";
import * as companyService from "../src/services/companyService.js";

let ctx: TestContext;
beforeEach(() => {
  ctx = makeTestContext();
});
afterEach(() => {
  cleanupTestContext(ctx);
});

describe("companyService.createCompany", () => {
  it("creates a company scoped to the institution", () => {
    const { company } = companyService.createCompany(ctx.db, ctx.institutionId, ctx.userId, { name: "Acme Corp" });
    expect(company.id).toBeTruthy();
    expect(company.institution_id).toBe(ctx.institutionId);
    expect(company.relationship_stage).toBe("PROSPECT");
    expect(company.status).toBe("ACTIVE");
  });

  it("rejects an empty name", () => {
    expect(() => companyService.createCompany(ctx.db, ctx.institutionId, ctx.userId, { name: "   " })).toThrow(
      "Company name is required."
    );
  });

  it("writes an initial company_status_history row on creation", () => {
    const { company } = companyService.createCompany(ctx.db, ctx.institutionId, ctx.userId, { name: "Acme Corp" });
    const history = ctx.db.prepare(`select * from company_status_history where company_id = ?`).all(company.id) as any[];
    expect(history).toHaveLength(1);
    expect(history[0].old_stage).toBeNull();
    expect(history[0].new_stage).toBe("PROSPECT");
  });

  it("writes an audit log entry on creation", () => {
    const { company } = companyService.createCompany(ctx.db, ctx.institutionId, ctx.userId, { name: "Acme Corp" });
    const audit = ctx.db.prepare(`select * from audit_log where entity_type = 'company' and entity_id = ?`).all(company.id) as any[];
    expect(audit).toHaveLength(1);
    expect(audit[0].action).toBe("CREATED");
  });
});

describe("companyService duplicate detection", () => {
  it("blocks an exact name duplicate unless allowDuplicate is set", () => {
    companyService.createCompany(ctx.db, ctx.institutionId, ctx.userId, { name: "Acme Corp" });
    expect(() => companyService.createCompany(ctx.db, ctx.institutionId, ctx.userId, { name: "Acme Corp" })).toThrow(
      companyService.DuplicateCompanyError
    );
  });

  it("blocks an exact website-domain duplicate even with a different name", () => {
    companyService.createCompany(ctx.db, ctx.institutionId, ctx.userId, { name: "Acme Corp", website: "https://acme.example" });
    expect(() =>
      companyService.createCompany(ctx.db, ctx.institutionId, ctx.userId, {
        name: "Acme Corporation Pvt Ltd",
        website: "https://www.acme.example/careers",
      })
    ).toThrow(companyService.DuplicateCompanyError);
  });

  it("never silently merges — allowDuplicate creates a second, separate row", () => {
    const first = companyService.createCompany(ctx.db, ctx.institutionId, ctx.userId, { name: "Acme Corp" });
    const second = companyService.createCompany(
      ctx.db,
      ctx.institutionId,
      ctx.userId,
      { name: "Acme Corp" },
      { allowDuplicate: true }
    );
    expect(second.company.id).not.toBe(first.company.id);
  });

  it("flags a close-but-not-exact name as a possible match without blocking", () => {
    companyService.createCompany(ctx.db, ctx.institutionId, ctx.userId, { name: "Meridian Software Pvt Ltd" });
    const result = companyService.createCompany(ctx.db, ctx.institutionId, ctx.userId, { name: "Meridian Softwares" });
    expect(result.company).toBeTruthy(); // not blocked
    expect(result.duplicates.length).toBeGreaterThan(0);
    expect(result.duplicates[0].matchType).toBe("POSSIBLE_NAME");
  });

  it("does not flag unrelated names as duplicates", () => {
    companyService.createCompany(ctx.db, ctx.institutionId, ctx.userId, { name: "Zephyr Analytics" });
    const result = companyService.createCompany(ctx.db, ctx.institutionId, ctx.userId, { name: "Coral Fintech" });
    expect(result.duplicates).toHaveLength(0);
  });

  it("does not consider a duplicate in a different institution a match", () => {
    const other = { institutionId: "other-inst" };
    ctx.db.prepare(`insert into institution (id, name, created_at) values (?, ?, ?)`).run(other.institutionId, "Other", "2020-01-01");
    companyService.createCompany(ctx.db, other.institutionId, ctx.userId, { name: "Acme Corp" });
    // Same name, different institution — should NOT throw
    expect(() => companyService.createCompany(ctx.db, ctx.institutionId, ctx.userId, { name: "Acme Corp" })).not.toThrow();
  });
});

describe("companyService.updateCompany / archive / restore", () => {
  it("updates fields and records before/after in the audit log", () => {
    const { company } = companyService.createCompany(ctx.db, ctx.institutionId, ctx.userId, { name: "Acme Corp" });
    const updated = companyService.updateCompany(ctx.db, ctx.institutionId, ctx.userId, company.id, {
      headquartersCity: "Bengaluru",
    });
    expect(updated.headquarters_city).toBe("Bengaluru");
    const audit = ctx.db
      .prepare(`select * from audit_log where entity_type='company' and entity_id=? and action='UPDATED'`)
      .all(company.id) as any[];
    expect(audit).toHaveLength(1);
  });

  it("archive then restore round-trips status correctly", () => {
    const { company } = companyService.createCompany(ctx.db, ctx.institutionId, ctx.userId, { name: "Acme Corp" });
    companyService.archiveCompany(ctx.db, ctx.institutionId, ctx.userId, company.id);
    expect(companyService.getCompany(ctx.db, ctx.institutionId, company.id)!.status).toBe("ARCHIVED");

    companyService.restoreCompany(ctx.db, ctx.institutionId, ctx.userId, company.id);
    expect(companyService.getCompany(ctx.db, ctx.institutionId, company.id)!.status).toBe("ACTIVE");
  });

  it("archived companies are excluded from the default list", () => {
    const { company } = companyService.createCompany(ctx.db, ctx.institutionId, ctx.userId, { name: "Acme Corp" });
    companyService.archiveCompany(ctx.db, ctx.institutionId, ctx.userId, company.id);
    const { items } = companyService.listCompanies(ctx.db, ctx.institutionId, {});
    expect(items.find((c) => c.id === company.id)).toBeUndefined();
  });
});

describe("companyService.changeRelationshipStage", () => {
  it("records old and new stage with actor and reason", () => {
    const { company } = companyService.createCompany(ctx.db, ctx.institutionId, ctx.userId, { name: "Acme Corp" });
    companyService.changeRelationshipStage(ctx.db, ctx.institutionId, ctx.userId, company.id, "CONTACTED", "Cold outreach sent");
    const history = ctx.db
      .prepare(`select * from company_status_history where company_id = ? order by changed_at asc`)
      .all(company.id) as any[];
    expect(history).toHaveLength(2); // creation + this change
    expect(history[1].old_stage).toBe("PROSPECT");
    expect(history[1].new_stage).toBe("CONTACTED");
    expect(history[1].reason).toBe("Cold outreach sent");
  });

  it("is a no-op (no extra history row) when the stage doesn't actually change", () => {
    const { company } = companyService.createCompany(ctx.db, ctx.institutionId, ctx.userId, { name: "Acme Corp" });
    companyService.changeRelationshipStage(ctx.db, ctx.institutionId, ctx.userId, company.id, "PROSPECT");
    const history = ctx.db.prepare(`select * from company_status_history where company_id = ?`).all(company.id) as any[];
    expect(history).toHaveLength(1); // just the creation row
  });
});

describe("companyService.listCompanies — search/filter/sort", () => {
  it("finds a company by partial name search", () => {
    companyService.createCompany(ctx.db, ctx.institutionId, ctx.userId, { name: "Zephyr Analytics" });
    companyService.createCompany(ctx.db, ctx.institutionId, ctx.userId, { name: "Coral Fintech" });
    const { items } = companyService.listCompanies(ctx.db, ctx.institutionId, { search: "zephyr" });
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("Zephyr Analytics");
  });

  it("filters by relationship stage", () => {
    const a = companyService.createCompany(ctx.db, ctx.institutionId, ctx.userId, { name: "A Co" }).company;
    companyService.createCompany(ctx.db, ctx.institutionId, ctx.userId, { name: "B Co" });
    companyService.changeRelationshipStage(ctx.db, ctx.institutionId, ctx.userId, a.id, "HIRING");

    const { items } = companyService.listCompanies(ctx.db, ctx.institutionId, { relationshipStage: "HIRING" });
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(a.id);
  });

  it("sorts by name ascending/descending", () => {
    companyService.createCompany(ctx.db, ctx.institutionId, ctx.userId, { name: "Bravo" });
    companyService.createCompany(ctx.db, ctx.institutionId, ctx.userId, { name: "Alpha" });
    const asc = companyService.listCompanies(ctx.db, ctx.institutionId, { sort: "name", sortDir: "asc" });
    expect(asc.items.map((c) => c.name)).toEqual(["Alpha", "Bravo"]);
    const desc = companyService.listCompanies(ctx.db, ctx.institutionId, { sort: "name", sortDir: "desc" });
    expect(desc.items.map((c) => c.name)).toEqual(["Bravo", "Alpha"]);
  });

  it("paginates results", () => {
    for (let i = 0; i < 5; i++) {
      companyService.createCompany(ctx.db, ctx.institutionId, ctx.userId, { name: `Company ${i}`, website: `https://c${i}.example` });
    }
    const page1 = companyService.listCompanies(ctx.db, ctx.institutionId, { pageSize: 2, page: 1 });
    const page2 = companyService.listCompanies(ctx.db, ctx.institutionId, { pageSize: 2, page: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page2.items).toHaveLength(2);
    expect(page1.total).toBe(5);
    expect(page1.items[0].id).not.toBe(page2.items[0].id);
  });

  it("returns an honest empty result for an institution with no companies", () => {
    const { items, total } = companyService.listCompanies(ctx.db, ctx.institutionId, {});
    expect(items).toEqual([]);
    expect(total).toBe(0);
  });
});
