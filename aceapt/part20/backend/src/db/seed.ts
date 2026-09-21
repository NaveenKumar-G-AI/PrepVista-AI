import { pool } from "./pool.js";
import { MAIN_QUESTIONS, DRILL_QUESTIONS } from "../domain/questionBank.js";
import { MAIN_BLUEPRINT_SLUG, DEMO_STUDENT_SLUG_NAME } from "../domain/constants.js";

async function upsertQuestion(q: (typeof MAIN_QUESTIONS)[number]): Promise<string> {
  const res = await pool.query<{ id: string }>(
    `INSERT INTO questions (slug, concept, difficulty, prompt, options, correct_index, explanation, tags)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (slug) DO UPDATE SET
       concept = EXCLUDED.concept,
       difficulty = EXCLUDED.difficulty,
       prompt = EXCLUDED.prompt,
       options = EXCLUDED.options,
       correct_index = EXCLUDED.correct_index,
       explanation = EXCLUDED.explanation,
       tags = EXCLUDED.tags
     RETURNING id`,
    [q.slug, q.concept, q.difficulty, q.prompt, JSON.stringify(q.options), q.correctIndex, q.explanation, q.tags]
  );
  return res.rows[0].id;
}

async function seed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Demo student (stand-in for a real auth/user record — see README).
    const studentRes = await client.query<{ id: string }>(
      `INSERT INTO students (display_name)
       SELECT $1 WHERE NOT EXISTS (SELECT 1 FROM students LIMIT 1)
       RETURNING id`,
      [DEMO_STUDENT_SLUG_NAME]
    );
    let studentId = studentRes.rows[0]?.id;
    if (!studentId) {
      const existing = await client.query<{ id: string }>("SELECT id FROM students LIMIT 1");
      studentId = existing.rows[0].id;
    }

    // Question bank.
    const mainIds: string[] = [];
    for (const q of MAIN_QUESTIONS) {
      mainIds.push(await upsertQuestion(q));
    }
    for (const q of DRILL_QUESTIONS) {
      await upsertQuestion(q);
    }

    // Main blueprint (15 questions / 18 minutes / +1 / -0.25 / 0).
    const bpRes = await client.query<{ id: string }>(
      `INSERT INTO blueprints (slug, name, kind, question_count, duration_sec, marking_correct, marking_wrong, marking_skip)
       VALUES ($1,$2,'main',$3,$4,1,-0.25,0)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [MAIN_BLUEPRINT_SLUG, "Real-World Aptitude Simulation", MAIN_QUESTIONS.length, 18 * 60]
    );
    const blueprintId = bpRes.rows[0].id;

    await client.query(`DELETE FROM blueprint_questions WHERE blueprint_id = $1`, [blueprintId]);
    for (let i = 0; i < mainIds.length; i++) {
      await client.query(
        `INSERT INTO blueprint_questions (blueprint_id, question_id, sequence_index) VALUES ($1,$2,$3)`,
        [blueprintId, mainIds[i], i]
      );
    }

    await client.query("COMMIT");
    // eslint-disable-next-line no-console
    console.log(
      `[seed] done. student=${studentId} blueprint=${blueprintId} mainQuestions=${mainIds.length} drillQuestions=${DRILL_QUESTIONS.length}`
    );
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[seed] failed:", err);
  process.exit(1);
});
