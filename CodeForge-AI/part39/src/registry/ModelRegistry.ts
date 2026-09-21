import { ModelCapability, ModelDescriptor, ModelStatus } from '../types';
import { seedModels } from './seedModels';

/**
 * Centralized model registry. This is the ONLY place model metadata and
 * pricing live — nothing else in the codebase should hardcode a model's
 * price or capabilities. Backed by an in-memory map seeded from
 * seedModels.ts; a production deployment should back this with the
 * `ai_model` table (see migrations/001_init.sql) so admins can update
 * pricing/status without a deploy.
 */
export class ModelRegistry {
  private models = new Map<string, ModelDescriptor>();

  constructor(initial: ModelDescriptor[] = seedModels) {
    for (const m of initial) this.models.set(m.id, m);
  }

  get(id: string): ModelDescriptor | undefined {
    return this.models.get(id);
  }

  getByProviderAndKey(provider: string, modelKey: string): ModelDescriptor | undefined {
    return [...this.models.values()].find((m) => m.provider === provider && m.modelKey === modelKey);
  }

  list(): ModelDescriptor[] {
    return [...this.models.values()];
  }

  listActive(): ModelDescriptor[] {
    return this.list().filter((m) => m.status === ModelStatus.ACTIVE);
  }

  /** Models that support every capability in `required`, and are ACTIVE. */
  findByCapabilities(required: ModelCapability[]): ModelDescriptor[] {
    return this.listActive().filter((m) => required.every((cap) => m.capabilities.includes(cap)));
  }

  upsert(model: ModelDescriptor): void {
    this.models.set(model.id, model);
  }

  setStatus(id: string, status: ModelStatus): ModelDescriptor {
    const model = this.models.get(id);
    if (!model) throw new Error(`Unknown model: ${id}`);
    const updated = { ...model, status };
    this.models.set(id, updated);
    return updated;
  }

  recordObservedLatency(id: string, latencyMs: number): void {
    const model = this.models.get(id);
    if (!model) return;
    const prev = model.observedAvgLatencyMs;
    // Simple exponential moving average — cheap, no history table required
    // for the headline number; full percentiles are computed from
    // ai_request telemetry, not from this running average (see
    // telemetry/Telemetry.ts).
    const updatedAvg = prev === undefined ? latencyMs : prev * 0.9 + latencyMs * 0.1;
    this.models.set(id, { ...model, observedAvgLatencyMs: updatedAvg });
  }
}

export const modelRegistry = new ModelRegistry();
