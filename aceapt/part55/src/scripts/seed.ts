import 'dotenv/config';
import pg from 'pg';

/**
 * Seeds db/reference tables with data specifically shaped to exercise every
 * major Feature 55 code path in one pass: a calibrated easy item, a
 * label-mismatch item, a too-easy and a too-hard item, a provisional
 * (low-sample) item, an invalid item, a quality-blocked item, timed-vs-
 * untimed sensitivity, novel-vs-familiar sensitivity, guided-vs-independent
 * sensitivity, a well-discriminating item, a weakly-discriminating item, a
 * mix of ineligible attempts (test account / incomplete / impossible
 * timing / duplicate), and a drift scenario (old baseline facility vs a
 * recent, meaningfully different facility). Connects as the migration
 * superuser, matching migrate.ts, since it writes to tables difficulty_app
 * doesn't own.
 */

const pool = new pg.Pool({
  host: process.env.PGHOST ?? '127.0.0.1',
  port: Number(process.env.PGPORT ?? 5432),
  database: process.env.PGDATABASE,
  user: process.env.PGSUPERUSER ?? process.env.PGUSER ?? 'postgres',
  password: process.env.PGSUPERUSER_PASSWORD ?? process.env.PGPASSWORD,
});

// deterministic PRNG so the seed is reproducible across runs
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);

