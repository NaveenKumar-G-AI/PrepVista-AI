import { randomUUID } from "node:crypto";

/** Generates a portable unique id, optionally prefixed for readability in
 *  logs/DB browsing, e.g. newId("readi") -> "readi_3fa1...". */
export function newId(prefix?: string): string {
  const id = randomUUID();
  return prefix ? `${prefix}_${id}` : id;
}
