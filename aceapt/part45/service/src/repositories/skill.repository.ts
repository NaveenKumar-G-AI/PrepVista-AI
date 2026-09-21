import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client';
import { skills, type NewSkill, type Skill } from '../db/schema';

export const skillRepository = {
  async findById(id: string): Promise<Skill | undefined> {
    const rows = await db.select().from(skills).where(eq(skills.id, id)).limit(1);
    return rows[0];
  },

  async findByCode(code: string): Promise<Skill | undefined> {
    const rows = await db.select().from(skills).where(eq(skills.code, code)).limit(1);
    return rows[0];
  },

  async findByIds(ids: string[]): Promise<Skill[]> {
    if (ids.length === 0) return [];
    return db.select().from(skills).where(inArray(skills.id, ids));
  },

  async findChildren(parentId: string): Promise<Skill[]> {
    return db.select().from(skills).where(eq(skills.parentId, parentId));
  },

  async listByStatus(status: string): Promise<Skill[]> {
    return db.select().from(skills).where(eq(skills.status, status));
  },

  async listByDomainAndStatus(domain: string, status: string): Promise<Skill[]> {
    return db
      .select()
      .from(skills)
      .where(and(eq(skills.domain, domain), eq(skills.status, status)));
  },

  async listAll(): Promise<Skill[]> {
    return db.select().from(skills);
  },

  async create(values: NewSkill): Promise<Skill> {
    const [row] = await db.insert(skills).values(values).returning();
    return row;
  },

  async update(id: string, values: Partial<NewSkill>): Promise<Skill | undefined> {
    const [row] = await db
      .update(skills)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(skills.id, id))
      .returning();
    return row;
  },
};
