import { randomUUID } from 'node:crypto';

/** Central id generator so every engine module produces real UUIDs by default, with a single seam for deterministic ids in tests. */
export function generateId(): string {
  return randomUUID();
}
