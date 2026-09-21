import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { questionSkillMappings, type QuestionSkillMappingRow } from '../db/schema';

export const questionSkillMappingRepository = {
  async findByQuestion(questionId: string): Promise<QuestionSkillMappingRow[]> {
    return db.select().from(questionSkillMappings).where(eq(questionSkillMappings.questionId, questionId));
  },

  async create(values: Omit<QuestionSkillMappingRow, 'id' | 'createdAt'>): Promise<QuestionSkillMappingRow> {
    const [row] = await db.insert(questionSkillMappings).values(values).returning();
    return row;
  },
};
