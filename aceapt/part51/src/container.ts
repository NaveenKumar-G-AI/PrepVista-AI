import { withStudentContext } from "./db/pool.js";
import { getAttemptHistory } from "./db/repositories/attemptRepo.js";
import { createDefaultPorts } from "./ports/defaultAdapters.js";
import type { PortRegistry } from "./types/ports.js";

let cached: PortRegistry | null = null;

/**
 * Returns the active PortRegistry. Swap this function's body (or pass a
 * different registry into the services below) to point Feature 51 at the
 * real F13/14/29/30/31/45/48/49/50 services once they exist in the actual
 * ACEAPT repository — nothing in src/services or src/policy needs to change.
 */
export function getPorts(): PortRegistry {
  if (cached) return cached;
  cached = createDefaultPorts({
    fetchRecentAttempts: (studentId, skillId, limit) =>
      withStudentContext(studentId, (client) =>
        getAttemptHistory(client, studentId, { skillId: skillId ?? undefined, limit })
      )
  });
  return cached;
}
