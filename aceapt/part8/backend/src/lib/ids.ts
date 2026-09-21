import { randomUUID } from "node:crypto";

/** Every table uses app-generated TEXT ids (not DB-generated uuids) so id
 *  generation lives in one place and never depends on a Postgres extension. */
export function genId(): string {
  return randomUUID();
}
