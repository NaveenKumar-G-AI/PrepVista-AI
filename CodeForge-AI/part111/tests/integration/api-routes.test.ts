import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { POST as submitRoute } from "../../app/api/submissions/route";
import { GET as getSubmissionRoute } from "../../app/api/submissions/[id]/route";
import { GET as getProblemRoute } from "../../app/api/problems/[slug]/route";
import { FIXTURE_USERS } from "../../lib/db/fixtures";

let ids: { problemId: string; problemVersionId: string; testSuiteVersionId: string };

beforeAll(() => {
  ids = JSON.parse(readFileSync(path.join(process.cwd(), ".demo-problem-ids.json"), "utf8"));
});

function req(url: string, init?: RequestInit) {
  return new NextRequest(new Request(url, init));
}

describe("GET /api/problems/[slug]", () => {
  it("returns the public-safe problem shape with no hidden fields", async () => {
    const res = await getProblemRoute(req("http://x/api/problems/pair-sum-equals-target"), {
      params: { slug: "pair-sum-equals-target" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.slug).toBe("pair-sum-equals-target");
    expect(body.publicTests).toHaveLength(2);
    // Assert the shape is exactly the allowlist — nothing extra leaked through.
    const allowedKeys = new Set([
      "problemId",
      "problemVersionId",
      "slug",
      "title",
      "statement",
      "inputFormat",
      "outputFormat",
      "publicTests",
      "functionStyle",
      "entryPoint",
      "timeLimitMs",
      "memoryLimitMb",
    ]);
    for (const key of Object.keys(body)) {
      expect(allowedKeys.has(key)).toBe(true);
    }
  });

  it("404s for an unpublished/unknown slug rather than erroring", async () => {
    const res = await getProblemRoute(req("http://x/api/problems/does-not-exist"), {
      params: { slug: "does-not-exist" },
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/submissions", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await submitRoute(
      req("http://x/api/submissions", {
        method: "POST",
        body: JSON.stringify({
          problemId: ids.problemId,
          language: "python3",
          sourceCode: "print(1)",
          idempotencyKey: "no-auth-test",
        }),
      })
    );
    expect(res.status).toBe(401);
  });

  it("rejects a malformed body with 400, not a 500", async () => {
    const res = await submitRoute(
      req("http://x/api/submissions", {
        method: "POST",
        headers: { "x-user-id": FIXTURE_USERS.student.id },
        body: JSON.stringify({ language: "not-a-real-language" }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("evaluates a real submission end-to-end and returns a safe result with no hidden data", async () => {
    const source = readFileSync(
      path.join(process.cwd(), "scripts", "demo-problem", "solutions", "correct.py"),
      "utf8"
    );
    const res = await submitRoute(
      req("http://x/api/submissions", {
        method: "POST",
        headers: { "x-user-id": FIXTURE_USERS.student.id, "content-type": "application/json" },
        body: JSON.stringify({
          problemId: ids.problemId,
          language: "python3",
          sourceCode: source,
          idempotencyKey: "api-test-correct-" + Date.now(),
          assessmentMode: "practice",
        }),
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.overallVerdict).toBe("ACCEPTED");
    expect(body.score).toBe(100);
    const serialized = JSON.stringify(body);
    expect(serialized).not.toMatch(/def main\(/); // no source/reference code
    expect(serialized).not.toContain("150000"); // no hidden input sizes/content
  });

  it("is idempotent: the same idempotencyKey does not create a second evaluation run", async () => {
    const pool = (await import("../../lib/db/pool")).getPool("service");
    const key = "api-test-idempotency-" + Date.now();
    const source = "print(int(input().split()[1]))"; // irrelevant, just needs to run

    const makeReq = () =>
      req("http://x/api/submissions", {
        method: "POST",
        headers: { "x-user-id": FIXTURE_USERS.student.id, "content-type": "application/json" },
        body: JSON.stringify({
          problemId: ids.problemId,
          language: "python3",
          sourceCode: source,
          idempotencyKey: key,
        }),
      });

    const res1 = await submitRoute(makeReq());
    const body1 = await res1.json();
    const res2 = await submitRoute(makeReq());
    const body2 = await res2.json();

    expect(body1.submissionId).toBe(body2.submissionId);

    const { rows } = await pool.query(
      `select count(*)::int as n from public.evaluation_runs where submission_id = $1`,
      [body1.submissionId]
    );
    expect(rows[0].n).toBe(1); // NOT 2 — the second call reused the first run
  });
});

describe("GET /api/submissions/[id]", () => {
  it("returns 404 (not 403, and not the data) when a different student requests someone else's submission", async () => {
    const pool = (await import("../../lib/db/pool")).getPool("service");
    const other = await pool.query(
      `insert into public.submissions (student_id, problem_id, problem_version_id, language, source_code, status, idempotency_key)
       values ($1,$2,$3,'python3','print(1)','completed',$4) returning id`,
      [FIXTURE_USERS.student2.id, ids.problemId, ids.problemVersionId, "owner-test-" + Date.now()]
    );
    const otherId = other.rows[0].id;

    const res = await getSubmissionRoute(req(`http://x/api/submissions/${otherId}`, { headers: { "x-user-id": FIXTURE_USERS.student.id } }), {
      params: { id: otherId },
    });
    expect(res.status).toBe(404);
  });
});
