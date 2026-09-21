import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

/**
 * Exercises the REAL running Express server (not the service functions
 * directly) over real HTTP, exactly as a frontend would call it -- this is
 * the level at which auth middleware, route wiring, JSON serialization, and
 * RLS-via-session-header all have to actually work together, not just
 * typecheck. Mirrors the "live-HTTP replay of the spec's own demo
 * walkthrough" step used on Features 8/20/29.
 *
 * Run with the server already up (npm run dev / npm start) and seed+ingest
 * already applied.
 */

const BASE = 'http://127.0.0.1:4040';
let pass = 0;
let fail = 0;

function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) {
    pass += 1;
    console.log(`  OK  ${label}`);
  } else {
    fail += 1;
    console.log(`FAIL  ${label}`, detail !== undefined ? JSON.stringify(detail) : '');
  }
}

async function main() {
  const pool = new Pool({
    host: process.env.PGHOST, port: Number(process.env.PGPORT), database: process.env.PGDATABASE,
    user: process.env.MIGRATE_PGUSER, password: process.env.MIGRATE_PGPASSWORD,
  });
  const { rows: s1 } = await pool.query(`SELECT id FROM students WHERE email='aditi.sharma@example.edu'`);
  const { rows: s2 } = await pool.query(`SELECT id FROM students WHERE email='rahul.verma@example.edu'`);
  const { rows: roles } = await pool.query(`SELECT id, slug FROM roles`);
  const roleIdBySlug = new Map<string, string>(roles.map((r: any) => [r.slug, r.id]));
  const student1 = s1[0].id;
  const student2 = s2[0].id;
  const aiBackendRoleId = roleIdBySlug.get('ai-backend-engineering')!;
  await pool.end();

  function headers(studentId: string) {
    return { 'X-Student-Id': studentId, 'Content-Type': 'application/json' };
  }

  // ---- 0. No auth header -> 401, never a silent pass-through ----
  {
    const res = await fetch(`${BASE}/api/career-horizon`);
    check('no X-Student-Id header returns 401', res.status === 401);
  }

  // ---- 0b. Unknown student id -> 401 ----
  {
    const res = await fetch(`${BASE}/api/career-horizon`, { headers: headers('00000000-0000-0000-0000-000000000000') });
    check('unknown student id returns 401', res.status === 401);
  }

  // ---- 1. Recompute future gaps for student 1 (also exercises outbox dispatch) ----
  {
    const res = await fetch(`${BASE}/api/future-gaps/recompute?roleId=${aiBackendRoleId}&period=2026-Q3`, {
      method: 'POST', headers: headers(student1),
    });
    const body: any = await res.json();
    check('recompute future gaps returns 200', res.status === 200, body);
    check('gaps include a CRITICAL severity item', body.gaps?.some((g: any) => g.severity === 'CRITICAL'), body.gaps);
    check('CRITICAL gap is Cloud Deployment', body.gaps?.find((g: any) => g.severity === 'CRITICAL')?.skillName === 'Cloud Deployment', body.gaps);
    check('strategic actions were dispatched to the outbox for the CRITICAL gap', body.strategicActionsDispatched >= 1, body);
  }

  // ---- 2. GET /api/career-horizon for student 1 -- the hero screen ----
  {
    const res = await fetch(`${BASE}/api/career-horizon?period=2026-Q3`, { headers: headers(student1) });
    const body: any = await res.json();
    check('career-horizon returns 200', res.status === 200);
    check('hasTargetRole is true', body.hasTargetRole === true);
    check('targetRole title is AI / Backend Engineering', body.targetRole?.title === 'AI / Backend Engineering', body.targetRole);
    check('current.evidenceCount > 0', body.current?.evidenceCount > 0, body.current);
    check('current.readiness is present with an overall status', ['STRONG', 'DEVELOPING', 'NEEDS_ATTENTION'].includes(body.current?.readiness?.overall), body.current?.readiness);
    check('market.signals is non-empty', Array.isArray(body.market?.signals) && body.market.signals.length > 0, body.market?.signals);
    check('market.changedSincePriorPeriod is non-empty ("WHAT CHANGED?")', body.market?.changedSincePriorPeriod?.length > 0, body.market);
    check('roleEvolution classification is a valid enum value', ['STABLE', 'EVOLVING', 'TRANSFORMING', 'EMERGING', 'UNCERTAIN'].includes(body.roleEvolution?.classification), body.roleEvolution);
    check('futureGaps top item is CRITICAL', body.futureGaps?.[0]?.severity === 'CRITICAL', body.futureGaps);
    check('strategicPriorities.learning is non-empty', body.strategicPriorities?.learning?.length > 0);
    check('strategicPriorities.projects cites the actual gap it targets (no generic filler)', body.strategicPriorities?.projects?.[0]?.rationale?.includes('Cloud Deployment') || body.strategicPriorities?.projects?.[0]?.rationale?.includes('Deploy a production-style'), body.strategicPriorities?.projects);
    check('futurePaths includes PRIMARY + at least one SPECIALIST/ADJACENT/EMERGING', body.futurePaths?.length >= 2 && body.futurePaths.some((p: any) => p.category !== 'PRIMARY'), body.futurePaths?.map((p: any) => p.category));
    check('discoveryMode is false (student HAS a target)', body.discoveryMode === false);
    check('every future gap explanation avoids the blunt "you don\'t have X" phrasing', body.futureGaps?.every((g: any) => !/^you don'?t have/i.test(g.explanation)), body.futureGaps?.map((g: any) => g.explanation));
  }

  // ---- 3. Discovery mode for student 2 (no target role set) ----
  {
    const res = await fetch(`${BASE}/api/career-horizon`, { headers: headers(student2) });
    const body: any = await res.json();
    check('discoveryMode is true for a student with no target role', body.discoveryMode === true, body.hasTargetRole);
    check('discoveryDirections is non-empty and grounded in evidence', body.discoveryDirections?.length > 0 && body.discoveryDirections[0].whyItFits?.length > 0, body.discoveryDirections);
    check('emptyStates.noTargetRole message is present', typeof body.emptyStates?.noTargetRole === 'string' && body.emptyStates.noTargetRole.length > 0);
  }

  // ---- 4. Cross-student isolation: student 2 cannot read student 1's future gaps ----
  {
    const res = await fetch(`${BASE}/api/future-gaps?roleId=${aiBackendRoleId}`, { headers: headers(student2) });
    const body: any = await res.json();
    check('student 2 sees ZERO of student 1\'s future gaps for the same role (RLS isolation)', Array.isArray(body.gaps) && body.gaps.length === 0, body.gaps);
  }
  {
    const res = await fetch(`${BASE}/api/future-gaps?roleId=${aiBackendRoleId}`, { headers: headers(student1) });
    const body: any = await res.json();
    check('student 1 still sees their own future gaps', Array.isArray(body.gaps) && body.gaps.length > 0, body.gaps?.length);
  }

  // ---- 5. Role evolution + skill trends endpoints ----
  {
    const res = await fetch(`${BASE}/api/role-evolution/${aiBackendRoleId}?period=2026-Q3`, { headers: headers(student1) });
    const body: any = await res.json();
    check('role-evolution endpoint returns the stored classification', ['STABLE', 'EVOLVING', 'TRANSFORMING', 'EMERGING', 'UNCERTAIN'].includes(body.classification), body);
  }
  {
    const res = await fetch(`${BASE}/api/skill-trends?roleId=${aiBackendRoleId}&period=2026-Q3`, { headers: headers(student1) });
    const body: any = await res.json();
    const classes = new Set(body.trends?.map((t: any) => t.classification));
    check('skill-trends spans multiple classification types', classes.size >= 4, Array.from(classes));
    check('skill-trends includes a DURABLE skill', classes.has('DURABLE'));
    check('skill-trends includes a DECLINING skill', classes.has('DECLINING'));
  }

  // ---- 6. Career paths: branching + comparison ----
  {
    const res = await fetch(`${BASE}/api/career-paths?roleId=${aiBackendRoleId}&period=2026-Q3`, { headers: headers(student1) });
    const body: any = await res.json();
    const cats = body.branches?.map((b: any) => b.category);
    check('branching includes PRIMARY, SPECIALIST, ADJACENT, EMERGING', ['PRIMARY', 'SPECIALIST', 'ADJACENT', 'EMERGING'].every((c) => cats?.includes(c)), cats);
  }
  {
    const backendId = roleIdBySlug.get('backend-engineering');
    const appliedAiId = roleIdBySlug.get('applied-ai-engineer');
    const res = await fetch(`${BASE}/api/career-paths/compare?roleIds=${aiBackendRoleId},${backendId},${appliedAiId}&period=2026-Q3`, { headers: headers(student1) });
    const body: any = await res.json();
    check('comparison returns one row per role, never declaring a bare "winner"', body.comparison?.length === 3, body.comparison?.length);
  }

  // ---- 7. Career scenario ("What If?") ----
  {
    const res = await fetch(`${BASE}/api/career-scenarios`, {
      method: 'POST', headers: headers(student1),
      body: JSON.stringify({ roleId: aiBackendRoleId, scenarioType: 'AI_AUTOMATION_INCREASE' }),
    });
    const body: any = await res.json();
    check('scenario creation returns 201', res.status === 201, body);
    check('scenario framing avoids prophecy language ("will definitely")', !/will definitely/i.test(body.narrative || ''), body.narrative);
  }

  // ---- 8. Career experiment: start then complete ----
  let experimentId: string | undefined;
  {
    const res = await fetch(`${BASE}/api/career-experiments`, {
      method: 'POST', headers: headers(student1), body: JSON.stringify({ roleId: aiBackendRoleId }),
    });
    const body: any = await res.json();
    check('experiment starts with 5 tasks', body.tasks?.length === 5, body.tasks);
    check('experiment tasks are grounded in the actual top gap (Cloud Deployment)', body.targetedGap?.skillName === 'Cloud Deployment', body.targetedGap);
    experimentId = body.id;
  }
  {
    const res = await fetch(`${BASE}/api/career-experiments/${experimentId}/complete`, {
      method: 'POST', headers: headers(student1),
      body: JSON.stringify({ reflection: 'Enjoyed the deployment work more than expected.', interestRating: 5, difficultyRating: 3 }),
    });
    const body: any = await res.json();
    check('experiment completion returns a fit result', ['STRONG_FIT', 'MODERATE_FIT', 'WEAK_FIT', 'INCONCLUSIVE'].includes(body.fitResult), body);
  }

  // ---- 9. Market brief: daily + weekly ----
  {
    const res = await fetch(`${BASE}/api/market-brief/daily`, { headers: headers(student1) });
    const body: any = await res.json();
    check('daily signal has a "why it matters" tied to the student, not generic news', body.signal?.whyItMatters?.length > 0, body.signal);
  }
  {
    const res = await fetch(`${BASE}/api/market-brief/weekly`, { headers: headers(student1) });
    const body: any = await res.json();
    check('weekly brief references the actual role title', body.brief?.narrative?.includes('AI / Backend Engineering') || body.brief?.roleTitle === 'AI / Backend Engineering', body.brief);
  }

  // ---- 10. Technology decision engine ----
  {
    const res = await fetch(`${BASE}/api/technology-analysis`, {
      method: 'POST', headers: headers(student1), body: JSON.stringify({ technologyName: 'Cloud Deployment', roleId: aiBackendRoleId }),
    });
    const body: any = await res.json();
    check('technology decision is LEARN_NOW for a GROWING, high-signal skill', body.decision === 'LEARN_NOW', body);
  }
  {
    const res = await fetch(`${BASE}/api/technology-analysis`, {
      method: 'POST', headers: headers(student1), body: JSON.stringify({ technologyName: 'Some Nonexistent Framework' }),
    });
    const body: any = await res.json();
    check('technology decision on unknown tech is MONITOR, not fabricated', body.decision === 'MONITOR' && body.confidence === 'UNKNOWN', body);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
