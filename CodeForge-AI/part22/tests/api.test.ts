import { describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp } from "../src/api/app.js";
import { InMemoryDebuggingRepository } from "../src/repository/repository.js";
import { ProcessSandboxExecutor } from "../src/sandbox/executor.js";
import { AIProviderRouter } from "../src/ai/providers.js";

function makeApp() {
  return buildApp({ repository: new InMemoryDebuggingRepository(), executor: new ProcessSandboxExecutor(), aiRouter: new AIProviderRouter([]) });
}

const BUGGY_CODE = ["import sys", "n = int(sys.stdin.read().strip())", "total = 0", "for i in range(n - 1):", "    total += i", "print(total)"].join("\n");

describe("Debugging Mode API - full happy path", () => {
  it("create -> reproduce -> hypothesis -> experiment -> root cause -> fix -> result", async () => {
    const app = makeApp();

    const createRes = await request(app).post("/sessions").send({ challengeId: "c1", language: "python", startingCode: BUGGY_CODE });
    expect(createRes.status).toBe(201);
    const sessionId = createRes.body.id as string;
    expect(createRes.body.state).toBe("IN_PROGRESS");

    const reproRes = await request(app).post(`/sessions/${sessionId}/reproduce`).send({ input: "5", expectedOutput: "10" });
    expect(reproRes.status).toBe(200);
    expect(reproRes.body.reproductionStatus).toBe("REPRODUCED");
    expect(reproRes.body.fingerprint.failureType).toBe("WRONG_ANSWER");

    const hypRes = await request(app)
      .post(`/sessions/${sessionId}/hypotheses`)
      .send({ text: "loop boundary is off by one", suspectedLocation: "main.py line 4" });
    expect(hypRes.status).toBe(201);
    const hypothesisId = hypRes.body.id as string;

    const expRes = await request(app)
      .post(`/sessions/${sessionId}/experiments`)
      .send({ hypothesisId, action: "run with n=1 and inspect the loop range", expectedResult: "total stays 0" });
    expect(expRes.status).toBe(201);
    const experimentId = expRes.body.id as string;

    const resolveExpRes = await request(app)
      .patch(`/sessions/${sessionId}/experiments/${experimentId}`)
      .send({ actualResult: "total=0, loop ran zero times because range(n-1) with n=1 is range(0)", conclusion: "SUPPORTED" });
    expect(resolveExpRes.status).toBe(200);

    const resolveHypRes = await request(app).patch(`/sessions/${sessionId}/hypotheses/${hypothesisId}`).send({ status: "SUPPORTED" });
    expect(resolveHypRes.status).toBe(200);
    expect(resolveHypRes.body.status).toBe("SUPPORTED");

    const rootCauseRes = await request(app)
      .post(`/sessions/${sessionId}/root-cause`)
      .send({
        symptom: "wrong total returned",
        location: "main.py line 4",
        cause: "loop excludes the last index",
        rootCause: "range(n - 1) should be range(n)",
        supportingEvidence: [{ type: "EXPERIMENT", ref: experimentId }]
      });
    expect(rootCauseRes.status).toBe(200);
    expect(rootCauseRes.body.valid).toBe(true);

    const sessionAfterRootCause = await request(app).get(`/sessions/${sessionId}`);
    expect(sessionAfterRootCause.body.state).toBe("ROOT_CAUSE_IDENTIFIED");

    const FIXED_CODE = BUGGY_CODE.replace("range(n - 1)", "range(n)");
    const fixRes = await request(app)
      .post(`/sessions/${sessionId}/fix`)
      .send({
        newCode: FIXED_CODE,
        originalFailingTest: { id: "orig", input: "5", expectedOutput: "10" },
        hiddenTests: [
          { id: "h1", input: "3", expectedOutput: "3" },
          { id: "h2", input: "1", expectedOutput: "0" }
        ]
      });
    expect(fixRes.status).toBe(200);
    expect(fixRes.body.regression.overallPass).toBe(true);
    expect(fixRes.body.session.state).toBe("RESOLVED");

    const resultRes = await request(app).get(`/sessions/${sessionId}/result`);
    expect(resultRes.status).toBe(200);
    expect(resultRes.body.status).not.toBe("INSUFFICIENT_EVIDENCE");
    expect(resultRes.body.rootCause).not.toBeNull();
    const rootCauseDim = resultRes.body.dimensions.find((d: { dimension: string }) => d.dimension === "ROOT_CAUSE_ANALYSIS");
    expect(rootCauseDim.status).toBe("SCORED");

    // The /fix call's regression/overfitting outcome must survive into the
    // aggregated /result response, not just the immediate /fix response -
    // this was a real gap found and fixed while building this.
    expect(resultRes.body.regression).not.toBeNull();
    expect(resultRes.body.regression.overallPass).toBe(true);
    const regressionDim = resultRes.body.dimensions.find((d: { dimension: string }) => d.dimension === "REGRESSION_VERIFICATION");
    expect(regressionDim.status).toBe("SCORED");
    const fixQualityDim = resultRes.body.dimensions.find((d: { dimension: string }) => d.dimension === "FIX_QUALITY");
    expect(fixQualityDim.status).toBe("SCORED");
    expect(fixQualityDim.score).toBeGreaterThanOrEqual(75);
  }, 30_000);

  it("correctly reports an unresolved-fix path: a fix that only patches the visible case still fails hidden tests", async () => {
    const app = makeApp();
    const createRes = await request(app).post("/sessions").send({ challengeId: "c1", language: "python", startingCode: BUGGY_CODE });
    const sessionId = createRes.body.id as string;
    await request(app).post(`/sessions/${sessionId}/reproduce`).send({ input: "5", expectedOutput: "10" });
    await request(app)
      .post(`/sessions/${sessionId}/root-cause`)
      .send({ symptom: "s", location: "l", cause: "c", rootCause: "r", supportingEvidence: [{ type: "CODE_LOCATION", ref: "main.py:4" }] });

    // "Fix" that hard-codes the one visible case instead of fixing the loop.
    const HARDCODED_FIX = ["import sys", "n = int(sys.stdin.read().strip())", "print(10 if n == 5 else -1)"].join("\n");

    const fixRes = await request(app)
      .post(`/sessions/${sessionId}/fix`)
      .send({
        newCode: HARDCODED_FIX,
        originalFailingTest: { id: "orig", input: "5", expectedOutput: "10" },
        hiddenTests: [
          { id: "h1", input: "3", expectedOutput: "3" },
          { id: "h2", input: "1", expectedOutput: "0" }
        ]
      });
    expect(fixRes.status).toBe(200);
    expect(fixRes.body.regression.overallPass).toBe(false);
    expect(fixRes.body.overfitting.suspected).toBe(true);
    expect(fixRes.body.session.state).toBe("FAILED");
  }, 20_000);
});

