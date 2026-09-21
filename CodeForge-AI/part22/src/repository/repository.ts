import type {
  DebugAction,
  DebuggingResult,
  DebuggingSession,
  Experiment,
  FailureFingerprint,
  Hypothesis,
  OverfittingSignal,
  RegressionVerification,
  RootCauseChain
} from "../types.js";

/**
 * Everything the API layer needs from storage, independent of which engine
 * backs it. `InMemoryDebuggingRepository` below implements this against
 * plain Maps (used automatically when DATABASE_URL is unset, and by every
 * unit test in this repo); `repository/pgRepository.ts` implements the same
 * interface against real Postgres. Callers never need to know which one
 * they have.
 */
export interface DebuggingRepository {
  createSession(session: DebuggingSession): Promise<DebuggingSession>;
  getSession(id: string): Promise<DebuggingSession | null>;
  updateSession(session: DebuggingSession): Promise<DebuggingSession>;
  listSessionsForUser(userId: string): Promise<DebuggingSession[]>;

  saveFingerprint(fp: FailureFingerprint): Promise<FailureFingerprint>;
  getFingerprintsForSession(sessionId: string): Promise<FailureFingerprint[]>;

  createHypothesis(h: Hypothesis): Promise<Hypothesis>;
  updateHypothesis(h: Hypothesis): Promise<Hypothesis>;
  getHypothesesForSession(sessionId: string): Promise<Hypothesis[]>;

  createExperiment(e: Experiment): Promise<Experiment>;
  updateExperiment(e: Experiment): Promise<Experiment>;
  getExperimentsForSession(sessionId: string): Promise<Experiment[]>;

  logAction(a: DebugAction): Promise<DebugAction>;
  getActionsForSession(sessionId: string): Promise<DebugAction[]>;

  saveRootCause(sessionId: string, chain: RootCauseChain): Promise<RootCauseChain>;
  getRootCause(sessionId: string): Promise<RootCauseChain | null>;

  saveFixVerification(sessionId: string, regression: RegressionVerification, overfitting: OverfittingSignal): Promise<void>;
  getFixVerification(sessionId: string): Promise<{ regression: RegressionVerification | null; overfitting: OverfittingSignal | null }>;

  saveResult(r: DebuggingResult): Promise<DebuggingResult>;
  getResult(sessionId: string): Promise<DebuggingResult | null>;
}

export class NotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} "${id}" not found`);
    this.name = "NotFoundError";
  }
}

export class InMemoryDebuggingRepository implements DebuggingRepository {
  private sessions = new Map<string, DebuggingSession>();
  private fingerprints = new Map<string, FailureFingerprint>();
  private hypotheses = new Map<string, Hypothesis>();
  private experiments = new Map<string, Experiment>();
  private actions: DebugAction[] = [];
  private results = new Map<string, DebuggingResult>();
  private rootCauses = new Map<string, RootCauseChain>();
  private fixVerifications = new Map<string, { regression: RegressionVerification | null; overfitting: OverfittingSignal | null }>();

  async createSession(session: DebuggingSession): Promise<DebuggingSession> {
    this.sessions.set(session.id, session);
    return session;
  }

  async getSession(id: string): Promise<DebuggingSession | null> {
    return this.sessions.get(id) ?? null;
  }

  async updateSession(session: DebuggingSession): Promise<DebuggingSession> {
    if (!this.sessions.has(session.id)) throw new NotFoundError("DebuggingSession", session.id);
    this.sessions.set(session.id, session);
    return session;
  }

  async listSessionsForUser(userId: string): Promise<DebuggingSession[]> {
    return [...this.sessions.values()].filter((s) => s.userId === userId);
  }

  async saveFingerprint(fp: FailureFingerprint): Promise<FailureFingerprint> {
    this.fingerprints.set(fp.id, fp);
    return fp;
  }

  async getFingerprintsForSession(sessionId: string): Promise<FailureFingerprint[]> {
    return [...this.fingerprints.values()].filter((f) => f.sessionId === sessionId).sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  }

  async createHypothesis(h: Hypothesis): Promise<Hypothesis> {
    this.hypotheses.set(h.id, h);
    return h;
  }

  async updateHypothesis(h: Hypothesis): Promise<Hypothesis> {
    if (!this.hypotheses.has(h.id)) throw new NotFoundError("Hypothesis", h.id);
    this.hypotheses.set(h.id, h);
    return h;
  }

  async getHypothesesForSession(sessionId: string): Promise<Hypothesis[]> {
    return [...this.hypotheses.values()].filter((h) => h.sessionId === sessionId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async createExperiment(e: Experiment): Promise<Experiment> {
    this.experiments.set(e.id, e);
    return e;
  }

  async updateExperiment(e: Experiment): Promise<Experiment> {
    if (!this.experiments.has(e.id)) throw new NotFoundError("Experiment", e.id);
    this.experiments.set(e.id, e);
    return e;
  }

  async getExperimentsForSession(sessionId: string): Promise<Experiment[]> {
    return [...this.experiments.values()].filter((e) => e.sessionId === sessionId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async logAction(a: DebugAction): Promise<DebugAction> {
    this.actions.push(a);
    return a;
  }

  async getActionsForSession(sessionId: string): Promise<DebugAction[]> {
    return this.actions.filter((a) => a.sessionId === sessionId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async saveRootCause(sessionId: string, chain: RootCauseChain): Promise<RootCauseChain> {
    this.rootCauses.set(sessionId, chain);
    return chain;
  }

  async getRootCause(sessionId: string): Promise<RootCauseChain | null> {
    return this.rootCauses.get(sessionId) ?? null;
  }

  async saveFixVerification(sessionId: string, regression: RegressionVerification, overfitting: OverfittingSignal): Promise<void> {
    this.fixVerifications.set(sessionId, { regression, overfitting });
  }

  async getFixVerification(sessionId: string): Promise<{ regression: RegressionVerification | null; overfitting: OverfittingSignal | null }> {
    return this.fixVerifications.get(sessionId) ?? { regression: null, overfitting: null };
  }

  async saveResult(r: DebuggingResult): Promise<DebuggingResult> {
    this.results.set(r.sessionId, r);
    return r;
  }

  async getResult(sessionId: string): Promise<DebuggingResult | null> {
    return this.results.get(sessionId) ?? null;
  }
}
