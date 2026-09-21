import type { PoolClient } from "pg";
import type { Student } from "../types/index.js";

function mapRow(r: any): Student {
  return {
    id: r.id,
    email: r.email,
    passwordHash: r.password_hash,
    name: r.name,
    createdAt: r.created_at,
  };
}

export async function createStudent(
  client: PoolClient,
  input: { id: string; email: string; passwordHash: string; name: string }
): Promise<Student> {
  const { rows } = await client.query(
    `INSERT INTO students (id, email, password_hash, name) VALUES ($1,$2,$3,$4) RETURNING *`,
    [input.id, input.email, input.passwordHash, input.name]
  );
  return mapRow(rows[0]);
}

export async function findStudentByEmail(client: PoolClient, email: string): Promise<Student | null> {
  const { rows } = await client.query(`SELECT * FROM students WHERE email = $1`, [email]);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function findStudentById(client: PoolClient, id: string): Promise<Student | null> {
  const { rows } = await client.query(`SELECT * FROM students WHERE id = $1`, [id]);
  return rows[0] ? mapRow(rows[0]) : null;
}