interface AttemptSpec {
  studentId: string;
  questionVersionId: string;
  isCorrect: boolean;
  responseTimeMs: number | null;
  mode: 'UNTIMED' | 'TIMED';
  hintsUsed: number;
  exposureNumber: number;
  isNovel: boolean;
  sessionPositionPct: number;
  abilityProxy: number | null;
  completed: boolean;
  createdAt: Date;
  isTestAccountFlag?: boolean; // used only to pick a test-account student below
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: tenantRows } = await client.query<{ id: string }>(
      `INSERT INTO tenants (name) VALUES ('Demo Engineering College') RETURNING id`
    );
    const tenantId = tenantRows[0]!.id;

    const { rows: skillRows } = await client.query<{ id: string }>(
      `INSERT INTO skills (tenant_id, name) VALUES ($1, 'Percentages') RETURNING id`,
      [tenantId]
    );
    const skillId = skillRows[0]!.id;

    const { rows: familyRows } = await client.query<{ id: string }>(
      `INSERT INTO question_families (tenant_id, name) VALUES ($1, 'percentage_reverse') RETURNING id`,
      [tenantId]
    );
    const familyId = familyRows[0]!.id;

    // 300 regular students + a handful of test accounts
    const studentIds: string[] = [];
    for (let i = 0; i < 300; i++) {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO students (tenant_id, is_test_account) VALUES ($1, false) RETURNING id`,
        [tenantId]
      );
      studentIds.push(rows[0]!.id);
    }
    const { rows: testStudentRows } = await client.query<{ id: string }>(
      `INSERT INTO students (tenant_id, is_test_account) VALUES ($1, true) RETURNING id`,
      [tenantId]
    );
    const testStudentId = testStudentRows[0]!.id;

    async function makeQuestion(opts: {
      isValid: boolean;
      qualityStatus: string;
      initialLabel: string | null;
      steps: number;
      variables: number;
      constraints: number;
      deps: number;
      readingLength: number;
      contentPreview: string;
    }) {
      const { rows: qRows } = await client.query<{ id: string }>(
        `INSERT INTO questions (tenant_id, skill_id, family_id, purpose, answer_type)
         VALUES ($1,$2,$3,'PRACTICE','NUMERIC') RETURNING id`,
        [tenantId, skillId, familyId]
      );
      const questionId = qRows[0]!.id;
      const hash = `hash-${questionId.slice(0, 8)}`;
      const { rows: qvRows } = await client.query<{ id: string }>(
        `INSERT INTO question_versions
          (question_id, tenant_id, version_number, content_hash, content_preview,
           reading_length, number_of_steps, number_of_variables, number_of_constraints,
           concept_dependencies, initial_difficulty_label, is_valid, quality_status)
         VALUES ($1,$2,1,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [
          questionId,
          tenantId,
          hash,
          opts.contentPreview,
          opts.readingLength,
          opts.steps,
          opts.variables,
          opts.constraints,
          opts.deps,
          opts.initialLabel,
          opts.isValid,
          opts.qualityStatus,
        ]
      );
      return qvRows[0]!.id;
    }

    function pick<T>(arr: T[]): T {
      return arr[Math.floor(rand() * arr.length)] as T;
    }

    async function insertAttempts(specs: AttemptSpec[]) {
      for (const s of specs) {
        await client.query(
          `INSERT INTO attempts
            (tenant_id, student_id, question_version_id, is_correct, response_time_ms, mode,
             hints_used, exposure_number, is_novel, session_position_pct, respondent_ability_proxy,
             completed, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [
            tenantId,
            s.studentId,
            s.questionVersionId,
            s.isCorrect,
            s.responseTimeMs,
            s.mode,
            s.hintsUsed,
            s.exposureNumber,
            s.isNovel,
            s.sessionPositionPct,
            s.abilityProxy,
            s.completed,
            s.createdAt,
          ]
        );
      }
    }

    function baseAttempt(
      questionVersionId: string,
      overrides: Partial<AttemptSpec> = {}
    ): AttemptSpec {
      return {
        studentId: pick(studentIds),
        questionVersionId,
        isCorrect: true,
        responseTimeMs: 45000 + Math.floor(rand() * 20000),
        mode: 'UNTIMED',
        hintsUsed: 0,
        exposureNumber: 1,
        isNovel: true,
        sessionPositionPct: rand(),
        abilityProxy: rand(),
        completed: true,
        createdAt: daysAgo(Math.floor(rand() * 20)),
        ...overrides,
      };
    }

    // 1) Calibrated EASY item, label matches, well-discriminating
    const easyQV = await makeQuestion({
      isValid: true,
      qualityStatus: 'OK',
      initialLabel: 'Easy',
      steps: 1,
      variables: 1,
      constraints: 0,
      deps: 1,
      readingLength: 80,
      contentPreview: 'If 20% of a number is 40, what is the number?',
    });
    const easySpecs: AttemptSpec[] = [];
    for (let i = 0; i < 60; i++) {
      const ability = rand();
      easySpecs.push(
        baseAttempt(easyQV, {
          abilityProxy: ability,
          isCorrect: rand() < 0.75 + 0.2 * ability, // discriminates: higher ability -> more correct
          responseTimeMs: 30000 + Math.floor(rand() * 15000),
        })
      );
    }
    await insertAttempts(easySpecs);

    // 2) LABEL MISMATCH: author said Easy, empirically Hard
    const mismatchQV = await makeQuestion({
      isValid: true,
      qualityStatus: 'OK',
      initialLabel: 'Easy',
      steps: 4,
      variables: 3,
      constraints: 2,
      deps: 3,
      readingLength: 220,
      contentPreview: 'A shop increases price by x%, then decreases by y%... (multi-stage reverse percentage problem)',
    });
    const mismatchSpecs: AttemptSpec[] = [];
    for (let i = 0; i < 60; i++) {
      const ability = rand();
      mismatchSpecs.push(
        baseAttempt(mismatchQV, {
          abilityProxy: ability,
          isCorrect: rand() < 0.1 + 0.25 * ability,
          responseTimeMs: 90000 + Math.floor(rand() * 40000),
        })
      );
    }
    await insertAttempts(mismatchSpecs);

    // 3) PROVISIONAL: only 4 attempts
    const provisionalQV = await makeQuestion({
      isValid: true,
      qualityStatus: 'OK',
      initialLabel: 'Medium',
      steps: 2,
      variables: 2,
      constraints: 1,
      deps: 2,
      readingLength: 150,
      contentPreview: 'Brand new question, not enough data yet.',
    });
    await insertAttempts(
      Array.from({ length: 4 }, () => baseAttempt(provisionalQV, { isCorrect: rand() < 0.5 }))
    );

    // 4) INVALID question (Feature 54) — has plenty of attempts, must be fully excluded
    const invalidQV = await makeQuestion({
      isValid: false,
      qualityStatus: 'OK',
      initialLabel: 'Medium',
      steps: 2,
      variables: 2,
      constraints: 1,
      deps: 1,
      readingLength: 100,
      contentPreview: 'This question has a known validity defect (e.g., no correct answer).',
    });
    await insertAttempts(
      Array.from({ length: 40 }, () => baseAttempt(invalidQV, { isCorrect: rand() < 0.1 }))
    );

    // 5) QUALITY-BLOCKED question (Feature 53) — POOR blocks calibration
    const poorQualityQV = await makeQuestion({
      isValid: true,
      qualityStatus: 'POOR',
      initialLabel: 'Medium',
      steps: 2,
      variables: 2,
      constraints: 1,
      deps: 1,
      readingLength: 100,
      contentPreview: 'Ambiguous wording flagged by Feature 53, not yet fixed.',
    });
    await insertAttempts(
      Array.from({ length: 40 }, () => baseAttempt(poorQualityQV, { isCorrect: rand() < 0.3 }))
    );

    // 6) TOO EASY (facility ~99%)
    const tooEasyQV = await makeQuestion({
      isValid: true,
      qualityStatus: 'OK',
      initialLabel: 'Easy',
      steps: 1,
      variables: 1,
      constraints: 0,
      deps: 1,
      readingLength: 60,
      contentPreview: 'What is 50% of 100?',
    });
    await insertAttempts(
      Array.from({ length: 80 }, () => baseAttempt(tooEasyQV, { isCorrect: rand() < 0.99 }))
    );

    // 7) TOO HARD (facility ~5%)
    const tooHardQV = await makeQuestion({
      isValid: true,
      qualityStatus: 'OK',
      initialLabel: 'Hard',
      steps: 6,
      variables: 5,
      constraints: 4,
      deps: 4,
      readingLength: 380,
      contentPreview: 'Multi-stage compound percentage problem with five interacting constraints.',
    });
    await insertAttempts(
      Array.from({ length: 80 }, () => baseAttempt(tooHardQV, { isCorrect: rand() < 0.05 }))
    );

    // 8) TIMED vs UNTIMED sensitivity
    const timedSensitiveQV = await makeQuestion({
      isValid: true,
      qualityStatus: 'OK',
      initialLabel: 'Medium',
      steps: 3,
      variables: 2,
      constraints: 2,
      deps: 2,
      readingLength: 180,
      contentPreview: 'Solvable calmly, punishing under a strict timer.',
    });
    const timedSpecs: AttemptSpec[] = [];
    for (let i = 0; i < 40; i++) {
      timedSpecs.push(baseAttempt(timedSensitiveQV, { mode: 'UNTIMED', isCorrect: rand() < 0.85, responseTimeMs: 60000 }));
    }
    for (let i = 0; i < 40; i++) {
      timedSpecs.push(baseAttempt(timedSensitiveQV, { mode: 'TIMED', isCorrect: rand() < 0.55, responseTimeMs: 38000 }));
    }
    await insertAttempts(timedSpecs);

    // 9) NOVEL vs FAMILIAR sensitivity
    const noveltyQV = await makeQuestion({
      isValid: true,
      qualityStatus: 'OK',
      initialLabel: 'Medium',
      steps: 2,
      variables: 2,
      constraints: 1,
      deps: 2,
      readingLength: 140,
      contentPreview: 'A pattern students get much better at once exposed.',
    });
    const noveltySpecs: AttemptSpec[] = [];
    for (let i = 0; i < 40; i++) {
      noveltySpecs.push(baseAttempt(noveltyQV, { isNovel: true, exposureNumber: 1, isCorrect: rand() < 0.5 }));
    }
    for (let i = 0; i < 40; i++) {
      noveltySpecs.push(baseAttempt(noveltyQV, { isNovel: false, exposureNumber: 2 + Math.floor(rand() * 3), isCorrect: rand() < 0.9 }));
    }
    await insertAttempts(noveltySpecs);

    // 10) GUIDED vs INDEPENDENT sensitivity
    const assistanceQV = await makeQuestion({
      isValid: true,
      qualityStatus: 'OK',
      initialLabel: 'Medium',
      steps: 3,
      variables: 2,
      constraints: 2,
      deps: 2,
      readingLength: 160,
      contentPreview: 'Easy with hints, genuinely challenging solo.',
    });
    const assistanceSpecs: AttemptSpec[] = [];
    for (let i = 0; i < 40; i++) {
      assistanceSpecs.push(baseAttempt(assistanceQV, { hintsUsed: 0, isCorrect: rand() < 0.6 }));
    }
    for (let i = 0; i < 40; i++) {
      assistanceSpecs.push(baseAttempt(assistanceQV, { hintsUsed: 2 + Math.floor(rand() * 2), isCorrect: rand() < 0.93 }));
    }
    await insertAttempts(assistanceSpecs);

    // 11) WEAK DISCRIMINATION: correctness independent of ability proxy
    const weakDiscQV = await makeQuestion({
      isValid: true,
      qualityStatus: 'OK',
      initialLabel: 'Medium',
      steps: 2,
      variables: 2,
      constraints: 1,
      deps: 1,
      readingLength: 120,
      contentPreview: 'Ambiguous phrasing — strong and weak students perform about the same.',
    });
    await insertAttempts(
      Array.from({ length: 60 }, () => baseAttempt(weakDiscQV, { abilityProxy: rand(), isCorrect: rand() < 0.55 }))
    );

    // 12) Ineligible-attempt mix on an otherwise-normal item
    const eligibilityQV = await makeQuestion({
      isValid: true,
      qualityStatus: 'OK',
      initialLabel: 'Medium',
      steps: 2,
      variables: 2,
      constraints: 1,
      deps: 2,
      readingLength: 130,
      contentPreview: 'Normal item used to demonstrate eligibility filtering.',
    });
    const eligibilitySpecs: AttemptSpec[] = [
      ...Array.from({ length: 35 }, () => baseAttempt(eligibilityQV, { isCorrect: rand() < 0.6 })),
      baseAttempt(eligibilityQV, { studentId: testStudentId, isCorrect: true }), // TEST_ACCOUNT
      baseAttempt(eligibilityQV, { completed: false, isCorrect: false }), // INCOMPLETE
      baseAttempt(eligibilityQV, { responseTimeMs: 50, isCorrect: true }), // IMPOSSIBLE_TIMING (still counts for facility)
    ];
    await insertAttempts(eligibilitySpecs);

    // 13) DRIFT scenario: stable baseline facility ~80% from 90-400 days ago,
    // then a meaningfully different ~50% facility in the last 30 days.
    const driftQV = await makeQuestion({
      isValid: true,
      qualityStatus: 'OK',
      initialLabel: 'Easy',
      steps: 2,
      variables: 1,
      constraints: 1,
      deps: 1,
      readingLength: 100,
      contentPreview: 'Facility looked stable for months, then something changed.',
    });
    const driftSpecs: AttemptSpec[] = [];
    for (let i = 0; i < 150; i++) {
      driftSpecs.push(
        baseAttempt(driftQV, {
          isCorrect: rand() < 0.8,
          createdAt: new Date(daysAgo(90).getTime() - Math.floor(rand() * 300) * 24 * 60 * 60 * 1000),
        })
      );
    }
    await insertAttempts(driftSpecs);
    // (the "recent" shifted-facility batch is inserted by
    // scripts/seed-drift-followup.ts after the first calibration run — see
    // README "Bugs found and fixed" / drift test walkthrough)

    await client.query('COMMIT');

    console.log('Seed complete.');
    console.log(`tenantId=${tenantId}`);
    console.log(`skillId=${skillId}`);
    console.log(
      JSON.stringify(
        {
          easyQV,
          mismatchQV,
          provisionalQV,
          invalidQV,
          poorQualityQV,
          tooEasyQV,
          tooHardQV,
          timedSensitiveQV,
          noveltyQV,
          assistanceQV,
          weakDiscQV,
          eligibilityQV,
          driftQV,
        },
        null,
        2
      )
    );
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
