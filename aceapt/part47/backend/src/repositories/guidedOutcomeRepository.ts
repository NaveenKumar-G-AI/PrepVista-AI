import path from 'node:path';
import { env } from '../config/env.js';
import { JsonCollectionStore } from './jsonCollectionStore.js';
import type { GuidedOutcomeRecord } from './records.js';

export interface GuidedOutcomeRepository {
  upsert(record: GuidedOutcomeRecord): Promise<GuidedOutcomeRecord>;
  findBySessionId(sessionId: string): Promise<GuidedOutcomeRecord | null>;
  listByStudent(studentId: string): Promise<GuidedOutcomeRecord[]>;
}

export class FileGuidedOutcomeRepository implements GuidedOutcomeRepository {
  private readonly store: JsonCollectionStore<GuidedOutcomeRecord>;

  constructor(baseDir: string = env.dataDir) {
    this.store = JsonCollectionStore.forFile<GuidedOutcomeRecord>(path.join(baseDir, 'guided_outcomes.json'));
  }

  upsert(record: GuidedOutcomeRecord): Promise<GuidedOutcomeRecord> {
    return this.store.upsert(record);
  }

  async findBySessionId(sessionId: string): Promise<GuidedOutcomeRecord | null> {
    const all = await this.store.list((r) => r.sessionId === sessionId);
    return all[0] ?? null;
  }

  async listByStudent(studentId: string): Promise<GuidedOutcomeRecord[]> {
    const all = await this.store.list((r) => r.studentId === studentId);
    return all.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }
}
