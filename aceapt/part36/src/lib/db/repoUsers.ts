import { getDb, newId } from "./index";

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  institution_id: string | null;
  created_at: string;
}

export function createUser(email: string, passwordHash: string, name: string): UserRow {
  const db = getDb();
  const id = newId();
  db.prepare(
    `INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)`
  ).run(id, email.toLowerCase().trim(), passwordHash, name.trim());
  return getUserById(id)!;
}

export function getUserByEmail(email: string): UserRow | undefined {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM users WHERE email = ?`)
    .get(email.toLowerCase().trim()) as UserRow | undefined;
}

export function getUserById(id: string): UserRow | undefined {
  const db = getDb();
  return db.prepare(`SELECT * FROM users WHERE id = ?`).get(id) as UserRow | undefined;
}
