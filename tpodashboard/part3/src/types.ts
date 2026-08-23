// Core domain types for the PrepVista eligibility engine.
//
// This is a standalone slice: Student here is a minimal stand-in for
// whatever Student model Parts 1-2 of PrepVista actually define. Field
// names should be reconciled with the real schema once available -
// see README.md.

export type NumericField =
  | "cgpa"
  | "tenthPercentage"
  | "twelfthPercentage"
  | "diplomaPercentage"
  | "activeBacklogs"
  | "totalBacklogs"
  | "graduationYear"
  | "semester"
  | "internshipCount"
  | "experienceMonths";

export type CategoricalField = "department" | "program" | "course" | "placementStatus";

export type ArrayField = "skills" | "certifications";

export type EligibilityField = NumericField | CategoricalField | ArrayField;

export type Comparator =
  | "EQ"
  | "NEQ"
  | "GTE"
  | "GT"
  | "LTE"
  | "LT"
  | "IN"
  | "NOT_IN"
  | "HAS"
  | "HAS_ALL";

// Matches the bucket names used in the drive's eligibility summary
// (section 22/23 of the spec): everything not CGPA/backlog/department
// rolls up into OTHER for the summary view, while the full field-level
// detail stays available on each LeafExplanation.
export type FailureCategory = "CGPA" | "BACKLOG" | "DEPARTMENT" | "OTHER";

export interface RuleLeaf {
  kind: "LEAF";
  id: string;
  field: EligibilityField;
  comparator: Comparator;
  value: string | number | string[];
  category: FailureCategory;
  label?: string;
}

export interface RuleGroup {
  kind: "AND" | "OR";
  id: string;
  children: RuleNode[];
}

export interface RuleNot {
  kind: "NOT";
  id: string;
  child: RuleNode;
}

export type RuleNode = RuleLeaf | RuleGroup | RuleNot;

export interface Student {
  id: string;
  name: string;
  department: string;
  program: string;
  course?: string;
  graduationYear: number;
  semester?: number;
  cgpa: number;
  tenthPercentage?: number;
  twelfthPercentage?: number;
  diplomaPercentage?: number;
  activeBacklogs: number;
  totalBacklogs: number;
  skills: string[];
  certifications: string[];
  internshipCount: number;
  experienceMonths: number;
  placementStatus: "UNPLACED" | "PLACED" | "OPTED_OUT";
}

export interface LeafExplanation {
  leafId: string;
  field: EligibilityField;
  comparator: Comparator;
  expected: string | number | string[];
  actual: unknown;
  passed: boolean;
  category: FailureCategory;
  description: string;
}

export interface EligibilityResult {
  studentId: string;
  eligible: boolean;
  leafResults: LeafExplanation[];
  failedLeaves: LeafExplanation[];
  primaryFailureCategory: FailureCategory | null;
  ruleVersion: number;
  evaluatedAt: string;
}
