import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { Writable } from "node:stream";
import pino from "pino";
import { sanitizeForAudit, PINO_REDACT_PATHS } from "../src/lib/redaction";
import { emitSecurityEvent, searchSecurityEvents } from "../src/security/securityEvents.service";
import { recordAuditEvent, searchAuditEvents } from "../src/audit/audit.service";
import { closePool } from "../src/db/pool";
import { resetDatabase, closeAdminClient } from "./dbAdmin";
import { ORG_A, USERS } from "./helpers";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeAdminClient();
  await closePool();
});

describe("GOLDEN LOGGING TEST — secrets never appear in logs or persisted metadata", () => {
  it("sanitizeForAudit redacts values under sensitive-looking keys, at any nesting depth", () => {
    const input = {
      username: "priya",
      password: "hunter2",
      nested: { api_key: "sk-abcdefghijklmnopqrstuvwx", ok: "keep me" },
      tokens: ["not-sensitive-array-of-strings-is-still-scanned"]
    };
    const out = sanitizeForAudit(input) as Record<string, unknown>;
    expect(out.password).toBe("[REDACTED]");
    expect((out.nested as Record<string, unknown>).api_key).toBe("[REDACTED]");
    expect((out.nested as Record<string, unknown>).ok).toBe("keep me");
    expect(out.username).toBe("priya"); // not everything gets nuked, only secret-shaped keys/values
  });

  it("sanitizeForAudit scrubs secret-SHAPED substrings even under an innocuous key name", () => {
    const input = { note: "user sent Authorization: Bearer abc123.def456.ghi789 in a support ticket" };
    const out = sanitizeForAudit(input) as Record<string, unknown>;
    expect(out.note).not.toContain("abc123.def456.ghi789");
    expect(out.note).toContain("[REDACTED]");
  });

  it("a JWT-shaped string embedded in free text is redacted even though 'note' is not a sensitive key", () => {
    const fakeJwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dQw4w9WgXcQ_fakefakefakefake";
    const out = sanitizeForAudit({ note: `token was ${fakeJwt}` }) as Record<string, unknown>;
    expect(out.note).not.toContain(fakeJwt);
  });

  it("PINO structured logger redacts known secret-shaped fields before they ever reach the log sink", async () => {
    const chunks: string[] = [];
    const sink = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(chunk.toString());
        cb();
      }
    });

    const testLogger = pino({ redact: { paths: PINO_REDACT_PATHS, censor: "[REDACTED]" } }, sink);
    testLogger.info(
      {
        req: { headers: { authorization: "Bearer super-secret-value-123" } },
        user: { password: "hunter2", apiKey: "sk-live-should-not-leak" }
      },
      "test_log_line"
    );

    const logged = chunks.join("");
    expect(logged).not.toContain("super-secret-value-123");
    expect(logged).not.toContain("hunter2");
    expect(logged).not.toContain("sk-live-should-not-leak");
    expect(logged).toContain("[REDACTED]");
  });

  it("end-to-end: a security_event emitted with a secret-shaped metadata value is redacted in what actually lands in Postgres", async () => {
    await emitSecurityEvent({
      eventType: "SUSPICIOUS_ACTIVITY",
      actorUserId: USERS.adminA.userId,
      actorRole: "ADMIN",
      organizationId: ORG_A,
      result: "SUCCESS",
      correlationId: "redaction-test-1",
      metadata: { password: "hunter2", detail: "session token eyJhbGciOiJIUzI1NiJ9.eyJmb28iOiJiYXIifQ.c2lnbmF0dXJl seen in logs" }
    });

    const events = await searchSecurityEvents(USERS.adminA, { organizationId: ORG_A, limit: 10, offset: 0 });
    const stored = events.find((e) => e.correlation_id === "redaction-test-1");
    expect(stored).toBeDefined();
    const metadataStr = JSON.stringify(stored!.metadata);
    expect(metadataStr).not.toContain("hunter2");
    expect(metadataStr).not.toContain("eyJhbGciOiJIUzI1NiJ9.eyJmb28iOiJiYXIifQ.c2lnbmF0dXJl");
  });

  it("end-to-end: an audit_event's before/after state is redacted the same way", async () => {
    await recordAuditEvent({
      actorUserId: USERS.adminA.userId,
      actorRole: "ADMIN",
      organizationId: ORG_A,
      action: "provider_credentials.rotate",
      eventType: "SECURITY_CONFIGURATION_CHANGE",
      resourceType: "ai_provider_config",
      result: "SUCCESS",
      beforeState: { apiKey: "sk-old-key-value-should-not-persist" },
      afterState: { apiKey: "sk-new-key-value-should-not-persist" },
      correlationId: "redaction-test-2"
    });

    const events = await searchAuditEvents(USERS.adminA, { organizationId: ORG_A, limit: 10, offset: 0 });
    const stored = events.find((e) => e.correlation_id === "redaction-test-2");
    expect(stored).toBeDefined();
    const combined = JSON.stringify(stored!.before_state) + JSON.stringify(stored!.after_state);
    expect(combined).not.toContain("sk-old-key-value-should-not-persist");
    expect(combined).not.toContain("sk-new-key-value-should-not-persist");
  });
});
