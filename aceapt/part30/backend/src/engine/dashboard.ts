import type { PoolClient } from "pg";
import * as repo from "../db/repository.js";
import { identifyBottleneck } from "./bottleneck.js";
import { calculateReadiness, calculateReadinessDimensions } from "./readiness.js";
import { getForecastProjection } from "../integrations/forecastClient.js";
import { formatProjection } from "./projection.js";
import { HEADLINES } from "./nextBestAction.js";
import type { NextBestAction, PathChangeReason, PathDashboardResponse } from "../domain/types.js";

/**
 * GET-side of the dashboard: never writes anything. Bottleneck, readiness,
 * readiness dimensions, and the projection are pure functions of already-
 * persisted state (capability levels, requirements, snapshots), so they're
 * safe to recompute on every read for freshness. Risks, the active
 * mode/stage, and the next-best-action are read from whatever the last
 * recalculatePath() call persisted -- those depend on history (snapshot
 * trends, resolved-vs-active risk bookkeeping) that a plain read must not
 * recompute or it could disagree with what recalculation last decided.
 */
export async function getDashboard(client: PoolClient, studentId: string, targetId: string): Promise<PathDashboardResponse | null> {
  const pathRow = await repo.getPathByStudentAndTarget(client, studentId, targetId);
  if (!pathRow) return null;

  const target = await repo.getTarget(client, targetId);
  if (!target) return null;

  // Sequential -- see the comment in engine/orchestrator.ts. All of these
  // share the one tenant-scoped client for this request.
  const requirements = await repo.getTargetRequirements(client, targetId);
  const allCapabilities = await repo.getCapabilities(client);
  const states = await repo.getStudentCapabilityStates(client, studentId);
  const stages = await repo.getStages(client, pathRow.id);
  const milestones = await repo.getMilestones(client, pathRow.id);
  const activeRisks = await repo.getActiveRisks(client, pathRow.id);
  const pendingActions = await repo.getActions(client, pathRow.id, "PENDING");
  const snapshots = await repo.getSnapshots(client, pathRow.id);

  const { bottleneck, gaps } = identifyBottleneck(requirements, states, allCapabilities);
  const readiness = calculateReadiness(requirements, states);
  const readinessDimensions = calculateReadinessDimensions(requirements, states, milestones, pathRow.targetReadiness);
  const rawForecast = await getForecastProjection(snapshots, readiness, pathRow.targetReadiness);
  const projection = formatProjection(rawForecast);
  const lastChangeEvent = await repo.getLastChangeEvent(client, pathRow.id);

  let nextBestAction: NextBestAction | null = null;
  const pending = pendingActions[0];
  if (pending) {
    const milestone = pending.milestoneId ? milestones.find((m) => m.id === pending.milestoneId) : undefined;
    const capability = allCapabilities.find((c) => c.code === pending.capabilityCode);
    const label = milestone?.name ?? capability?.name ?? pending.capabilityCode;
    nextBestAction = {
      action: pending,
      headline: HEADLINES[pending.type].replace("{cap}", label),
      why: pending.reason,
    };
  }

  const evidenceCoverage = gaps.length > 0 ? gaps.filter((g) => g.evidenceSufficient).length / gaps.length : 0;

  return {
    path: { ...pathRow, bottleneck },
    target,
    stages,
    milestones,
    bottleneck,
    nextBestAction,
    readinessDimensions,
    activeRisks,
    projection,
    lastChange: lastChangeEvent
      ? {
          reason: (lastChangeEvent.reason ?? "MANUAL_RECALCULATION") as PathChangeReason,
          summary: lastChangeEvent.summary,
          previousBottleneck: (lastChangeEvent.payload as Record<string, unknown>)?.previousBottleneck as string | null ?? null,
          newBottleneck: (lastChangeEvent.payload as Record<string, unknown>)?.newBottleneck as string | null ?? null,
          occurredAt: lastChangeEvent.createdAt,
        }
      : null,
    evidenceCoverage: Math.round(evidenceCoverage * 100) / 100,
  };
}
