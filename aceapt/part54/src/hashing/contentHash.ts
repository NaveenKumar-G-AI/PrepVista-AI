import { createHash } from "node:crypto";
import type { QuestionVersionSnapshot } from "../contracts/types.js";

/**
 * Deterministic hash of everything about a question version that validators
 * actually look at. Two snapshots with the same hash are guaranteed to validate
 * identically for a given validator-version set (spec §60, §96 reproducibility).
 *
 * Deliberately EXCLUDES fields that don't affect validation truth (e.g. a
 * reviewer note, `updatedAt`) — spec §62: "changing reviewer note should not
 * invalidate MathValidator." Everything included here is exactly what a
 * validator is allowed to read.
 */
export function computeContentHash(
  snapshot: Omit<QuestionVersionSnapshot, "contentHash" | "updatedAt">
): string {
  const canonical = canonicalize({
    questionId: snapshot.questionId,
    versionId: snapshot.versionId,
    versionNumber: snapshot.versionNumber,
    tenantId: snapshot.tenantId,
    isGlobal: snapshot.isGlobal,
    purpose: snapshot.purpose,
    questionText: snapshot.questionText,
    answerType: snapshot.answerType,
    answer: snapshot.answer,
    options: snapshot.options,
    solution: snapshot.solution,
    derivation: snapshot.derivation,
    units: snapshot.units,
    skill: snapshot.skill,
    difficulty: snapshot.difficulty,
    assets: snapshot.assets,
    passage: snapshot.passage,
    renderBlocks: snapshot.renderBlocks,
    origin: snapshot.origin
  });
  return "sha256:" + createHash("sha256").update(canonical).digest("hex");
}

/** Stable stringify: sorts object keys recursively so key order never changes the hash. */
function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/** Composite cache key (spec §61): version identity + validator version + mode. */
export function cacheKey(contentHash: string, validatorName: string, validatorVersion: string, mode: string): string {
  return `${contentHash}::${validatorName}@${validatorVersion}::${mode}`;
}
