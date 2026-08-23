/**
 * OPT-IN DEMO DATA ONLY. Not run by `npm run dev`, not run by tests, not run by
 * migrate. Requires `npm run seed:dev` to have run first (needs an institution + user
 * to attach to). This exists purely so a reviewer can see the module with realistic
 * data in it — every row it creates goes through the real service layer (not raw
 * INSERTs), so it exercises exactly the same code path a real TPO action would.
 */
import { openDb, ensureSchema } from "../db/connection.js";
import * as companyService from "../services/companyService.js";
import * as contactService from "../services/contactService.js";
import * as activityService from "../services/activityService.js";
import * as followupService from "../services/followupService.js";
import * as lookupService from "../services/lookupService.js";

const db = openDb();
ensureSchema(db);

const institution = db.prepare(`select id from institution limit 1`).get() as { id: string } | undefined;
const user = db.prepare(`select id from app_user limit 1`).get() as { id: string } | undefined;
if (!institution || !user) {
  console.error("No institution/user found. Run `npm run seed:dev` first.");
  process.exit(1);
}
const institutionId = institution.id;
const actorId = user.id;

const existingCompanies = db.prepare(`select count(*) as n from company where institution_id = ?`).get(institutionId) as {
  n: number;
};
if (existingCompanies.n > 0) {
  console.log("Demo data already present. Skipping (delete the sqlite file to reseed from scratch).");
  process.exit(0);
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

const industry = (name: string) => lookupService.createIndustry(db, institutionId, name).id;
const it = industry("IT Services");
const manufacturing = industry("Manufacturing");
const fintech = industry("Fintech");
const consulting = industry("Consulting");
const robotics = industry("Robotics");

function makeCompany(opts: {
  name: string;
  industryId: string;
  city: string;
  website: string;
  size: string;
  contactName: string;
  contactRole: string;
  contactEmail: string;
  stagePath: Array<{ stage: any; reason?: string }>;
  activityDaysAgo?: number;
  activityType?: any;
  followups?: Array<{ title: string; dueDaysFromNow: number; priority?: any }>;
}) {
  const { company } = companyService.createCompany(db, institutionId, actorId, {
    name: opts.name,
    website: opts.website,
    industryId: opts.industryId,
    companySize: opts.size,
    headquartersCity: opts.city,
    headquartersCountry: "India",
  });

  const contact = contactService.createContact(db, institutionId, actorId, company.id, {
    name: opts.contactName,
    designation: opts.contactRole,
    email: opts.contactEmail,
    preferredChannel: "EMAIL",
  });

  for (const step of opts.stagePath) {
    companyService.changeRelationshipStage(db, institutionId, actorId, company.id, step.stage, step.reason);
  }

  if (opts.activityDaysAgo !== undefined) {
    activityService.logActivity(db, institutionId, actorId, company.id, {
      contactId: contact.id,
      type: opts.activityType ?? "CALL",
      subject: "Recruiter sync",
      summary: `Discussed hiring plans with ${opts.contactName}.`,
      occurredAt: daysAgo(opts.activityDaysAgo),
    });
  }

  for (const f of opts.followups ?? []) {
    followupService.createFollowup(db, institutionId, actorId, company.id, {
      contactId: contact.id,
      title: f.title,
      dueAt: daysFromNow(f.dueDaysFromNow),
      priority: f.priority ?? "MEDIUM",
    });
  }

  return company;
}

// 1. Strong relationship, but nothing scheduled next (NO_NEXT_ACTION opportunity)
makeCompany({
  name: "Zephyr Analytics",
  industryId: it,
  city: "Bengaluru",
  website: "https://zephyranalytics.example",
  size: "MEDIUM",
  contactName: "Ananya Rao",
  contactRole: "HR Manager",
  contactEmail: "ananya.rao@zephyranalytics.example",
  stagePath: [
    { stage: "CONTACTED" },
    { stage: "INTERESTED" },
    { stage: "HIRING", reason: "Confirmed 12 open roles for this cycle" },
  ],
  activityDaysAgo: 2,
  activityType: "MEETING",
});

// 2. Cooling — one overdue follow-up
makeCompany({
  name: "Meridian Software",
  industryId: it,
  city: "Pune",
  website: "https://meridiansoftware.example",
  size: "LARGE",
  contactName: "Karan Mehta",
  contactRole: "Talent Acquisition Lead",
  contactEmail: "karan.mehta@meridiansoftware.example",
  stagePath: [{ stage: "CONTACTED" }, { stage: "INTERESTED" }],
  activityDaysAgo: 25,
  activityType: "CALL",
  followups: [{ title: "Confirm shortlist criteria for SDE-1 role", dueDaysFromNow: -5, priority: "HIGH" }],
});

// 3. Repeat recruiter gone quiet (STALE_REPEAT_RECRUITER opportunity)
makeCompany({
  name: "Anchor Manufacturing",
  industryId: manufacturing,
  city: "Chennai",
  website: "https://anchormfg.example",
  size: "ENTERPRISE",
  contactName: "Deepa Iyer",
  contactRole: "Head of Campus Hiring",
  contactEmail: "deepa.iyer@anchormfg.example",
  stagePath: [
    { stage: "CONTACTED" },
    { stage: "INTERESTED" },
    { stage: "HIRING", reason: "First cycle — 8 offers made" },
    { stage: "REPEAT_RECRUITER", reason: "Returned for a second hiring cycle the following year" },
  ],
  activityDaysAgo: 50,
  activityType: "EMAIL",
});

// 4. Fresh prospect — genuinely no interactions yet
makeCompany({
  name: "Bluewave Consulting",
  industryId: consulting,
  city: "Hyderabad",
  website: "https://bluewaveconsulting.example",
  size: "SMALL",
  contactName: "Rahul Nair",
  contactRole: "Founder",
  contactEmail: "rahul.nair@bluewaveconsulting.example",
  stagePath: [],
});

// 5. At risk — two overdue follow-ups, contact more than a month ago
makeCompany({
  name: "Coral Fintech",
  industryId: fintech,
  city: "Mumbai",
  website: "https://coralfintech.example",
  size: "MEDIUM",
  contactName: "Sana Sheikh",
  contactRole: "People Operations",
  contactEmail: "sana.sheikh@coralfintech.example",
  stagePath: [{ stage: "CONTACTED" }],
  activityDaysAgo: 10,
  activityType: "EMAIL",
  followups: [
    { title: "Send updated placement brochure", dueDaysFromNow: -12, priority: "MEDIUM" },
    { title: "Schedule pre-placement talk", dueDaysFromNow: -3, priority: "CRITICAL" },
  ],
});

// 6. Inactive — TPO explicitly closed this one out
{
  const c = makeCompany({
    name: "Driftwood Robotics",
    industryId: robotics,
    city: "Coimbatore",
    website: "https://driftwoodrobotics.example",
    size: "STARTUP",
    contactName: "Vikram Das",
    contactRole: "Operations Lead",
    contactEmail: "vikram.das@driftwoodrobotics.example",
    stagePath: [{ stage: "CONTACTED" }],
    activityDaysAgo: 90,
    activityType: "CALL",
  });
  companyService.changeRelationshipStage(db, institutionId, actorId, c.id, "INACTIVE", "No response after three follow-up attempts");
}

console.log("Demo seed complete — 6 companies created via the real service layer.");
db.close();
