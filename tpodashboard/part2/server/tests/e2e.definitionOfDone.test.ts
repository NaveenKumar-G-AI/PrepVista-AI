import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import bcrypt from "bcryptjs";
import { applySchema } from "../src/db/connection.js";
import { createApp } from "../src/app.js";
import { newId, nowIso } from "../src/util/id.js";

/**
 * This test walks the exact loop from the spec's "PART 2 DEFINITION OF DONE":
 *
 *   logs in -> opens Companies & Recruiters -> searches/filters -> opens company dossier
 *   -> sees contact data -> sees relationship timeline -> adds a recruiter contact
 *   -> records an interaction -> creates a follow-up -> marks it complete
 *   -> sees relationship state update -> sees recruiter intelligence
 *   -> Command Centre reflects the metrics -> audit log recorded the changes
 *   -> logout -> login again -> all data remains persisted
 *
 * The persistence check is real: the database connection is closed and reopened from
 * the same file (simulating a server restart), not just re-read from the same
 * in-memory process — see "reopen the database file" below.
 */

let dbDir: string;
let dbPath: string;
let db: Database.Database;
let app: ReturnType<typeof createApp>;
let institutionId: string;
let userId: string;
const email = "tpo@e2e.test";
const password = "e2e-password-123";

function reopenApp() {
  db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  app = createApp(db);
}

beforeAll(() => {
  dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "pv-e2e-"));
  dbPath = path.join(dbDir, "e2e.sqlite3");
  db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  applySchema(db);

  institutionId = newId();
  userId = newId();
  db.prepare(`insert into institution (id, name, created_at) values (?, ?, ?)`).run(institutionId, "E2E Institute", nowIso());
  db.prepare(
    `insert into app_user (id, institution_id, name, email, password_hash, role, created_at) values (?, ?, ?, ?, ?, ?, ?)`
  ).run(userId, institutionId, "E2E TPO", email, bcrypt.hashSync(password, 4), "TPO", nowIso());

  app = createApp(db);
});

afterAll(() => {
  db.close();
  fs.rmSync(dbDir, { recursive: true, force: true });
});

let cookie: string;
let companyId: string;
let contactId: string;
let followupId: string;

