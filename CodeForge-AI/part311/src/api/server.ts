/**
 * CodeForge — HTTP API Server (§46)
 *
 * A thin, dependency-free HTTP layer over CodeForgeService. No Express here —
 * not a style preference, a constraint: this sandbox has no network access to
 * install it, and Node's built-in `http` module is entirely sufficient for a
 * handful of JSON routes. If the real PrepVista repository already has an
 * HTTP framework wired in (Express/Fastify/Next API routes/etc.), swap this
 * file's routing for that framework's — every route body below just calls a
 * `CodeForgeService` method and (de)serializes JSON, so there's no framework-
 * specific logic to port.
 *
 * Routes:
 *   POST /api/students/:studentId/bootstrap   { targetRole, baseline: {skill: level}[] }  — dev/demo helper, see note below
 *   GET  /api/students/:studentId/next-challenge?language=python
 *   GET  /api/challenges/:challengeId
 *   POST /api/challenges/:challengeId/run      { code, language }  — public tests only, no grading (§47 "Run" vs "Submit")
 *   POST /api/attempts/start                  { studentId, challengeId, language }
 *   POST /api/attempts/:attemptId/draft        { code }
 *   POST /api/attempts/:attemptId/hint         { level? }
 *   POST /api/attempts/:attemptId/submit       { code }
 *
 * The bootstrap route is explicitly a development/demo convenience, not a
 * real product endpoint — a real deployment establishes a student's baseline
 * from an onboarding assessment or existing PrepVista student record, not a
 * raw "set my own skill levels" API a client can call.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { RoleContext, SkillLevel, SupportedLanguage } from "../domain/types.js";
import { InMemoryStore } from "../store/store.js";
import { CodeForgeService, CodeForgeNotFoundError, CodeForgeConflictError } from "../service/codeforgeService.js";
import { buildDefaultProviderChain } from "../ai/providers.js";
import { SEED_CHALLENGES } from "../data/seedChallenges.js";

function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) req.destroy(new Error("request body too large"));
    });
    req.on("end", () => {
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body, null, 2);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(text) });
  res.end(text);
}

// §50 — structured observability events. Deliberately just stdout here (no
// real log pipeline exists to ship these to yet — see the manifest) but
// shaped as real structured events, not free-text prints.
function logEvent(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ts: new Date().toISOString(), ...fields }));
}

export function createCodeForgeServer(service: CodeForgeService) {
  return createServer(async (req, res) => {
    const start = Date.now();
    const url = new URL(req.url ?? "/", "http://localhost");
    const method = req.method ?? "GET";
    const parts = url.pathname.split("/").filter(Boolean); // ["api", ...]

    try {
      // POST /api/students/:studentId/bootstrap
      if (method === "POST" && parts[0] === "api" && parts[1] === "students" && parts[3] === "bootstrap") {
        const studentId = decodeURIComponent(parts[2]!);
        const body = await readBody(req);
        const targetRole = (body.targetRole as RoleContext) ?? RoleContext.GENERAL_SWE;
        service.ensureProfile(studentId, targetRole);
        const baseline: Record<string, SkillLevel> = body.baseline ?? {};
        for (const [skill, level] of Object.entries(baseline)) {
          service.seedSkillBaseline(studentId, skill, level);
        }
        logEvent("student_bootstrapped", { studentId, targetRole, skillCount: Object.keys(baseline).length });
        return sendJson(res, 200, { ok: true, studentId, targetRole, baseline });
      }

      // GET /api/students/:studentId/next-challenge
      if (method === "GET" && parts[0] === "api" && parts[1] === "students" && parts[3] === "next-challenge") {
        const studentId = decodeURIComponent(parts[2]!);
        const language = (url.searchParams.get("language") as SupportedLanguage) ?? SupportedLanguage.PYTHON;
        const result = service.getNextChallenge(studentId, language);
        logEvent("challenge_selected", { studentId, challengeId: result?.challenge.challengeId ?? null });
        if (!result) return sendJson(res, 404, { error: "no eligible challenge for this student/language" });
        return sendJson(res, 200, result);
      }

      // GET /api/challenges/:challengeId
      if (method === "GET" && parts[0] === "api" && parts[1] === "challenges" && parts[2]) {
        const challenge = service.getChallenge(decodeURIComponent(parts[2]));
        return sendJson(res, 200, challenge);
      }

      // POST /api/attempts/start
      if (method === "POST" && parts[0] === "api" && parts[1] === "attempts" && parts[2] === "start") {
        const body = await readBody(req);
        const { studentId, challengeId, language } = body;
        if (!studentId || !challengeId) return sendJson(res, 400, { error: "studentId and challengeId are required" });
        const result = service.startAttempt(studentId, challengeId, language ?? SupportedLanguage.PYTHON);
        logEvent("challenge_started", { studentId, challengeId, attemptId: result.attemptId });
        return sendJson(res, 201, result);
      }

      // POST /api/attempts/:attemptId/draft
      if (method === "POST" && parts[0] === "api" && parts[1] === "attempts" && parts[3] === "draft") {
        const attemptId = decodeURIComponent(parts[2]!);
        const { code } = await readBody(req);
        service.saveDraft(attemptId, code ?? "");
        logEvent("draft_saved", { attemptId });
        return sendJson(res, 200, { ok: true });
      }

      // POST /api/challenges/:challengeId/run — public-tests-only, no grading (§47 "Run" vs "Submit")
      if (method === "POST" && parts[0] === "api" && parts[1] === "challenges" && parts[3] === "run") {
        const challengeId = decodeURIComponent(parts[2]!);
        const { code, language } = await readBody(req);
        const result = service.runPublicTests(challengeId, language ?? SupportedLanguage.PYTHON, code ?? "");
        logEvent("code_run", { challengeId, testsPassed: result.testsPassed, testsTotal: result.testsTotal });
        return sendJson(res, 200, result);
      }

      // POST /api/attempts/:attemptId/hint
      if (method === "POST" && parts[0] === "api" && parts[1] === "attempts" && parts[3] === "hint") {
        const attemptId = decodeURIComponent(parts[2]!);
        const { level } = await readBody(req);
        const hint = service.requestHint(attemptId, level);
        logEvent("hint_requested", { attemptId, level: hint.level });
        return sendJson(res, 200, hint);
      }

      // POST /api/attempts/:attemptId/submit
      if (method === "POST" && parts[0] === "api" && parts[1] === "attempts" && parts[3] === "submit") {
        const attemptId = decodeURIComponent(parts[2]!);
        const { code } = await readBody(req);
        const result = await service.submitAttempt(attemptId, code ?? "");
        logEvent("submission_evaluated", { attemptId, passed: result.passed, testsPassed: result.testsPassed, testsTotal: result.testsTotal });
        return sendJson(res, 200, result);
      }

      return sendJson(res, 404, { error: `no route for ${method} ${url.pathname}` });
    } catch (err) {
      if (err instanceof CodeForgeNotFoundError) {
        return sendJson(res, 404, { error: err.message });
      }
      if (err instanceof CodeForgeConflictError) {
        return sendJson(res, 409, { error: err.message });
      }
      // A platform error must never be recorded as a student failure (§23) — surfaced as a clean
      // 500 with the message, not swallowed and not silently mapped onto the student's result.
      logEvent("api_error", { path: url.pathname, method, message: err instanceof Error ? err.message : String(err) });
      return sendJson(res, 500, { error: err instanceof Error ? err.message : "internal error" });
    } finally {
      logEvent("request_completed", { path: url.pathname, method, durationMs: Date.now() - start });
    }
  });
}

/** Boots a fully-seeded server for local/manual testing: `tsx src/api/server.ts`. */
async function main() {
  const store = new InMemoryStore();
  store.seedChallenges(SEED_CHALLENGES);
  const service = new CodeForgeService(store, buildDefaultProviderChain(process.env));
  const port = Number(process.env.PORT ?? 8787);
  createCodeForgeServer(service).listen(port, () => {
    console.log(`CodeForge API listening on http://localhost:${port}`);
  });
}

// Only auto-start when run directly (`tsx src/api/server.ts`), not when imported by tests.
if (process.argv[1] && process.argv[1].endsWith("server.ts")) {
  main();
}
