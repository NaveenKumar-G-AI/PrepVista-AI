import type { PoolClient } from "pg";

type Queryable = Pick<PoolClient, "query">;

export interface FixtureQuestion {
  id: string;
  skillId: string;
  difficulty: "easy" | "medium" | "hard";
  prompt: string;
  correctAnswer: unknown;
  isValid: boolean;
  steps: Array<{ step: number; description: string }> | null;
}

export async function createStudent(client: Queryable, label: string): Promise<string> {
  const r = await client.query<{ id: string }>(
    `INSERT INTO _fixture_student (label) VALUES ($1) RETURNING id`,
    [label]
  );
  return r.rows[0]!.id;
}

export async function createSkill(client: Queryable, name: string, domain: string): Promise<string> {
  const r = await client.query<{ id: string }>(
    `INSERT INTO _fixture_skill (name, domain) VALUES ($1, $2) RETURNING id`,
    [name, domain]
  );
  return r.rows[0]!.id;
}

export async function createQuestion(
  client: Queryable,
  q: Omit<FixtureQuestion, "id">
): Promise<string> {
  const r = await client.query<{ id: string }>(
    `INSERT INTO _fixture_question (skill_id, difficulty, prompt, correct_answer, is_valid, steps)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6::jsonb) RETURNING id`,
    [q.skillId, q.difficulty, q.prompt, JSON.stringify(q.correctAnswer), q.isValid, JSON.stringify(q.steps)]
  );
  return r.rows[0]!.id;
}

export async function getQuestion(client: Queryable, questionId: string): Promise<FixtureQuestion | null> {
  const r = await client.query(
    `SELECT id, skill_id AS "skillId", difficulty, prompt, correct_answer AS "correctAnswer",
            is_valid AS "isValid", steps
       FROM _fixture_question WHERE id = $1`,
    [questionId]
  );
  return r.rows[0] ?? null;
}
