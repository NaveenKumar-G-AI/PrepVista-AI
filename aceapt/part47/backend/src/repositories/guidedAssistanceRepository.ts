import path from 'node:path';
import { env } from '../config/env.js';
import { JsonCollectionStore } from './jsonCollectionStore.js';
import type { GuidedAssistanceRecord } from './records.js';

export interface GuidedAssistanceRepository {
  create(record: GuidedAssistanceRecord): Promise<GuidedAssistanceRecord>;
  listForSession(sessionId: string): Promise<GuidedAssistanceRecord[]>;
}

export class FileGuidedAssistanceRepository implements GuidedAssistanceRepository {
  private readonly store: JsonCollectionStore<GuidedAssistanceRecord>;

  constructor(baseDir: string = env.dataDir) {
    this.store = JsonCollectionStore.forFile<GuidedAssistanceRecord>(path.join(baseDir, 'guided_assistance.json'));
  }

  create(record: GuidedAssistanceRecord): Promise<GuidedAssistanceRecord> {
    return this.store.upsert(record);
  }

  async listForSession(sessionId: string): Promise<GuidedAssistanceRecord[]> {
    const all = await this.store.list((r) => r.sessionId === sessionId);
    return all.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }
}
