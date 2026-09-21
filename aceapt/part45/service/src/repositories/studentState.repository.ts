import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client';
import { skillEvidenceEvents, studentSkillStates, type NewSkillEvidenceEvent, type NewStudentSkillState, type SkillEvidenceEventRow, type StudentSkillStateRow } from '../db/schema';

export const evidenceRepository = {
  async createEvent(values: NewSkillEvidenceEvent): Promise<SkillEvidenceEventRow> {
    const [row] = await db.insert(skillEvidenceEvents).values(values).returning();
    return row;
  },

  async findByStudentAndSkill(studentId: string, skillId: string, limit = 200): Promise<SkillEvidenceEventRow[]> {
    return db
      .select()
      .from(skillEvidenceEvents)
      .where(and(eq(skillEvidenceEvents.studentId, studentId), eq(skillEvidenceEvents.skillId, skillId)))
      .orderBy(desc(skillEvidenceEvents.occurredAt))
      .limit(limit);
  },
};

export const studentStateRepository = {
  async findOne(studentId: string, skillId: string): Promise<StudentSkillStateRow | undefined> {
    const rows = await db
      .select()
      .from(studentSkillStates)
      .where(and(eq(studentSkillStates.studentId, studentId), eq(studentSkillStates.skillId, skillId)))
      .limit(1);
    return rows[0];
  },

  async findByStudent(studentId: string): Promise<StudentSkillStateRow[]> {
    return db.select().from(studentSkillStates).where(eq(studentSkillStates.studentId, studentId));
  },

  async findBySkillForStudents(skillId: string, studentIds: string[]): Promise<StudentSkillStateRow[]> {
    if (studentIds.length === 0) return [];
    return db
      .select()
      .from(studentSkillStates)
      .where(and(eq(studentSkillStates.skillId, skillId), inArray(studentSkillStates.studentId, studentIds)));
  },

  async upsert(values: NewStudentSkillState): Promise<StudentSkillStateRow> {
    const existing = await this.findOne(values.studentId, values.skillId);
    if (existing) {
      const [row] = await db
        .update(studentSkillStates)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(studentSkillStates.id, existing.id))
        .returning();
      return row;
    }
    const [row] = await db.insert(studentSkillStates).values(values).returning();
    return row;
  },
};
