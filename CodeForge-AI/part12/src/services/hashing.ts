/**
 * CodeForge AI — Submission System
 * Cryptographic fingerprints for source payloads. Used for integrity verification,
 * duplicate detection, and (optionally) safe result caching — never as a replacement
 * for the submission ID itself (see resultAggregation.ts's cache-key note).
 */
import { createHash } from 'node:crypto';
import type { SubmissionFileInput } from '../domain/types.js';

export function sha256Hex(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export function byteLength(content: string): number {
  return Buffer.byteLength(content, 'utf8');
}

/**
 * Deterministic across file ordering: sorted by `path` before hashing, so two logically
 * identical multi-file submissions fingerprint identically regardless of the order the
 * client attached files in. Each file's role/ordinal is folded in too, since a file
 * moved to a different role/position is a materially different submission.
 */
export function computeSourceFingerprint(files: readonly SubmissionFileInput[]): string {
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  const manifest = sorted
    .map((f) => `${f.path}\u0000${f.role}\u0000${f.ordinal}\u0000${sha256Hex(f.content)}`)
    .join('\u0001');
  return sha256Hex(manifest);
}

export function computeFileHashes(
  files: readonly SubmissionFileInput[],
): (SubmissionFileInput & { sizeBytes: number; sha256: string })[] {
  return files.map((f) => ({ ...f, sizeBytes: byteLength(f.content), sha256: sha256Hex(f.content) }));
}
