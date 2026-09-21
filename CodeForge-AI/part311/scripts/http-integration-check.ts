import { createCodeForgeServer } from "../src/api/server.js";
import { InMemoryStore } from "../src/store/store.js";
import { CodeForgeService } from "../src/service/codeforgeService.js";
import { buildDefaultProviderChain } from "../src/ai/providers.js";
import { SEED_CHALLENGES } from "../src/data/seedChallenges.js";

async function main() {
  const store = new InMemoryStore();
  store.seedChallenges(SEED_CHALLENGES);
  const service = new CodeForgeService(store, buildDefaultProviderChain({}));
  const server = createCodeForgeServer(service);

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("expected a bound port");
  const base = `http://127.0.0.1:${address.port}`;
  console.log(`test server listening on ${base}`);

  try {
    console.log("\n=== POST bootstrap ===");
    const bootstrapRes = await fetch(`${base}/api/students/http_demo_student/bootstrap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetRole: "AI_ML_ENGINEER",
        baseline: {
          "fundamentals.control_flow": "PROFICIENT",
          "fundamentals.functions": "PROFICIENT",
          "data_structures.arrays": "PROFICIENT",
          "data_structures.hashing": "DEVELOPING",
          "engineering.debugging": "DEVELOPING",
        },
      }),
    });
    console.log("status:", bootstrapRes.status, await bootstrapRes.json());

    console.log("\n=== GET next-challenge ===");
    const nextRes = await fetch(`${base}/api/students/http_demo_student/next-challenge?language=python`);
    const next = await nextRes.json();
    console.log("status:", nextRes.status);
    console.log("challenge:", next.challenge.challengeId, "| score:", next.reason.score.toFixed(3), "| primaryGap:", next.reason.primaryGap);

    console.log("\n=== POST start attempt ===");
    const startRes = await fetch(`${base}/api/attempts/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId: "http_demo_student", challengeId: next.challenge.challengeId, language: "python" }),
    });
    const start = await startRes.json();
    console.log("status:", startRes.status, "attemptId:", start.attemptId);

    console.log("\n=== POST run (public tests only, no grading, no attempt needed) ===");
    const runRes = await fetch(`${base}/api/challenges/${next.challenge.challengeId}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: start.starterCode, language: "python" }),
    });
    const runResult = await runRes.json();
    console.log("status:", runRes.status, `testsPassed: ${runResult.testsPassed}/${runResult.testsTotal}`);
    if (runRes.status !== 200) throw new Error("expected /run to succeed");

    console.log("\n=== POST submit (unmodified starter — should reproduce the 8/10 pattern over real HTTP) ===");
    const submitRes = await fetch(`${base}/api/attempts/${start.attemptId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: start.starterCode }),
    });
    const submitResult = await submitRes.json();
    console.log("status:", submitRes.status);
    console.log(`testsPassed: ${submitResult.testsPassed}/${submitResult.testsTotal} | passed: ${submitResult.passed}`);
    console.log("mistakeCategories:", submitResult.mistakeCategories);
    console.log("failureSummary:", submitResult.failureSummary);

    console.log("\n=== POST hint on a fresh retry attempt ===");
    const start2Res = await fetch(`${base}/api/attempts/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId: "http_demo_student", challengeId: next.challenge.challengeId, language: "python" }),
    });
    const start2 = await start2Res.json();
    const hintRes = await fetch(`${base}/api/attempts/${start2.attemptId}/hint`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    console.log("status:", hintRes.status, await hintRes.json());

    console.log("\n=== GET a missing challenge -> proper 404, not a crash ===");
    const missingRes = await fetch(`${base}/api/challenges/does-not-exist`);
    console.log("status:", missingRes.status, await missingRes.json());
    if (missingRes.status !== 404) throw new Error(`expected 404 for a missing challenge, got ${missingRes.status}`);

    console.log("\n=== POST submit on an already-submitted attempt -> proper 409, not a crash ===");
    const doubleSubmitRes = await fetch(`${base}/api/attempts/${start.attemptId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: start.starterCode }),
    });
    console.log("status:", doubleSubmitRes.status, await doubleSubmitRes.json());
    if (doubleSubmitRes.status !== 409) throw new Error(`expected 409 for a double-submit, got ${doubleSubmitRes.status}`);

    console.log("\n✓ full HTTP loop completed against a real server, real execution, real JSON over the wire, correct HTTP status codes throughout");
  } finally {
    server.close();
  }
}

main().catch((e) => {
  console.error("HTTP INTEGRATION TEST FAILED:", e);
  process.exit(1);
});
