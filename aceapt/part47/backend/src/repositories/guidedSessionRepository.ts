import path from 'node:path';
import { env } from '../config/env.js';
import { JsonCollectionStore, OptimisticLockError } from './jsonCollectionStore.js';
import type { GuidedSessionRecord } from './records.js';

export { OptimisticLockError };

export interface GuidedSessionRepository {
  create(record: GuidedSessionRecord): Promise<GuidedSessionRecord>;
  findById(id: string): Promise<GuidedSessionRecord | null>;
  update(record: GuidedSessionRecord, expectedVersion: number): Promise<GuidedSessionRecord>;
  listByStudent(studentId: string): Promise<GuidedSessionRecord[]>;
}

export class FileGuidedSessionRepository implements GuidedSessionRepository {
  private readonly store: JsonCollectionStore<GuidedSessionRecord>;

  constructor(baseDir: string = env.dataDir) {
    this.store = JsonCollectionStore.forFile<GuidedSessionRecord>(path.join(baseDir, 'guided_sessions.json'));
  }

  async create(record: GuidedSessionRecord): Promise<GuidedSessionRecord> {
    return this.store.upsertWithVersionCheck(record, 0);
  }

  findById(id: string): Promise<GuidedSessionRecord | null> {
    return this.store.get(id);
  }

  update(record: GuidedSessionRecord, expectedVersion: number): Promise<GuidedSessionRecord> {
    return this.store.upsertWithVersionCheck(record, expectedVersion);
  }

  listByStudent(studentId: string): Promise<GuidedSessionRecord[]> {
    return this.store.list((r) => r.studentId === studentId);
  }
}
