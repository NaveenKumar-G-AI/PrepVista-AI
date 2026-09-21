import type { ValidationResult, OverallStatus, Severity, ErrorCode, EligibilityByMode } from "../contracts/types.js";
import { maxSeverity, severityAtLeast } from "../contracts/types.js";
import type { ValidationProfile } from "../profiles/validationProfiles.js";
import { ELIGIBILITY_PROFILE_MAP } from "../profiles/validationProfiles.js";

/**
 * spec §88–§93: the aggregator's whole job is to compute an overall verdict
 * WITHOUT throwing away any individual validator's result, and without ever
 * collapsing everything into "Validation Score = 83" (spec §89 — explicitly
 * forbidden). Every result stays inspectable in `results`; this module only
 * adds a rollup on top.
 */

const STATUS_PRECEDENCE: Record<OverallStatus, number> = {
  VALID: 0,
  VALID_WITH_WARNINGS: 1,
  REVIEW_REQUIRED: 2,
  VALIDATION_ERROR: 3,
  INVALID: 4,
  STALE: 5 // reserved for the freshness service wrapping a *stored* run — see freshness/README
};

function worse(a: OverallStatus, b: OverallStatus): OverallStatus {
  return STATUS_PRECEDENCE[a] >= STATUS_PRECEDENCE[b] ? a : b;
}

/** Codes that describe "we don't have an AI opinion" rather than "AI found
 *  something" — informational about the RUN's infrastructure, not a finding
 *  about the CONTENT. Left as ordinary contributions, every question in a
 *  deployment without an AI key configured would permanently show
 *  VALID_WITH_WARNINGS, making that status meaningless (a real bug caught by
 *  the end-to-end integration test, not by any single validator's unit test). */
const AI_INFRASTRUCTURE_CODES: ReadonlySet<string> = new Set(["AI_UNAVAILABLE", "AI_OUTPUT_INVALID"]);

/** One result's contribution to the overall verdict. Required-ness changes how
 *  harshly a FAIL/ERROR is treated (spec §91 vs §103 — AI, never required, can
 *  push toward REVIEW but never unilaterally to INVALID). */
function contributionOf(result: ValidationResult, isRequired: boolean): OverallStatus {
  if (AI_INFRASTRUCTURE_CODES.has(result.code)) return "VALID";
  switch (result.status) {
    case "FAIL":
      if (isRequired && severityAtLeast(result.severity, "HIGH")) return "INVALID";
      if (severityAtLeast(result.severity, "MEDIUM")) return "REVIEW_REQUIRED";
      return "VALID_WITH_WARNINGS";
    case "PASS_WITH_WARNING":
      if (severityAtLeast(result.severity, "HIGH")) return "REVIEW_REQUIRED";
      return "VALID_WITH_WARNINGS";
    case "ERROR":
      return isRequired ? "VALIDATION_ERROR" : "VALID_WITH_WARNINGS";
    case "SKIPPED":
      // The dependency that caused the skip already contributes its own
      // (worse) status — don't double-penalize the same root cause twice.
      return "VALID";
    case "PASS":
    case "NOT_APPLICABLE":
    default:
      return "VALID";
  }
}

export interface AggregationOutput {
  overallStatus: OverallStatus;
  highestSeverity: Severity;
  blockingCodes: ErrorCode[];
  eligibility: EligibilityByMode;
}

export function aggregate(results: ValidationResult[], primaryProfile: ValidationProfile): AggregationOutput {
  if (results.length === 0) {
    // Fail-safe principle (spec §87): zero evidence is never treated as VALID.
    return {
      overallStatus: "VALIDATION_ERROR",
      highestSeverity: "MEDIUM",
      blockingCodes: ["VALIDATOR_UNAVAILABLE"],
      eligibility: { practice: false, timed: false, assessment: false }
    };
  }

  const overallStatus = computeStatusFor(results, primaryProfile);
  const highestSeverity = results.reduce<Severity>((acc, r) => maxSeverity(acc, r.severity), "NONE");
  const blockingCodes = results
    .filter((r) => {
      const required = primaryProfile.required.includes(r.validator);
      const c = contributionOf(r, required);
      return c === "INVALID" || c === "VALIDATION_ERROR";
    })
    .map((r) => r.code);

  const eligibility: EligibilityByMode = {
    practice: isEligibleFor(results, ELIGIBILITY_PROFILE_MAP.practice),
    timed: isEligibleFor(results, ELIGIBILITY_PROFILE_MAP.timed),
    assessment: isEligibleFor(results, ELIGIBILITY_PROFILE_MAP.assessment)
  };

  return { overallStatus, highestSeverity, blockingCodes, eligibility };
}

function computeStatusFor(results: ValidationResult[], profile: ValidationProfile): OverallStatus {
  let status: OverallStatus = "VALID";
  const byName = new Map(results.map((r) => [r.validator, r]));
  // A profile's status must only be influenced by validators IT lists (required
  // or optional) — never by some other, unrelated validator that merely happens
  // to be present in `results` because a stricter profile ran in the same batch
  // (spec §184's eligibility matrix is only meaningful if each column is judged
  // strictly on its own profile's criteria). Real bug found via testing: without
  // this filter, ASSESSMENT_COMPATIBILITY_VALIDATOR failing could wrongly sink
  // PRACTICE eligibility even though practice never asked about it.
  const relevant = new Set([...profile.required, ...profile.optional]);
  for (const requiredName of profile.required) {
    const r = byName.get(requiredName);
    if (!r) {
      // Required validator never even ran for this profile — cannot claim eligibility.
      status = worse(status, "VALIDATION_ERROR");
      continue;
    }
    status = worse(status, contributionOf(r, true));
  }
  for (const r of results) {
    if (profile.required.includes(r.validator)) continue; // already counted above
    if (!relevant.has(r.validator)) continue; // not this profile's concern
    status = worse(status, contributionOf(r, false));
  }
  return status;
}

function isEligibleFor(results: ValidationResult[], profile: ValidationProfile): boolean {
  const status = computeStatusFor(results, profile);
  // A mode is eligible only on a clean or warnings-only read of ITS OWN required set.
  return status === "VALID" || status === "VALID_WITH_WARNINGS";
}
