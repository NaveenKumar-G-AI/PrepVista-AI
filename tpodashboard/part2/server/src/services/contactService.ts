import type Database from "better-sqlite3";
import { newId, nowIso } from "../util/id.js";
import type { RecruiterContactRow, ContactChannel } from "../types.js";
import { recordAudit } from "./auditService.js";
import { publish } from "../events.js";
import { ServiceError } from "./companyService.js";
import { requireCompany } from "./companyService.js";

export interface ContactInput {
  name: string;
  designation?: string | null;
  department?: string | null;
  email?: string | null;
  phone?: string | null;
  alternatePhone?: string | null;
  linkedinUrl?: string | null;
  preferredChannel?: ContactChannel | null;
  notes?: string | null;
  isPrimary?: boolean;
}

export function listContacts(db: Database.Database, institutionId: string, companyId: string): RecruiterContactRow[] {
  return db
    .prepare(`select * from recruiter_contact where institution_id = ? and company_id = ? order by is_primary desc, name asc`)
    .all(institutionId, companyId) as RecruiterContactRow[];
}

export function getContact(db: Database.Database, institutionId: string, contactId: string): RecruiterContactRow | null {
  const row = db
    .prepare(`select * from recruiter_contact where id = ? and institution_id = ?`)
    .get(contactId, institutionId) as RecruiterContactRow | undefined;
  return row ?? null;
}

export function requireContact(db: Database.Database, institutionId: string, contactId: string): RecruiterContactRow {
  const row = getContact(db, institutionId, contactId);
  if (!row) throw new ServiceError(404, "Recruiter contact not found.");
  return row;
}

function clearExistingPrimary(db: Database.Database, companyId: string) {
  db.prepare(`update recruiter_contact set is_primary = 0 where company_id = ? and is_primary = 1`).run(companyId);
}

export function createContact(
  db: Database.Database,
  institutionId: string,
  actorId: string,
  companyId: string,
  input: ContactInput
): RecruiterContactRow {
  requireCompany(db, institutionId, companyId);
  const name = input.name.trim();
  if (!name) throw new ServiceError(400, "Contact name is required.");

  const isFirstContact = listContacts(db, institutionId, companyId).length === 0;
  const isPrimary = input.isPrimary ?? isFirstContact; // first contact on a company defaults to primary

  const id = newId();
  const now = nowIso();
  const row: RecruiterContactRow = {
    id,
    institution_id: institutionId,
    company_id: companyId,
    name,
    designation: input.designation ?? null,
    department: input.department ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    alternate_phone: input.alternatePhone ?? null,
    linkedin_url: input.linkedinUrl ?? null,
    preferred_channel: input.preferredChannel ?? null,
    notes: input.notes ?? null,
    status: "ACTIVE",
    is_primary: isPrimary ? 1 : 0,
    created_at: now,
    updated_at: now,
  };

  const tx = db.transaction(() => {
    if (isPrimary) clearExistingPrimary(db, companyId);
    db.prepare(
      `insert into recruiter_contact (
        id, institution_id, company_id, name, designation, department, email, phone, alternate_phone,
        linkedin_url, preferred_channel, notes, status, is_primary, created_at, updated_at
      ) values (
        @id, @institution_id, @company_id, @name, @designation, @department, @email, @phone, @alternate_phone,
        @linkedin_url, @preferred_channel, @notes, @status, @is_primary, @created_at, @updated_at
      )`
    ).run(row);
  });
  tx();

  recordAudit(db, { institutionId, actorId, entityType: "recruiter_contact", entityId: id, action: "CREATED", after: row });
  publish("RECRUITER_CREATED", { contactId: id, companyId, institutionId });

  return row;
}

export function updateContact(
  db: Database.Database,
  institutionId: string,
  actorId: string,
  contactId: string,
  patch: Partial<ContactInput>
): RecruiterContactRow {
  const existing = requireContact(db, institutionId, contactId);
  const name = patch.name !== undefined ? patch.name.trim() : existing.name;
  if (!name) throw new ServiceError(400, "Contact name is required.");

  const updated: RecruiterContactRow = {
    ...existing,
    name,
    designation: patch.designation !== undefined ? patch.designation : existing.designation,
    department: patch.department !== undefined ? patch.department : existing.department,
    email: patch.email !== undefined ? patch.email : existing.email,
    phone: patch.phone !== undefined ? patch.phone : existing.phone,
    alternate_phone: patch.alternatePhone !== undefined ? patch.alternatePhone : existing.alternate_phone,
    linkedin_url: patch.linkedinUrl !== undefined ? patch.linkedinUrl : existing.linkedin_url,
    preferred_channel: patch.preferredChannel !== undefined ? patch.preferredChannel : existing.preferred_channel,
    notes: patch.notes !== undefined ? patch.notes : existing.notes,
    updated_at: nowIso(),
  };

  db.prepare(
    `update recruiter_contact set name=@name, designation=@designation, department=@department, email=@email,
      phone=@phone, alternate_phone=@alternate_phone, linkedin_url=@linkedin_url, preferred_channel=@preferred_channel,
      notes=@notes, updated_at=@updated_at
     where id=@id and institution_id=@institution_id`
  ).run(updated);

  const historyEntries: Array<[string, string | null, string | null]> = [
    ["email", existing.email, updated.email],
    ["phone", existing.phone, updated.phone],
    ["designation", existing.designation, updated.designation],
  ];
  const insertHistory = db.prepare(
    `insert into recruiter_contact_history (id, contact_id, field_name, old_value, new_value, changed_by, changed_at)
     values (?, ?, ?, ?, ?, ?, ?)`
  );
  const now = nowIso();
  for (const [field, oldV, newV] of historyEntries) {
    if (oldV !== newV) insertHistory.run(newId(), contactId, field, oldV, newV, actorId, now);
  }

  recordAudit(db, {
    institutionId,
    actorId,
    entityType: "recruiter_contact",
    entityId: contactId,
    action: "UPDATED",
    before: existing,
    after: updated,
  });
  publish("RECRUITER_UPDATED", { contactId, institutionId });

  return updated;
}

export function setPrimaryContact(db: Database.Database, institutionId: string, actorId: string, contactId: string) {
  const existing = requireContact(db, institutionId, contactId);
  const tx = db.transaction(() => {
    clearExistingPrimary(db, existing.company_id);
    db.prepare(`update recruiter_contact set is_primary = 1, updated_at = ? where id = ?`).run(nowIso(), contactId);
  });
  tx();
  recordAudit(db, {
    institutionId,
    actorId,
    entityType: "recruiter_contact",
    entityId: contactId,
    action: "SET_PRIMARY",
  });
}

export function deactivateContact(db: Database.Database, institutionId: string, actorId: string, contactId: string) {
  const existing = requireContact(db, institutionId, contactId);
  db.prepare(`update recruiter_contact set status = 'INACTIVE', is_primary = 0, updated_at = ? where id = ?`).run(
    nowIso(),
    contactId
  );
  recordAudit(db, {
    institutionId,
    actorId,
    entityType: "recruiter_contact",
    entityId: contactId,
    action: "DEACTIVATED",
    before: { status: existing.status },
    after: { status: "INACTIVE" },
  });
  publish("RECRUITER_DEACTIVATED", { contactId, institutionId });
}
