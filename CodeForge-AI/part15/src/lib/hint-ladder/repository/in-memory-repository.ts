import { ConcurrencyConflictError } from "../errors";
import { freshLadderState, HintLadderState } from "../types";
import { ApplyTransitionInput, HintLadderRepository } from "./types";

/**
 * TEST-ONLY (and reference-implementation-demo) repository. Real
 * deployments use SupabaseHintLadderRepository. Kept deliberately
 * faithful to the same concurrency/idempotency contract so tests
 * written against this repository are still meaningful.
 */
export class InMemoryHintLadderRepository implements HintLadderRepository {
  private sessions = new Map<string, HintLadderState>(); // key: studentId:problemId
  private byId = new Map<string, string>(); // sessionId -> studentId:problemId key
  private idempotency = new Map<string, unknown>(); // key: sessionId:requestId
  private nextId = 1;

  private key(studentId: string, problemId: string) {
    return `${studentId}:${problemId}`;
  }

  async getOrCreateSession(params: { studentId: string; problemId: string; mode: HintLadderState["mode"]; now: string }): Promise<HintLadderState> {
    const key = this.key(params.studentId, params.problemId);
    const existing = this.sessions.get(key);
    if (existing) return structuredClone(existing);

    const sessionId = `session-${this.nextId++}`;
    const state = freshLadderState({ sessionId, studentId: params.studentId, problemId: params.problemId, mode: params.mode, now: params.now });
    this.sessions.set(key, state);
    this.byId.set(sessionId, key);
    return structuredClone(state);
  }

  async getSession(params: { studentId: string; problemId: string }): Promise<HintLadderState | null> {
    const found = this.sessions.get(this.key(params.studentId, params.problemId));
    return found ? structuredClone(found) : null;
  }

  async getHistory(sessionId: string) {
    const key = this.byId.get(sessionId);
    if (!key) return [];
    const state = this.sessions.get(key);
    return state ? structuredClone(state.history) : [];
  }

  async getCachedResponse(sessionId: string, requestId: string) {
    const val = this.idempotency.get(`${sessionId}:${requestId}`);
    return val === undefined ? null : structuredClone(val);
  }

  async cacheResponse(sessionId: string, requestId: string, response: unknown) {
    this.idempotency.set(`${sessionId}:${requestId}`, structuredClone(response));
  }

  async applyTransition(input: ApplyTransitionInput): Promise<HintLadderState> {
    const key = this.byId.get(input.sessionId);
    if (!key) throw new Error(`Unknown session ${input.sessionId}`);
    const current = this.sessions.get(key);
    if (!current) throw new Error(`Unknown session ${input.sessionId}`);

    if (current.version !== input.expectedVersion) {
      throw new ConcurrencyConflictError(
        `Expected version ${input.expectedVersion} but session is at version ${current.version}.`
      );
    }

    const updated: HintLadderState = {
      ...current,
      ...input.patch,
      history: input.appendHistory ? [...current.history, input.appendHistory] : current.history,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };

    this.sessions.set(key, updated);
    // Events themselves aren't separately queried by any test today, but
    // real usage (SupabaseHintLadderRepository) persists them to
    // hint_events; nothing here needs to store them beyond that.
    return structuredClone(updated);
  }
}
