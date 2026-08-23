import type { EvidenceRepository } from "../repositories/evidenceRepository.js";
import type { EvidenceRecord, MetricValue } from "../types.js";

export class EvidenceService {
  constructor(private evidence: EvidenceRepository) {}

  /** Evidence backing a source-of-truth fact, e.g. an offer letter or joining confirmation. */
  recordSourceEvidence(input: {
    institutionId: string;
    entityType: "offer" | "joining";
    entityId: string;
    evidenceType: string;
    documentId?: string | null;
    sourceReference: string;
    verified: boolean;
    verifiedBy?: string | null;
  }): EvidenceRecord {
    return this.evidence.attach({ ...input, sourceType: "record" });
  }

  /**
   * Evidence backing a computed metric ("Placement = 82.4%" -> denominator
   * definition, population, calculation timestamp). Called once per key
   * metric when a report is officially generated (section 23 example).
   */
  recordMetricEvidence(institutionId: string, metric: MetricValue, syntheticEntityId: string): EvidenceRecord {
    const reference =
      `definition=${metric.definitionId}@v${metric.definitionVersion}; ` +
      `numerator=${metric.numerator}; denominator=${metric.denominator}; ` +
      `denominatorDefinition="${metric.denominatorDefinition}"`;
    return this.evidence.attach({
      institutionId,
      entityType: "metric_value",
      entityId: syntheticEntityId,
      evidenceType: "calculation",
      sourceType: "calculation",
      sourceReference: reference,
      verified: true, // a calculation is self-verifying given the source data is verified
      verifiedBy: "system:metric_service",
    });
  }

  forEntity(entityType: string, entityId: string): EvidenceRecord[] {
    return this.evidence.forEntity(entityType, entityId);
  }

  verify(evidenceId: string, verifiedBy: string): EvidenceRecord | null {
    return this.evidence.verify(evidenceId, verifiedBy);
  }
}
