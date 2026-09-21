import type { CodeForgeIntelligencePorts } from "../ports";
import { findOldestQueued } from "../services/report-repository";
import { processReportGeneration } from "../services/report-generation-service";

/**
 * Deliberately simple: the report row itself (status=QUEUED) IS the queue
 * entry, so there's no separate job table to keep in sync (brief §13, §61).
 * `enqueue` here is a no-op beyond logging — the row was already written as
 * QUEUED by report-generation-service before this is called. What matters
 * is `processNext`, which the real worker process polls on an interval and
 * which tests call directly and repeatedly to deterministically drain the
 * queue without depending on real timing.
 *
 * Swapping to a real broker (BullMQ/SQS/whatever CodeForge already runs)
 * later means replacing the body of processNext's caller loop — the
 * generation logic it calls into doesn't change.
 */
export function enqueue(_reportId: string): void {
  // No-op: report-generation-service already persisted status=QUEUED.
  // Kept as an explicit seam in case a real broker needs an explicit publish call.
}

export async function processNext(ports: CodeForgeIntelligencePorts): Promise<boolean> {
  const next = findOldestQueued();
  if (!next) return false;
  try {
    await processReportGeneration(ports, next.id);
  } catch {
    // processReportGeneration already recorded FAILED status + failureReason.
    // Swallow here so the worker loop keeps running for the next job.
  }
  return true;
}

/** Drains every currently-queued job. Used by tests and the sample scripts. */
export async function drainQueue(ports: CodeForgeIntelligencePorts, maxIterations = 100): Promise<number> {
  let processed = 0;
  while (processed < maxIterations) {
    const didWork = await processNext(ports);
    if (!didWork) break;
    processed++;
  }
  return processed;
}
