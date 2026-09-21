import { randomUUID } from 'node:crypto';

/** Generates a prefixed, sortable-enough-for-debugging unique id, e.g. "evi_3f2a...". */
export function newId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}
