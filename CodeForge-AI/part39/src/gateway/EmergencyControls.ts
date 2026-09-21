import { TaskType } from '../types';

export interface EmergencyState {
  globalKillSwitchActive: boolean;
  killSwitchReason?: string;
  killSwitchActivatedAt?: string;
  disabledProviders: string[];
  disabledTasks: TaskType[];
  concurrencyOverrides: Record<string, number>;
  bulkPaused: boolean;
}

/**
 * Holds all "break glass" operational state. Every mutator here is meant
 * to be called only from an EMERGENCY_ROLES-gated API route (see
 * api/routes/admin.ts), which is responsible for auditing the change —
 * this class itself has no notion of "who" or "why", only "what". Every
 * mutation is reversible by calling the corresponding clear/enable method.
 */
export class EmergencyControls {
  private killSwitch = false;
  private killSwitchReason?: string;
  private killSwitchActivatedAt?: string;
  private disabledProviders = new Set<string>();
  private disabledTasks = new Set<TaskType>();
  private concurrencyOverrides = new Map<string, number>();
  private bulkPaused = false;

  activateKillSwitch(reason: string): void {
    this.killSwitch = true;
    this.killSwitchReason = reason;
    this.killSwitchActivatedAt = new Date().toISOString();
  }

  deactivateKillSwitch(): void {
    this.killSwitch = false;
    this.killSwitchReason = undefined;
    this.killSwitchActivatedAt = undefined;
  }

  isKillSwitchActive(): boolean {
    return this.killSwitch;
  }

  disableProvider(provider: string): void {
    this.disabledProviders.add(provider);
  }

  enableProvider(provider: string): void {
    this.disabledProviders.delete(provider);
  }

  isProviderDisabled(provider: string): boolean {
    return this.disabledProviders.has(provider);
  }

  disableTask(task: TaskType): void {
    this.disabledTasks.add(task);
  }

  enableTask(task: TaskType): void {
    this.disabledTasks.delete(task);
  }

  isTaskDisabled(task: TaskType): boolean {
    return this.disabledTasks.has(task);
  }

  setConcurrencyOverride(providerOrModelKey: string, limit: number): void {
    this.concurrencyOverrides.set(providerOrModelKey, limit);
  }

  clearConcurrencyOverride(providerOrModelKey: string): void {
    this.concurrencyOverrides.delete(providerOrModelKey);
  }

  getConcurrencyOverride(providerOrModelKey: string): number | undefined {
    return this.concurrencyOverrides.get(providerOrModelKey);
  }

  setBulkPaused(paused: boolean): void {
    this.bulkPaused = paused;
  }

  isBulkPaused(): boolean {
    return this.bulkPaused;
  }

  snapshot(): EmergencyState {
    return {
      globalKillSwitchActive: this.killSwitch,
      killSwitchReason: this.killSwitchReason,
      killSwitchActivatedAt: this.killSwitchActivatedAt,
      disabledProviders: [...this.disabledProviders],
      disabledTasks: [...this.disabledTasks],
      concurrencyOverrides: Object.fromEntries(this.concurrencyOverrides),
      bulkPaused: this.bulkPaused,
    };
  }
}

export const emergencyControls = new EmergencyControls();
