export type RelationshipStage =
  | "PROSPECT"
  | "CONTACTED"
  | "INTERESTED"
  | "REQUIREMENT_RECEIVED"
  | "DRIVE_SCHEDULED"
  | "DRIVE_COMPLETED"
  | "HIRING"
  | "REPEAT_RECRUITER"
  | "INACTIVE";

export const RELATIONSHIP_STAGES: RelationshipStage[] = [
  "PROSPECT",
  "CONTACTED",
  "INTERESTED",
  "REQUIREMENT_RECEIVED",
  "DRIVE_SCHEDULED",
  "DRIVE_COMPLETED",
  "HIRING",
  "REPEAT_RECRUITER",
  "INACTIVE",
];

export type CompanyRecordStatus = "ACTIVE" | "ARCHIVED";

export type ContactChannel = "EMAIL" | "PHONE" | "WHATSAPP" | "LINKEDIN" | "OTHER";
export type ContactStatus = "ACTIVE" | "INACTIVE";

export type ActivityType =
  | "CALL"
  | "EMAIL"
  | "MEETING"
  | "VISIT"
  | "RECRUITER_REQUEST"
  | "REQUIREMENT_RECEIVED"
  | "DRIVE_DISCUSSION"
  | "FOLLOWUP"
  | "NOTE"
  | "OTHER";

export type FollowupPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type FollowupStatus = "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
/** Derived, never stored — see followupService.isOverdue */
export type FollowupDisplayStatus = FollowupStatus | "OVERDUE";

export type DocumentType =
  | "COMPANY_PROFILE"
  | "RECRUITER_REQUEST"
  | "JD"
  | "INVITATION"
  | "AGREEMENT_MOU"
  | "OTHER";

export type RelationshipHealth = "STRONG" | "HEALTHY" | "NEUTRAL" | "COOLING" | "AT_RISK" | "INACTIVE";

export interface CompanyRow {
  id: string;
  institution_id: string;
  name: string;
  normalized_name: string;
  legal_name: string | null;
  brand_name: string | null;
  website: string | null;
  website_domain: string | null;
  industry_id: string | null;
  sector: string | null;
  company_size: string | null;
  headquarters_city: string | null;
  headquarters_state: string | null;
  headquarters_country: string | null;
  description: string | null;
  logo_document_id: string | null;
  status: CompanyRecordStatus;
  relationship_stage: RelationshipStage;
  relationship_owner_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface RecruiterContactRow {
  id: string;
  institution_id: string;
  company_id: string;
  name: string;
  designation: string | null;
  department: string | null;
  email: string | null;
  phone: string | null;
  alternate_phone: string | null;
  linkedin_url: string | null;
  preferred_channel: ContactChannel | null;
  notes: string | null;
  status: ContactStatus;
  is_primary: number;
  created_at: string;
  updated_at: string;
}

export interface RecruiterActivityRow {
  id: string;
  institution_id: string;
  company_id: string;
  contact_id: string | null;
  actor_id: string | null;
  type: ActivityType;
  subject: string | null;
  summary: string | null;
  occurred_at: string;
  next_action: string | null;
  metadata: string | null;
  created_at: string;
}

export interface RecruiterFollowupRow {
  id: string;
  institution_id: string;
  company_id: string;
  contact_id: string | null;
  owner_id: string | null;
  title: string;
  description: string | null;
  priority: FollowupPriority;
  due_at: string;
  status: FollowupStatus;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompanyNoteRow {
  id: string;
  institution_id: string;
  company_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface CompanyStatusHistoryRow {
  id: string;
  company_id: string;
  old_stage: RelationshipStage | null;
  new_stage: RelationshipStage;
  actor_id: string | null;
  reason: string | null;
  changed_at: string;
}

/** The request-scoped identity every authenticated route handler receives. */
export interface AuthContext {
  userId: string;
  institutionId: string;
  userName: string;
  role: string;
}

/** A structured, AI-readiness insight object — Phase 19 of the spec. */
export interface Insight {
  type: string;
  priority: FollowupPriority;
  company_id: string;
  company_name: string;
  title: string;
  reason: string;
  evidence: Record<string, unknown>;
  recommended_action: string;
}
