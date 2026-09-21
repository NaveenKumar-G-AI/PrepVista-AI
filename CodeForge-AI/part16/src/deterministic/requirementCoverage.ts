import { RequirementCoverageStatus, TestOutcome } from "../domain/enums.js";
import type { Requirement, RequirementCoverage, ExecutionEvidence, StaticFinding } from "../domain/types.js";

/**
 * For each requirement, determine coverage status from real evidence only.
 * A requirement is matched to test evidence via `relatedTags` <-> `TestResult.tags`
 * intersection — a simple, auditable, deterministic join. No LLM involved.
 */
export function computeRequirementCoverage(
  requirements: Requirement[],
  evidence: ExecutionEvidence,
  staticFindings: StaticFinding[]
): RequirementCoverage[] {
  const results = evidence.tests?.results ?? [];

  return requirements.map((req) => {
    const relatedTests = results.filter((t) => t.tags.some((tag) => req.relatedTags.includes(tag)));
    const passing = relatedTests.filter((t) => t.outcome === TestOutcome.PASS);
    const failing = relatedTests.filter((t) => t.outcome !== TestOutcome.PASS && t.outcome !== TestOutcome.SKIPPED);
    const relatedStatic = staticFindings.filter((f) => f.message.toLowerCase().includes(req.category));

    const supportingIds = [...passing.map((t) => t.id), ...relatedStatic.filter((f) => f.severity === "info").map((f) => f.ruleId)];
    const contradictingIds = [...failing.map((t) => t.id), ...relatedStatic.filter((f) => f.severity === "error").map((f) => f.ruleId)];

    let status: RequirementCoverageStatus;
    let rationale: string;

    if (relatedTests.length === 0) {
      status = RequirementCoverageStatus.UNKNOWN;
      rationale = `No available test is tagged in a way that exercises "${req.description}".`;
    } else if (failing.length === 0) {
      status = RequirementCoverageStatus.VALIDATED;
      rationale = `${passing.length}/${relatedTests.length} tagged test(s) covering this requirement pass, and none fail.`;
    } else if (passing.length === 0) {
      status = RequirementCoverageStatus.VIOLATED;
      rationale = `${failing.length}/${relatedTests.length} tagged test(s) covering this requirement fail.`;
    } else {
      status = RequirementCoverageStatus.PARTIALLY_VALIDATED;
      rationale = `${passing.length}/${relatedTests.length} tagged test(s) covering this requirement pass; ${failing.length} fail.`;
    }

    return {
      requirement: req,
      status,
      supportingEvidenceIds: [...supportingIds, ...contradictingIds],
      rationale,
    };
  });
}
