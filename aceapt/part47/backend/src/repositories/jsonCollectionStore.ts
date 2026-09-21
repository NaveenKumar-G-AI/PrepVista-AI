import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * A tiny, dependency-free, file-backed collection store.
 *
 * WHY NOT A REAL DATABASE OUT OF THE BOX: this module is meant to run
 * standalone, in a sandbox with no guaranteed database server and no
 * guarantee that native-module installs (e.g. sqlite bindings) succeed on
 * every machine. Every repository in this directory is written against a
 * small interface (see e.g. guidedSessionRepository.ts); this file store is
 * the one implementation of that interface used for local dev/demo/tests.
 * Swap in a Postgres/Mongo-backed implementation of the same interfaces
 * when integrating into ACEAPT's real database - see
 * docs/schema-reference.prisma for the intended production shape.
 *
 * Concurrency (Section 93): writes to the same file are serialized through
 * an in-process promise chain, and the actual write is done via
 * write-to-temp-then-rename, which is atomic on the same filesystem. This
 * is sufficient for a single Node process (dev/demo/tests). A real
 * multi-instance deployment needs a real database with real transactions -
 * this is explicitly a local-dev/demo substitute, not a claim of
 * distributed-safety.
 */
export class JsonCollectionStore<T extends { id: string }> {
  private static instancesByPath = new Map<string, JsonCollectionStore<any>>();

  private queue: Promise<unknown> = Promise.resolve();

  private constructor(private readonly filePath: string) {}

  static forFile<T extends { id: string }>(filePath: string): JsonCollectionStore<T> {
    const resolved = path.resolve(filePath);
    let instance = JsonCollectionStore.instancesByPath.get(resolved);
    if (!instance) {
      instance = new JsonCollectionStore<T>(resolved);
      JsonCollectionStore.instancesByPath.set(resolved, instance);
    }
    return instance as JsonCollectionStore<T>;
  }

  private withLock<R>(fn: () => Promise<R>): Promise<R> {
    const run = this.queue.then(fn, fn);
    // Swallow errors in the chain itself (not in the caller's promise) so one
    // failed operation cannot permanently wedge the lock for later callers.
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async readAll(): Promise<Record<string, T>> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(raw) as Record<string, T>;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw err;
    }
  }

  private async writeAll(data: Record<string, T>): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.${randomUUID()}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    await fs.rename(tmpPath, this.filePath);
  }

  get(id: string): Promise<T | null> {
    return this.withLock(async () => {
      const all = await this.readAll();
      return all[id] ?? null;
    });
  }

  upsert(record: T): Promise<T> {
    return this.withLock(async () => {
      const all = await this.readAll();
      all[record.id] = record;
      await this.writeAll(all);
      return record;
    });
  }

  /**
   * Compare-and-swap upsert for optimistic concurrency (Section 93). `expectedVersion`
   * must match the currently stored record's `version` field (0 for "must not exist yet").
   * Throws OptimisticLockError on mismatch instead of silently overwriting.
   */
  upsertWithVersionCheck(record: T & { version: number }, expectedVersion: number): Promise<T> {
    return this.withLock(async () => {
      const all = await this.readAll();
      const existing = all[record.id] as (T & { version: number }) | undefined;
      const currentVersion = existing?.version ?? 0;
      if (currentVersion !== expectedVersion) {
        throw new OptimisticLockError(record.id, expectedVersion, currentVersion);
      }
      all[record.id] = record;
      await this.writeAll(all);
      return record;
    });
  }

  list(predicate?: (record: T) => boolean): Promise<T[]> {
    return this.withLock(async () => {
      const all = await this.readAll();
      const values = Object.values(all);
      return predicate ? values.filter(predicate) : values;
    });
  }

  delete(id: string): Promise<void> {
    return this.withLock(async () => {
      const all = await this.readAll();
      delete all[id];
      await this.writeAll(all);
    });
  }
}

export class OptimisticLockError extends Error {
  constructor(
    public readonly recordId: string,
    public readonly expectedVersion: number,
    public readonly actualVersion: number,
  ) {
    super(`Version conflict on ${recordId}: expected v${expectedVersion}, found v${actualVersion}.`);
    this.name = 'OptimisticLockError';
  }
}
