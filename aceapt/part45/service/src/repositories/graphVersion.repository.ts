import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { graphVersions, type GraphVersionRow } from '../db/schema';
import { generateId } from '../db/schema';

export const graphVersionRepository = {
  async getById(id: string): Promise<GraphVersionRow | undefined> {
    const rows = await db.select().from(graphVersions).where(eq(graphVersions.id, id)).limit(1);
    return rows[0];
  },

  async getActivePublished(): Promise<GraphVersionRow | undefined> {
    const rows = await db.select().from(graphVersions).where(eq(graphVersions.status, 'PUBLISHED')).limit(1);
    return rows[0];
  },

  async listAll(): Promise<GraphVersionRow[]> {
    return db.select().from(graphVersions);
  },

  async create(versionLabel: string, notes?: string): Promise<GraphVersionRow> {
    const [row] = await db
      .insert(graphVersions)
      .values({ id: generateId('gv_'), versionLabel, status: 'DRAFT', notes })
      .returning();
    return row;
  },

  async updateStatus(id: string, status: string, extra: Partial<GraphVersionRow> = {}): Promise<GraphVersionRow | undefined> {
    const [row] = await db
      .update(graphVersions)
      .set({ status, updatedAt: new Date(), ...extra })
      .where(eq(graphVersions.id, id))
      .returning();
    return row;
  },
};
