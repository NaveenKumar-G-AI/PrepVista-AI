let counter = 0;

/** Monotonic, human-scannable id generator. Good enough for a reference
 *  implementation — swap for uuid/cuid/DB-generated ids in production. */
export function genId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter}`;
}
