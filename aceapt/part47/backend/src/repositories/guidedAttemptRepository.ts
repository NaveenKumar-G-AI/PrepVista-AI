import path from 'node:path';
import { env } from '../config/env.js';
import { JsonCollectionStore } from './jsonCollectionStore.js';
import type { GuidedAttemptRecord } from './records.js';

export interface GuidedAttemptRepository {
  create(record: GuidedAttemptRecord): Promise<GuidedAttemptRecord>;
  listForStepState(stepStateId: string): Promise<GuidedAttemptRecord[]>;
  listForSession(sessionId: string): Promise<GuidedAttemptRecord[]>;
}

export class FileGuidedAttemptRepository implements GuidedAttemptRepository {
  private readonly store: JsonCollectionStore<GuidedAttemptRecord>;

  constructor(baseDir: string = env.dataDir) {
    this.store = JsonCollectionStore.forFile<GuidedAttemptRecord>(path.join(baseDir, 'guided_attempts.json'));
  }

  create(record: GuidedAttemptRecord): Promise<GuidedAttemptRecord> {
    return this.store.upsert(record);
  }

  async listForStepState(stepStateId: string): Promise<GuidedAttemptRecord[]> {
    const all = await this.store.list((r) => r.stepStateId === stepStateId);
    return all.sort((a, b) => a.attemptNumber - b.attemptNumber);
  }

  async listForSession(sessionId: string): Promise<GuidedAttemptRecord[]> {
    const all = await this.store.list((r) => r.sessionId === sessionId);
    return all.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }
}
