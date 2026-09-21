import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PgDebuggingRepository } from "../src/repository/pgRepository.js";
import { createSession } from "../src/debugging/session.js";
import { createHypothesis } from "../src/debugging/investigation.js";
import type { RootCauseChain } from "../src/types.js";

const DATABASE_URL = process.env["DATABASE_URL"];
const describeIfDb = DATABASE_URL ? describe : describe.skip;

describeIfDb("PgDebuggingRepository (live Postgres, matches db/schema.sql)", () => {
  let repo: PgDebuggingRepository;

  beforeAll(() => {
    repo = new PgDebuggingRepository(DATABASE_URL!);
  });

  afterAll(async () => {
    await repo.close();
  });

  it("round-trips a session through insert, read, and update", async () => {
    const s = createSession({
      id: randomUUID(),
      userId: randomUUID(),
      challengeId: randomUUID(),
      submissionId: null,
      language: "python",
      startingCode: "print(1)"
    });
    const created = await repo.createSession(s);
    expect(created.id).toBe(s.id);

    const fetched = await repo.getSession(s.id);
    expect(fetched?.currentCode).toBe("print(1)");

    const updated = await repo.updateSession({ ...s, state: "IN_PROGRESS", currentCode: "print(2)" });
    expect(updated.state).toBe("IN_PROGRESS");

    const refetched = await repo.getSession(s.id);
    expect(refetched?.currentCode).toBe("print(2)");
  });

  it("persists and retrieves a hypothesis scoped to its session", async () => {
    const sessionId = randomUUID();
    await repo.createSession(
      createSession({ id: sessionId, userId: randomUUID(), challengeId: randomUUID(), submissionId: null, language: "python", startingCode: "" })
    );
    await repo.createHypothesis(createHypothesis({ id: randomUUID(), sessionId, text: "off by one" }));
    const list = await repo.getHypothesesForSession(sessionId);
    expect(list).toHaveLength(1);
    expect(list[0]?.text).toBe("off by one");
  });

  it("round-trips a root-cause chain through the jsonb column", async () => {
    const sessionId = randomUUID();
    await repo.createSession(
      createSession({ id: sessionId, userId: randomUUID(), challengeId: randomUUID(), submissionId: null, language: "python", startingCode: "" })
    );
    const chain: RootCauseChain = {
      symptom: "s",
      location: "l",
      cause: "c",
      rootCause: "r",
      fix: null,
      supportingEvidence: [{ type: "EXPERIMENT", ref: "e1" }]
    };
    await repo.saveRootCause(sessionId, chain);
    const fetched = await repo.getRootCause(sessionId);
    expect(fetched).toEqual(chain);
  });

  it("saveResult is idempotent per session (on conflict update, not duplicate rows)", async () => {
    const sessionId = randomUUID();
    await repo.createSession(
      createSession({ id: sessionId, userId: randomUUID(), challengeId: randomUUID(), submissionId: null, language: "python", startingCode: "" })
    );
    const base = {
      sessionId,
      dimensions: [],
      rootCause: null,
      regression: null,
      overfitting: null,
      report: { failureSummary: "a", rootCauseSummary: "b", processSummary: "c", fixSummary: "d", verificationSummary: "e", strengths: [], improvements: [] },
      timeline: [],
      generatedAt: new Date().toISOString()
    };
    await repo.saveResult({ ...base, status: "WEAK_DEBUGGING" });
    const second = await repo.saveResult({ ...base, status: "STRONG_DEBUGGING" });
    expect(second.status).toBe("STRONG_DEBUGGING");
    const fetched = await repo.getResult(sessionId);
    expect(fetched?.status).toBe("STRONG_DEBUGGING");
  });
});
