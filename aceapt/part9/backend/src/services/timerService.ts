import { Simulation } from '../domain/types';

// ============================================================
// TIMER SERVICE  (spec section 13)
// ============================================================
// The server clock is the only clock that counts. Every route handler
// that mutates a simulation must consult this service before trusting
// any client-supplied timestamp; client timestamps are never used for
// scoring or remaining-time calculations anywhere in this codebase.

export class TimerService {
  now(): number {
    return Date.now();
  }

  elapsedSeconds(simulation: Simulation): number {
    return Math.max(0, (this.now() - simulation.startedAt) / 1000);
  }

  remainingSeconds(simulation: Simulation): number {
    return Math.max(0, simulation.durationSeconds - this.elapsedSeconds(simulation));
  }

  remainingFraction(simulation: Simulation): number {
    if (simulation.durationSeconds <= 0) return 0;
    return this.remainingSeconds(simulation) / simulation.durationSeconds;
  }

  isExpired(simulation: Simulation): boolean {
    return this.remainingSeconds(simulation) <= 0;
  }
}
