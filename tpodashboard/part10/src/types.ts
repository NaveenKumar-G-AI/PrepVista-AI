export type RiskLevel =
  | "ready"
  | "almost_ready"
  | "developing"
  | "high_risk"
  | "insufficient_data";

export interface Student {
  id: string;
  institutionId: string;
  season: string;
  name: string;
  department: string;
  program: string;
  seekingPlacement: boolean;
  eligible: boolean;
  readinessScore: number | null;
  riskLevel: RiskLevel | null;
}

export type ApplicationStatus =
  | "applied"
  | "withdrawn"
  | "shortlisted"
  | "interviewed"
  | "selected"
  | "offered"
  | "rejected";

export interface Application {
  id: string;
  institutionId: string;
  season: string;
  studentId: string;
  driveId: string;
  company: string;
  role: string;
  status: ApplicationStatus;
  appliedAt: string;
}

export interface Interview {
  id: string;
  institutionId: string;
  applicationId: string;
  scheduledAt: string | null;
  attended: boolean | null;
  result: "pending" | "selected" | "rejected" | null;
  completedAt: string | null;
}

export type OfferStatus =
  | "received"
  | "verified"
  | "published"
  | "accepted"
  | "declined"
  | "expired";

export interface Offer {
  id: string;
  institutionId: string;
  season: string;
  applicationId: string;
  studentId: string;
  company: string;
  role: string;
  ctcFixed: number;
  ctcVariable: number;
  status: OfferStatus;
  verified: boolean;
  createdAt: string;
}

export type JoiningStatus = "confirmed" | "joined" | "delayed" | "did_not_join";

export interface Joining {
  id: string;
  institutionId: string;
  offerId: string;
  studentId: string;
  status: JoiningStatus;
  verified: boolean;
  joinedAt: string | null;
}

export interface MetricDefinition {
  id: string;
  institutionId: string;
  name: string;
  description: string;
  formulaDefinition: string;
  denominatorDefinition: string;
  dataSources: string[];
  calculatorKey: string;
  version: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: "active" | "superseded" | "retired";
}

export interface EvidenceRecord {
  id: string;
  institutionId: string;
  entityType: string;
  entityId: string;
  evidenceType: string;
  documentId: string | null;
  sourceType: "record" | "document" | "calculation" | "external_verification";
  sourceReference: string;
  verified: boolean;
  verifiedBy: string | null;
  verifiedAt: string | null;
  createdAt: string;
}

/** A single computed metric, always paired with the definition that produced it. */
export interface MetricValue {
  metricName: string;
  value: number;
  numerator: number;
  denominator: number;
  definitionId: string;
  definitionVersion: number;
  formulaDefinition: string;
  denominatorDefinition: string;
  computedAt: string;
  /** Present when the underlying group is too small to be statistically meaningful. */
  caution?: string;
}

export interface ReportWarning {
  code: string;
  severity: "info" | "warning" | "critical";
  message: string;
  count?: number;
}

export interface DataQualityResult {
  score: number; // 0-100, "Data Quality", never "Accuracy"
  status: "ready" | "needs_attention" | "blocked";
  factors: { label: string; score: number }[];
}

export interface FunnelStage {
  stage: string;
  count: number;
  conversionFromPrevious: number | null; // percentage, null for first stage
}
