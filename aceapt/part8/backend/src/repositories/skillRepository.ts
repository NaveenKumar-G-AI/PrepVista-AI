import type { PoolClient } from "pg";
import type { Skill } from "../types/index.js";

function mapRow(r: any): Skill {
  return {
    id: r.id,
    key: r.key,
    name: r.name,
    category: r.category,
    importance: Number(r.importance),
    createdAt: r.created_at,
  };
}

export async function listSkills(client: PoolClient): Promise<Skill[]> {
  const { rows } = await client.query(`SELECT * FROM skills ORDER BY category, name`);
  return rows.map(mapRow);
}

export async function findSkillById(client: PoolClient, id: string): Promise<Skill | null> {
  const { rows } = await client.query(`SELECT * FROM skills WHERE id = $1`, [id]);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function findSkillByKey(client: PoolClient, key: string): Promise<Skill | null> {
  const { rows } = await client.query(`SELECT * FROM skills WHERE key = $1`, [key]);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function upsertSkill(
  client: PoolClient,
  input: { id: string; key: string; name: string; category: string; importance?: number }
): Promise<Skill> {
  const { rows } = await client.query(
    `INSERT INTO skills (id, key, name, category, importance)
     VALUES ($1,$2,$3,$4,COALESCE($5,1.0))
     ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category
     RETURNING *`,
    [input.id, input.key, input.name, input.category, input.importance ?? null]
  );
  return mapRow(rows[0]);
}
