import type { QuestionVersionSnapshot, ValidationRunResult } from "../contracts/types.js";

export type FreshnessVerdict =
  | { fresh: true }
  | { fresh: false; reasons: FreshnessReason[] };

export type FreshnessReason =
  | { kind: "VERSION_CHANGED"; runVersionNumber: number; currentVersionNumber: number }
  | { kind: "CONTENT_HASH_CHANGED"; runContentHash: string; currentContentHash: string }
  | { kind: "VALIDATOR_VERSION_CHANGED"; validator: string; runVersion: string; currentVersion: string }
  | { kind: "VALIDATOR_REMOVED"; validator: string }
  | { kind: "VALIDATOR_ADDED"; validator: string }
  | { kind: "DEPENDENCY_DRIFTED"; dependency: string };

/**
 * spec §57–§59: "Question v1 validation cannot silently validate v2." A stored
 * ValidationRunResult is fresh only if ALL of the following still match the
 * question RIGHT NOW:
 *   1. the exact version identity (versionNumber + contentHash), and
 *   2. the exact set of validator versions that were used to produce it.
 *
 * Dependency drift (spec §144 — a referenced skill/formula/asset/scoring rule
 * changed) is exposed as an extension seam: callers who track dependency
 * versions can pass `dependencyVersions` and get it folded into the verdict;
 * this delivery does not implement a real dependency-version tracker (see
 * TRUTH_TABLE.md), so omitting the argument simply skips that check rather
 * than silently pretending it passed.
 */
export class ValidationFreshnessService {
  isFresh(
    run: ValidationRunResult,
    currentSnapshot: QuestionVersionSnapshot,
    currentValidatorVersions: Record<string, string>,
    dependencyVersions?: { name: string; currentVersion: string; recordedVersion: string }[]
  ): FreshnessVerdict {
    const reasons: FreshnessReason[] = [];

    if (run.versionNumber !== currentSnapshot.versionNumber) {
      reasons.push({ kind: "VERSION_CHANGED", runVersionNumber: run.versionNumber, currentVersionNumber: currentSnapshot.versionNumber });
    }
    if (run.contentHash !== currentSnapshot.contentHash) {
      reasons.push({ kind: "CONTENT_HASH_CHANGED", runContentHash: run.contentHash, currentContentHash: currentSnapshot.contentHash });
    }

    for (const [validatorName, versionUsed] of Object.entries(run.validatorVersionSet)) {
      const currentVersion = currentValidatorVersions[validatorName];
      if (currentVersion === undefined) {
        reasons.push({ kind: "VALIDATOR_REMOVED", validator: validatorName });
      } else if (currentVersion !== versionUsed) {
        reasons.push({ kind: "VALIDATOR_VERSION_CHANGED", validator: validatorName, runVersion: versionUsed, currentVersion });
      }
    }
    for (const validatorName of Object.keys(currentValidatorVersions)) {
      if (!(validatorName in run.validatorVersionSet)) {
        reasons.push({ kind: "VALIDATOR_ADDED", validator: validatorName });
      }
    }

    for (const dep of dependencyVersions ?? []) {
      if (dep.currentVersion !== dep.recordedVersion) {
        reasons.push({ kind: "DEPENDENCY_DRIFTED", dependency: dep.name });
      }
    }

    return reasons.length === 0 ? { fresh: true } : { fresh: false, reasons };
  }
}
