/**
 * CodeForge AI — Submission System
 * Regex-based sanitization only — no AI in this path (see resultAggregation.ts header:
 * deterministic systems remain authoritative for anything student-facing that could
 * affect trust). Strips container-internal paths and worker identifiers from compiler/
 * runtime output before it's stored or shown to a student.
 */

const ABS_PATH_PATTERN = /\/(?:home|tmp|var|usr|mnt|root|proc)\/[^\s:'"()]+/g;
const WORKER_ID_PATTERN = /\bworker-[a-zA-Z0-9-]+\b/g;
const MAX_OUTPUT_CHARS = 8000;

export function sanitizeCompilerOutput(raw: string): string {
  return raw
    .replace(ABS_PATH_PATTERN, '<path>')
    .replace(WORKER_ID_PATTERN, '<worker>')
    .slice(0, MAX_OUTPUT_CHARS);
}
