import type { ComputationSpec } from '../domain/computation.js';
import {
  IssueSeverity,
  IssueType,
  LifecycleStatus,
  ProvenanceSource,
  QuestionHealth,
  QuestionPurpose,
  ReportType,
  ReviewDecision,
  TrustLevel,
} from './enums.js';

export interface QuestionOption {
  id: string;
  text: string;
  /** Present for questions with a checkable numeric answer; drives independent verification
   *  in AnswerValidator (sections 17-23). Omit for purely verbal/RC/logic options. */
  numericValue?: number;
}

// Section 39/41 — skill alignment
export interface SkillMapping {
  domain?: string;
  primarySkill: string;
  secondarySkills?: string[];
  subskill?: string;
  concept?: string;
  learningObjective?: string;
}

// Section 45/46 — difficulty provenance
export interface DifficultyMetadata {
  label: 'EASY' | 'MEDIUM' | 'HARD';
  authorEstimate?: string;
  aiEstimate?: string;
  historicalEstimate?: string;
  calibratedEstimate?: string;
}

export interface Solution {
  text?: string;
  /** Structured final numeric result, when the author/generator supplies one directly.
   *  Preferred over regex-extracting a number from `text` (see SolutionValidator). */
  derivedValue?: number;
  derivedOptionId?: string;
  steps?: string[];
}

export interface Diagram {
  url?: string;
  altText?: string;
}

/** Section 92 — used by ClarityValidator's contradiction check (section 35) and, longer-term,
 *  by data-interpretation validation (section 23). */
export interface QuestionContext {
  facts?: Record<string, number>;
  tableData?: Record<string, unknown>;
}

export interface QuestionVersion {
  id: string;
  questionId: string;
  versionNumber: number;
  content: string;
  options: QuestionOption[];
  /** Option ids the author/generator claims are correct. */
  answerKey: string[];
  multiSelect: boolean;
  solution?: Solution;
  computation?: ComputationSpec;
  context?: QuestionContext;
  diagram?: Diagram;
  skillMapping?: SkillMapping;
  difficultyMetadata?: DifficultyMetadata;
  purpose?: QuestionPurpose;
  minOptions?: number;
  nonNegativeExpected?: boolean;

  // Provenance (section 9/73) — inlined onto the version rather than a separate join table;
  // see README "Reuse & schema decisions".
  source?: ProvenanceSource;
  authorId?: string;
  generator?: string;
  model?: string;
  promptVersion?: string;

  /** Which fields changed vs. the previous version — drives revalidation scoping (section 72). */
  changedFields?: string[];

  createdAt: string;
  createdBy?: string;
}

export interface Question {
  id: string;
  tenantId?: string;
  isGlobal: boolean;
  currentVersionId?: string;
  lifecycleStatus: LifecycleStatus;
  trustLevel: TrustLevel;
  health: QuestionHealth;
  /** Optimistic-concurrency counter, bumped on every lifecycle transition (section 165). */
  lifecycleVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface Issue {
  id: string;
  questionVersionId?: string;
  type: IssueType;
  severity: IssueSeverity;
  message: string;
  evidence?: Record<string, unknown>;
  status: 'OPEN' | 'RESOLVED' | 'WONT_FIX';
  createdAt: string;
  resolvedAt?: string;
}

export interface ValidationRecord {
  id: string;
  questionVersionId: string;
  validator: string;
  status: 'PASS' | 'FLAGGED';
  severity?: IssueSeverity;
  issueCount: number;
  validatedAt: string;
}

export interface ReportRecord {
  id: string;
  questionId: string;
  versionId: string;
  /** Pseudonymized — never the raw student id (section 118 "Protect student privacy"). */
  studentHash: string;
  reportType: ReportType;
  description?: string;
  status: 'OPEN' | 'RESOLVED';
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  createdAt: string;
}

export interface ReviewRecord {
  id: string;
  questionVersionId: string;
  reviewerId: string;
  decision: ReviewDecision;
  reason?: string;
  overrideReason?: string;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  questionId: string;
  action: string;
  actor: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface HistoricalStats {
  accuracyRate: number;
  sampleSize: number;
  avgResponseTimeMs?: number;
}

export interface QuestionFamily {
  id: string;
  name: string;
  skill?: string;
  structuralSignature?: string;
  memberQuestionIds: string[];
}

/** Input shape accepted by QuestionQualityService.createAndValidate — everything a
 *  QuestionVersion needs except the ids/version-number/createdAt the service assigns. */
export type NewQuestionInput = Omit<QuestionVersion, 'id' | 'questionId' | 'versionNumber' | 'createdAt'> & {
  tenantId?: string;
  isGlobal?: boolean;
};
