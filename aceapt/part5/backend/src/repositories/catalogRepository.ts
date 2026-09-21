import { db } from "../db/client";
import { Skill } from "../domain/types";

export const StudentRepository = {
  ensure(id: string, displayName: string) {
    db.prepare(
      `INSERT INTO students (id, display_name, created_at) VALUES (?, ?, ?)
       ON CONFLICT(id) DO NOTHING`
    ).run(id, displayName, new Date().toISOString());
  },
  get(id: string): { id: string; displayName: string } | null {
    const row = db.prepare(`SELECT id, display_name as displayName FROM students WHERE id = ?`).get(id) as
      | { id: string; displayName: string }
      | undefined;
    return row ?? null;
  },
};

export const SkillRepository = {
  upsert(skill: Skill) {
    db.prepare(
      `INSERT INTO skills (id, domain, topic, subtopic, name, prerequisites)
       VALUES (@id, @domain, @topic, @subtopic, @name, @prerequisites)
       ON CONFLICT(id) DO UPDATE SET
         domain=excluded.domain, topic=excluded.topic, subtopic=excluded.subtopic,
         name=excluded.name, prerequisites=excluded.prerequisites`
    ).run({ ...skill, prerequisites: JSON.stringify(skill.prerequisites) });
  },
  get(id: string): Skill | null {
    const row = db.prepare(`SELECT * FROM skills WHERE id = ?`).get(id) as any;
    if (!row) return null;
    return rowToSkill(row);
  },
  all(): Skill[] {
    const rows = db.prepare(`SELECT * FROM skills`).all() as any[];
    return rows.map(rowToSkill);
  },
};

function rowToSkill(row: any): Skill {
  return {
    id: row.id,
    domain: row.domain,
    topic: row.topic,
    subtopic: row.subtopic,
    name: row.name,
    prerequisites: JSON.parse(row.prerequisites),
  };
}