describe("Definition of Done: the full Companies & Recruiters loop against a real database", () => {
  it("starts with an honest empty state — no companies for a fresh institution", async () => {
    const res = await request(app).post("/api/auth/login").send({ email, password });
    expect(res.status).toBe(200);
    cookie = res.headers["set-cookie"][0];

    const list = await request(app).get("/api/companies").set("Cookie", cookie);
    expect(list.status).toBe(200);
    expect(list.body.items).toEqual([]);
    expect(list.body.total).toBe(0);

    const pulse = await request(app).get("/api/command-centre/recruiter-pulse").set("Cookie", cookie);
    expect(pulse.body.isEmpty).toBe(true);
    expect(pulse.body.companies).toBe(0);
  });

  it("rejects unauthenticated access", async () => {
    const res = await request(app).get("/api/companies");
    expect(res.status).toBe(401);
  });

  it("creates a company", async () => {
    const res = await request(app)
      .post("/api/companies")
      .set("Cookie", cookie)
      .send({ name: "Northbridge Systems", website: "https://northbridge.example", headquartersCity: "Bengaluru" });
    expect(res.status).toBe(201);
    expect(res.body.company.relationship_stage).toBe("PROSPECT");
    companyId = res.body.company.id;
  });

  it("finds the company via search", async () => {
    const res = await request(app).get("/api/companies?search=Northbridge").set("Cookie", cookie);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].id).toBe(companyId);
  });

  it("opens the company dossier and sees an honest empty state for contacts/history", async () => {
    const res = await request(app).get(`/api/companies/${companyId}`).set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.contactCount).toBe(0);
    expect(res.body.drives).toEqual([]); // Phase 14 stub — real once Part 3 exists
    expect(res.body.relationshipHealth.health).toBe("NEUTRAL");
  });

  it("adds a recruiter contact, which becomes primary automatically as the first contact", async () => {
    const res = await request(app)
      .post(`/api/companies/${companyId}/contacts`)
      .set("Cookie", cookie)
      .send({ name: "Ishaan Verma", designation: "HR Lead", email: "ishaan.verma@northbridge.example" });
    expect(res.status).toBe(201);
    expect(res.body.contact.is_primary).toBe(1);
    contactId = res.body.contact.id;
  });

  it("records an interaction (activity)", async () => {
    const res = await request(app)
      .post(`/api/companies/${companyId}/activities`)
      .set("Cookie", cookie)
      .send({ contactId, type: "CALL", subject: "Intro call", summary: "Discussed hiring needs for this season." });
    expect(res.status).toBe(201);
  });

  it("moves the relationship stage forward, which is recorded with provenance", async () => {
    const res = await request(app).post(`/api/companies/${companyId}/stage`).set("Cookie", cookie).send({
      stage: "CONTACTED",
      reason: "Intro call completed",
    });
    expect(res.status).toBe(200);
    expect(res.body.company.relationship_stage).toBe("CONTACTED");
  });

  it("sees the relationship timeline reflect both the activity and the stage change", async () => {
    const res = await request(app).get(`/api/companies/${companyId}/history`).set("Cookie", cookie);
    const kinds = res.body.history.map((h: any) => h.kind);
    expect(kinds).toContain("activity");
    expect(kinds).toContain("stage_change");
  });

  it("creates a follow-up", async () => {
    const res = await request(app)
      .post(`/api/companies/${companyId}/followups`)
      .set("Cookie", cookie)
      .send({ contactId, title: "Send placement brochure", dueAt: new Date(Date.now() + 86_400_000).toISOString(), priority: "HIGH" });
    expect(res.status).toBe(201);
    expect(res.body.followup.status).toBe("OPEN");
    followupId = res.body.followup.id;
  });

  it("the company now shows relationship intelligence reflecting the open follow-up", async () => {
    const res = await request(app).get(`/api/companies/${companyId}`).set("Cookie", cookie);
    expect(res.body.openFollowupCount).toBe(1);
    expect(res.body.overdueFollowupCount).toBe(0);
  });

  it("marks the follow-up complete", async () => {
    const res = await request(app).post(`/api/followups/${followupId}/complete`).set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.followup.status).toBe("COMPLETED");
  });

  it("the company relationship state updates: open follow-up count drops to zero", async () => {
    const res = await request(app).get(`/api/companies/${companyId}`).set("Cookie", cookie);
    expect(res.body.openFollowupCount).toBe(0);
  });

  it("Command Centre reflects real, non-hardcoded metrics", async () => {
    const res = await request(app).get("/api/command-centre/recruiter-pulse").set("Cookie", cookie);
    expect(res.body.companies).toBe(1);
    expect(res.body.isEmpty).toBe(false);
  });

  it("every mutation was audited", async () => {
    const actions = (
      db.prepare(`select entity_type, action from audit_log where institution_id = ? order by created_at asc`).all(institutionId) as {
        entity_type: string;
        action: string;
      }[]
    ).map((a) => `${a.entity_type}:${a.action}`);
    expect(actions).toContain("company:CREATED");
    expect(actions).toContain("recruiter_contact:CREATED");
    expect(actions).toContain("recruiter_activity:CREATED");
    expect(actions).toContain("company:RELATIONSHIP_STAGE_CHANGED");
    expect(actions).toContain("recruiter_followup:CREATED");
    expect(actions).toContain("recruiter_followup:COMPLETED");
  });

  it("logs out — the session is actually invalidated, not just forgotten client-side", async () => {
    const logout = await request(app).post("/api/auth/logout").set("Cookie", cookie);
    expect(logout.status).toBe(200);

    const afterLogout = await request(app).get("/api/companies").set("Cookie", cookie);
    expect(afterLogout.status).toBe(401);
  });

  it("logs in again — and closing + reopening the database file proves this is real disk persistence, not process memory", async () => {
    db.close();
    reopenApp(); // fresh Database() from the same file path — the equivalent of a server restart

    const login = await request(app).post("/api/auth/login").send({ email, password });
    expect(login.status).toBe(200);
    const newCookie = login.headers["set-cookie"][0];

    const list = await request(app).get("/api/companies").set("Cookie", newCookie);
    expect(list.body.total).toBe(1);
    expect(list.body.items[0].name).toBe("Northbridge Systems");
    expect(list.body.items[0].relationship_stage).toBe("CONTACTED");

    const dossier = await request(app).get(`/api/companies/${companyId}`).set("Cookie", newCookie);
    expect(dossier.body.contactCount).toBe(1);
    expect(dossier.body.primaryContact.name).toBe("Ishaan Verma");

    const followups = await request(app).get(`/api/companies/${companyId}/followups`).set("Cookie", newCookie);
    expect(followups.body.followups[0].status).toBe("COMPLETED");
  });
});
