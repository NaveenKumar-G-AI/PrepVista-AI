import type { PoolClient } from "pg";
import { enqueueSignal, markDelivered, listUndelivered } from "../../repositories/signalOutboxRepository.js";
import { getAdapterFor } from "./featureAdapters.js";
import { genId } from "../../lib/ids.js";
import type { StructuredSignal } from "../../types/index.js";

/**
 * Durable outbox pattern (spec sections 32-36): the signal is committed to
 * the database in the SAME transaction as the mastery-state change before
 * any delivery attempt, so a webhook failure can never lose evidence that a
 * signal was owed - only whether it's been delivered yet.
 */
export async function emitSignal(client: PoolClient, targetFeature: string, signal: StructuredSignal): Promise<void> {
  const row = await enqueueSignal(client, { id: genId(), targetFeature, signal });
  try {
    await getAdapterFor(targetFeature).deliver({ targetFeature, signal });
    await markDelivered(client, row.id, null);
  } catch (err) {
    await markDelivered(client, row.id, err instanceof Error ? err.message : String(err));
  }
}

/** Retry sweep for previously-failed deliveries. Service-scope only. */
export async function retryUndeliveredSignals(client: PoolClient): Promise<{ attempted: number; delivered: number }> {
  const pending = await listUndelivered(client, 100);
  let delivered = 0;
  for (const row of pending) {
    try {
      await getAdapterFor(row.targetFeature).deliver({
        targetFeature: row.targetFeature,
        signal: {
          studentId: row.studentId,
          skillId: row.skillId,
          signal: row.signal,
          severity: (row.severity as "LOW" | "MEDIUM" | "HIGH") ?? "LOW",
          confidence: row.confidence ?? 0.5,
          evidence: row.payload,
        },
      });
      await markDelivered(client, row.id, null);
      delivered++;
    } catch (err) {
      await markDelivered(client, row.id, err instanceof Error ? err.message : String(err));
    }
  }
  return { attempted: pending.length, delivered };
}
