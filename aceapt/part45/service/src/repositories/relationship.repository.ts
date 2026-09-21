import { and, eq, or } from 'drizzle-orm';
import { db } from '../db/client';
import { skillRelationships, type NewSkillRelationship, type SkillRelationshipRow } from '../db/schema';

export const relationshipRepository = {
  async listByStatus(status: string): Promise<SkillRelationshipRow[]> {
    return db.select().from(skillRelationships).where(eq(skillRelationships.status, status));
  },

  async listAll(): Promise<SkillRelationshipRow[]> {
    return db.select().from(skillRelationships);
  },

  async findByFromSkill(skillId: string): Promise<SkillRelationshipRow[]> {
    return db.select().from(skillRelationships).where(eq(skillRelationships.fromSkillId, skillId));
  },

  async findByToSkill(skillId: string): Promise<SkillRelationshipRow[]> {
    return db.select().from(skillRelationships).where(eq(skillRelationships.toSkillId, skillId));
  },

  async findTouching(skillId: string): Promise<SkillRelationshipRow[]> {
    return db
      .select()
      .from(skillRelationships)
      .where(or(eq(skillRelationships.fromSkillId, skillId), eq(skillRelationships.toSkillId, skillId)));
  },

  async findById(id: string): Promise<SkillRelationshipRow | undefined> {
    const rows = await db.select().from(skillRelationships).where(eq(skillRelationships.id, id)).limit(1);
    return rows[0];
  },

  async create(values: NewSkillRelationship): Promise<SkillRelationshipRow> {
    const [row] = await db.insert(skillRelationships).values(values).returning();
    return row;
  },

  async update(id: string, values: Partial<NewSkillRelationship>): Promise<SkillRelationshipRow | undefined> {
    const [row] = await db
      .update(skillRelationships)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(skillRelationships.id, id))
      .returning();
    return row;
  },
};
