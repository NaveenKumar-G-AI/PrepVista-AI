import pino from "pino";
import { env } from "../config/env";
import { PINO_REDACT_PATHS } from "./redaction";

/**
 * STRUCTURED LOGGING + SECRET REDACTION
 * -----------------------------------------------------------------------
 * Every log line carries: timestamp, level, service, event, request_id,
 * organization_id, status, duration (where applicable) — via `child()`
 * bindings rather than string interpolation, so logs stay machine-parseable.
 * `redact` strips known secret-shaped fields structurally before they are
 * ever serialized (see lib/redaction.ts for the content-based backstop
 * used on audit/security-event metadata specifically).
 */
export const baseLogger = pino({
  name: env.SERVICE_NAME,
  level: env.NODE_ENV === "test" ? "silent" : process.env.LOG_LEVEL || "info",
  redact: {
    paths: PINO_REDACT_PATHS,
    censor: "[REDACTED]"
  },
  formatters: {
    level(label) {
      return { level: label };
    }
  },
  timestamp: pino.stdTimeFunctions.isoTime
});

export function loggerForRequest(correlationId: string, organizationId: string | null) {
  return baseLogger.child({ request_id: correlationId, organization_id: organizationId });
}

export type Logger = typeof baseLogger;