describe("Debugging Mode API - authorization and validation", () => {
  it("enforces session ownership - a different user cannot access someone else's session", async () => {
    const app = makeApp();
    const createRes = await request(app).post("/sessions").set("x-user-id", "alice").send({ challengeId: "c1", language: "python", startingCode: "print(1)" });
    const sessionId = createRes.body.id as string;
    const otherUserRes = await request(app).get(`/sessions/${sessionId}`).set("x-user-id", "bob");
    expect(otherUserRes.status).toBe(403);
  });

  it("rejects submitting a fix before a root cause has been identified (409)", async () => {
    const app = makeApp();
    const createRes = await request(app).post("/sessions").send({ challengeId: "c1", language: "python", startingCode: "print(1)" });
    const sessionId = createRes.body.id as string;
    const fixRes = await request(app)
      .post(`/sessions/${sessionId}/fix`)
      .send({ newCode: "print(2)", originalFailingTest: { id: "o", input: "", expectedOutput: "2" } });
    expect(fixRes.status).toBe(409);
  });

  it("rejects marking a hypothesis SUPPORTED without a resolved experiment (422)", async () => {
    const app = makeApp();
    const createRes = await request(app).post("/sessions").send({ challengeId: "c1", language: "python", startingCode: "print(1)" });
    const sessionId = createRes.body.id as string;
    const hypRes = await request(app).post(`/sessions/${sessionId}/hypotheses`).send({ text: "guess" });
    const resolveRes = await request(app).patch(`/sessions/${sessionId}/hypotheses/${hypRes.body.id}`).send({ status: "SUPPORTED" });
    expect(resolveRes.status).toBe(422);
  });

  it("rejects an invalid root-cause chain with no evidence (422)", async () => {
    const app = makeApp();
    const createRes = await request(app).post("/sessions").send({ challengeId: "c1", language: "python", startingCode: "print(1)" });
    const sessionId = createRes.body.id as string;
    const rcRes = await request(app)
      .post(`/sessions/${sessionId}/root-cause`)
      .send({ symptom: "x", location: "y", cause: "z", rootCause: "w", supportingEvidence: [] });
    expect(rcRes.status).toBe(422);
  });

  it("rejects malformed request bodies with 400 rather than a 500", async () => {
    const app = makeApp();
    const res = await request(app).post("/sessions").send({ challengeId: "", language: "cobol", startingCode: "x" });
    expect(res.status).toBe(400);
  });

  it("returns a working hint with zero AI keys configured (deterministic fallback), never a 500", async () => {
    const app = makeApp();
    const createRes = await request(app).post("/sessions").send({ challengeId: "c1", language: "python", startingCode: BUGGY_CODE });
    const sessionId = createRes.body.id as string;
    await request(app).post(`/sessions/${sessionId}/reproduce`).send({ input: "5", expectedOutput: "10" });
    const hintRes = await request(app).post(`/sessions/${sessionId}/hints`).send({});
    expect(hintRes.status).toBe(200);
    expect(hintRes.body.source).toBe("fallback");
    expect(hintRes.body.rung).toBe("OBSERVE");
  }, 15_000);

  it("returns 404 for a session that does not exist", async () => {
    const app = makeApp();
    const res = await request(app).get("/sessions/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });
});
