import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AssessmentAttempt, ReadinessEvent, StudentProfile } from "../types/domain.js";

/**
 * Repository interface Feature 32 codes against. Nothing outside this
 * file knows the data lives in a JSON file — swap in a real Postgres /
 * Prisma / existing-ACEAPT-ORM implementation of this same interface
 * and no service or route code changes.
 */
export interface ReadinessRepository {
  getStudent(studentId: string): Promise<StudentProfile | null>;
  upsertStudent(profile: StudentProfile): Promise<void>;
  getAttempts(studentId: string): Promise<AssessmentAttempt[]>;
  addAttempt(attempt: AssessmentAttempt): Promise<void>;
  addEvent(event: ReadinessEvent): Promise<void>;
  getEvents(studentId: string, limit?: number): Promise<ReadinessEvent[]>;
}

interface DbShape {
  students: Record<string, StudentProfile>;
  attempts: AssessmentAttempt[];
  events: ReadinessEvent[];
}

const EMPTY_DB: DbShape = { students: {}, attempts: [], events: [] };

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Resolved at call time (not module load) so tests can override it. */
function resolveDefaultDbPath(): string {
  if (process.env.READINESS_DB_PATH) return path.resolve(process.env.READINESS_DB_PATH);
  return path.join(__dirname, "..", "..", "data", "db.json");
}

/**
 * Demo persistence: a single JSON file on disk, guarded by an in-process
 * write queue so concurrent requests can't interleave writes and corrupt
 * the file. This stands in for a real database in this standalone build
 * (see README "Known limitations"). It is genuinely real persistence —
 * every read/write here actually happens on disk — it just isn't the
 * production datastore.
 */
export class JsonFileReadinessRepository implements ReadinessRepository {
  private readonly dbPath: string;
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(dbPath?: string) {
    this.dbPath = dbPath ?? resolveDefaultDbPath();
  }

  private async readDb(): Promise<DbShape> {
    try {
      const raw = await fs.readFile(this.dbPath, "utf-8");
      return JSON.parse(raw) as DbShape;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        await this.writeDb(EMPTY_DB);
        return structuredClone(EMPTY_DB);
      }
      throw err;
    }
  }

  private async writeDb(db: DbShape): Promise<void> {
    await fs.mkdir(path.dirname(this.dbPath), { recursive: true });
    const tmpPath = `${this.dbPath}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(db, null, 2), "utf-8");
    await fs.rename(tmpPath, this.dbPath);
  }

  /** Serializes all writes so concurrent requests can't race each other. */
  private mutate<T>(fn: (db: DbShape) => Promise<T> | T): Promise<T> {
    const task = this.writeQueue.then(async () => {
      const db = await this.readDb();
      const result = await fn(db);
      await this.writeDb(db);
      return result;
    });
    // Swallow errors in the queue chain itself so one failed mutation
    // doesn't permanently wedge the queue for subsequent requests.
    this.writeQueue = task.catch(() => undefined);
    return task;
  }

  async getStudent(studentId: string): Promise<StudentProfile | null> {
    const db = await this.readDb();
    return db.students[studentId] ?? null;
  }

  async upsertStudent(profile: StudentProfile): Promise<void> {
    await this.mutate((db) => {
      db.students[profile.studentId] = profile;
    });
  }

  async getAttempts(studentId: string): Promise<AssessmentAttempt[]> {
    const db = await this.readDb();
    return db.attempts
      .filter((a) => a.studentId === studentId)
      .sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  }

  async addAttempt(attempt: AssessmentAttempt): Promise<void> {
    await this.mutate((db) => {
      db.attempts.push(attempt);
    });
  }

  async addEvent(event: ReadinessEvent): Promise<void> {
    await this.mutate((db) => {
      db.events.push(event);
    });
  }

  async getEvents(studentId: string, limit = 50): Promise<ReadinessEvent[]> {
    const db = await this.readDb();
    return db.events
      .filter((e) => e.studentId === studentId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }
}

let sharedRepository: ReadinessRepository | null = null;

/** Process-wide singleton so routes/services share one write queue. */
export function getRepository(): ReadinessRepository {
  if (!sharedRepository) {
    sharedRepository = new JsonFileReadinessRepository();
  }
  return sharedRepository;
}
