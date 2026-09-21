import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { SocraticLearningSignal, SocraticSession, SocraticTurn } from "../domain/types";

export interface SocraticRepository {
  createSession(session: SocraticSession): Promise<void>;
  getSession(id: string): Promise<SocraticSession | null>;
  /** Optimistic concurrency: succeeds only if the stored version still
   *  equals expectedVersion, then stores at expectedVersion + 1 (section 89). */
  updateSession(session: SocraticSession, expectedVersion: number): Promise<boolean>;
  appendTurn(turn: SocraticTurn): Promise<void>;
  listTurns(sessionId: string): Promise<SocraticTurn[]>;
  recordLearningSignal(signal: SocraticLearningSignal): Promise<void>;
  listLearningSignals(studentId: string, skill?: string): Promise<SocraticLearningSignal[]>;
}

interface Store {
  sessions: Record<string, SocraticSession>;
  turns: Record<string, SocraticTurn[]>;
  signals: SocraticLearningSignal[];
}

/**
 * Reference persistence implementation. Zero external dependencies (no DB
 * engine, nothing to compile natively) so the project runs anywhere Node
 * runs. See db/schema.sql for the intended production (Postgres-style)
 * schema this mirrors - swap this class for a real DB-backed implementation
 * of SocraticRepository when you have one; nothing else needs to change.
 *
 * Writes are serialized through an in-process promise queue, which is
 * correctness-safe for a single Node process but not a substitute for real
 * transactions in a multi-instance deployment.
 */
export class FileSocraticRepository implements SocraticRepository {
  private filePath: string;
  private store: Store;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.filePath = path.join(dataDir, "store.json");
    this.store = this.loadSync();
  }

  private loadSync(): Store {
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, "utf-8");
        const parsed = JSON.parse(raw);
        return {
          sessions: parsed.sessions ?? {},
          turns: parsed.turns ?? {},
          signals: parsed.signals ?? [],
        };
      } catch {
        // Corrupt or empty file - start fresh rather than crash the server.
      }
    }
    return { sessions: {}, turns: {}, signals: [] };
  }

  private async persist(): Promise<void> {
    await fsp.writeFile(this.filePath, JSON.stringify(this.store, null, 2), "utf-8");
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  createSession(session: SocraticSession): Promise<void> {
    return this.enqueue(async () => {
      this.store.sessions[session.id] = session;
      this.store.turns[session.id] = [];
      await this.persist();
    });
  }

  async getSession(id: string): Promise<SocraticSession | null> {
    return this.store.sessions[id] ?? null;
  }

  updateSession(session: SocraticSession, expectedVersion: number): Promise<boolean> {
    return this.enqueue(async () => {
      const current = this.store.sessions[session.id];
      if (!current || current.version !== expectedVersion) return false;
      this.store.sessions[session.id] = { ...session, version: expectedVersion + 1 };
      await this.persist();
      return true;
    });
  }

  appendTurn(turn: SocraticTurn): Promise<void> {
    return this.enqueue(async () => {
      if (!this.store.turns[turn.sessionId]) this.store.turns[turn.sessionId] = [];
      this.store.turns[turn.sessionId].push(turn);
      await this.persist();
    });
  }

  async listTurns(sessionId: string): Promise<SocraticTurn[]> {
    return this.store.turns[sessionId] ?? [];
  }

  recordLearningSignal(signal: SocraticLearningSignal): Promise<void> {
    return this.enqueue(async () => {
      this.store.signals.push(signal);
      await this.persist();
    });
  }

  async listLearningSignals(studentId: string, skill?: string): Promise<SocraticLearningSignal[]> {
    return this.store.signals.filter((s) => s.studentId === studentId && (!skill || s.skill === skill));
  }
}
