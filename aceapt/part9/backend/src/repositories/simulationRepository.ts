import { Simulation, SimulationEvent, SimulationReport, SimulationResult } from '../domain/types';

// ============================================================
// SIMULATION REPOSITORY  (spec section 47)
// ============================================================
// Adapt to your existing database architecture: implement
// SimulationRepository against your real tables/ORM and pass that
// implementation to createSimulationEngine(...) instead of
// InMemorySimulationRepository. Every service in this codebase talks
// to this interface only, never to a concrete storage engine, so the
// swap is contained to this one file.

export interface SimulationRepository {
  save(simulation: Simulation): Promise<void>;
  findById(id: string): Promise<Simulation | undefined>;
  findByStudent(studentId: string): Promise<Simulation[]>;
  appendEvent(event: SimulationEvent): Promise<void>;
  getEvents(simulationId: string): Promise<SimulationEvent[]>;
  saveResult(result: SimulationResult): Promise<void>;
  getResult(simulationId: string): Promise<SimulationResult | undefined>;
  getResultsForStudent(studentId: string): Promise<SimulationResult[]>;
  /** Full report cache so a completed simulation can be re-fetched
   *  (spec section 51, "safe session recovery") without re-running
   *  analytics or re-firing Feature 3/5/6/7 side effects a second time. */
  saveReport(report: SimulationReport): Promise<void>;
  getReport(simulationId: string): Promise<SimulationReport | undefined>;
}

export class InMemorySimulationRepository implements SimulationRepository {
  private simulations = new Map<string, Simulation>();
  private events = new Map<string, SimulationEvent[]>();
  private results = new Map<string, SimulationResult>();
  private reports = new Map<string, SimulationReport>();

  async save(simulation: Simulation): Promise<void> {
    // Deep-clone on write/read so callers can't mutate stored state by
    // holding a reference - a cheap stand-in for "the DB is the source
    // of truth", which matters once real money/negative-marking scoring
    // is on the line.
    this.simulations.set(simulation.id, clone(simulation));
  }

  async findById(id: string): Promise<Simulation | undefined> {
    const sim = this.simulations.get(id);
    return sim ? clone(sim) : undefined;
  }

  async findByStudent(studentId: string): Promise<Simulation[]> {
    return [...this.simulations.values()].filter((s) => s.studentId === studentId).map(clone);
  }

  async appendEvent(event: SimulationEvent): Promise<void> {
    const list = this.events.get(event.simulationId) ?? [];
    list.push(clone(event));
    this.events.set(event.simulationId, list);
  }

  async getEvents(simulationId: string): Promise<SimulationEvent[]> {
    return (this.events.get(simulationId) ?? []).map(clone);
  }

  async saveResult(result: SimulationResult): Promise<void> {
    this.results.set(result.simulationId, clone(result));
  }

  async getResult(simulationId: string): Promise<SimulationResult | undefined> {
    const r = this.results.get(simulationId);
    return r ? clone(r) : undefined;
  }

  async getResultsForStudent(studentId: string): Promise<SimulationResult[]> {
    const simIds = new Set((await this.findByStudent(studentId)).map((s) => s.id));
    return [...this.results.values()].filter((r) => simIds.has(r.simulationId)).map(clone);
  }

  async saveReport(report: SimulationReport): Promise<void> {
    this.reports.set(report.simulationId, clone(report));
  }

  async getReport(simulationId: string): Promise<SimulationReport | undefined> {
    const r = this.reports.get(simulationId);
    return r ? clone(r) : undefined;
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
