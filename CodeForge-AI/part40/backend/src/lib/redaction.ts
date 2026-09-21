/**
 * SECRET REDACTION
 * -----------------------------------------------------------------------
 * One place that knows what a secret-shaped field looks like. Used by:
 *  - lib/logger.ts (pino `redact` paths, structural — fast, exact keys)
 *  - here: `redactValue` / `sanitizeForAudit`, content-shaped — catches
 *    secrets embedded inside free-text or nested/unknown-shaped objects
 *    before they ever reach an audit_event / security_event row.
 *
 * Defense in depth: pino redaction stops known key paths; sanitizeForAudit
 * additionally scans values so a bearer token pasted into a description
 * field doesn't slip through just because it wasn't under a "known" key.
 */

const SENSITIVE_KEY_PATTERN =
  /(password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|authorization|auth[_-]?header|refresh[_-]?token|jwt|credential|ssn|card[_-]?number|cvv)/i;

// Patterns of things that look like secrets even under an innocuous key name.
const SECRET_SHAPED_VALUE_PATTERNS: RegExp[] = [
  /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/i, // Authorization: Bearer <token>
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/, // JWT shape
  /\bsk-[A-Za-z0-9]{20,}\b/, // generic "sk-..." style provider key
  /\bAKIA[0-9A-Z]{16}\b/ // AWS access key id shape
];

export const REDACTED = "[REDACTED]";

/** Structural key paths for pino's built-in `redact` option (exact/glob key match, very fast). */
export const PINO_REDACT_PATHS: string[] = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.body.password",
  "req.body.token",
  "req.body.access_token",
  "req.body.refresh_token",
  "req.body.api_key",
  "*.password",
  "*.token",
  "*.secret",
  "*.apiKey",
  "*.api_key",
  "*.accessToken",
  "*.refreshToken",
  "*.authorization"
];

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

function redactSecretShapedSubstrings(value: string): string {
  let out = value;
  for (const pattern of SECRET_SHAPED_VALUE_PATTERNS) {
    out = out.replace(pattern, REDACTED);
  }
  return out;
}

/**
 * Deep-clones `input`, replacing any value under a sensitive-looking key
 * with REDACTED, and scrubbing secret-shaped substrings out of remaining
 * strings. Bounded depth/size so a hostile payload can't be used to hang
 * the audit pipeline.
 */
export function sanitizeForAudit(input: unknown, depth = 0): unknown {
  const MAX_DEPTH = 6;
  if (depth > MAX_DEPTH) return "[TRUNCATED]";

  if (input === null || input === undefined) return input;

  if (typeof input === "string") {
    const MAX_STRING = 2000;
    const scrubbed = redactSecretShapedSubstrings(input);
    return scrubbed.length > MAX_STRING ? scrubbed.slice(0, MAX_STRING) + "…[truncated]" : scrubbed;
  }

  if (typeof input === "number" || typeof input === "boolean") return input;

  if (Array.isArray(input)) {
    const MAX_ITEMS = 50;
    return input.slice(0, MAX_ITEMS).map((item) => sanitizeForAudit(item, depth + 1));
  }

  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      out[key] = isSensitiveKey(key) ? REDACTED : sanitizeForAudit(value, depth + 1);
    }
    return out;
  }

  // functions, symbols, bigint, etc. — never persist
  return "[UNSERIALIZABLE]";
}
