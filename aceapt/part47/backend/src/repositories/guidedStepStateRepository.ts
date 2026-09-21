import path from 'node:path';
import { env } from '../config/env.js';
import { JsonCollectionStore } from './jsonCollectionStore.js';
import type { GuidedStepStateRecord } from './records.js';

export interface GuidedStepStateRepository {
  upsert(record: GuidedStepStateRecord): Promise<GuidedStepStateRecord>;
  findById(id: string): Promise<GuidedStepStateRecord | null>;
  findBySessionAndStep(sessionId: string, stepId: string): Promise<GuidedStepStateRecord | null>;
  listForSession(sessionId: string): Promise<GuidedStepStateRecord[]>;
}

export class FileGuidedStepStateRepository implements GuidedStepStateRepository {
  private readonly store: JsonCollectionStore<GuidedStepStateRecord>;

  constructor(baseDir: string = env.dataDir) {
    this.store = JsonCollectionStore.forFile<GuidedStepStateRecord>(path.join(baseDir, 'guided_step_states.json'));
  }

  upsert(record: GuidedStepStateRecord): Promise<GuidedStepStateRecord> {
    return this.store.upsert(record);
  }

  findById(id: string): Promise<GuidedStepStateRecord | null> {
    return this.store.get(id);
  }

  async findBySessionAndStep(sessionId: string, stepId: string): Promise<GuidedStepStateRecord | null> {
    const all = await this.store.list((r) => r.sessionId === sessionId && r.stepId === stepId);
    return all[0] ?? null;
  }

  async listForSession(sessionId: string): Promise<GuidedStepStateRecord[]> {
    const all = await this.store.list((r) => r.sessionId === sessionId);
    return all.sort((a, b) => a.sequence - b.sequence);
  }
}
