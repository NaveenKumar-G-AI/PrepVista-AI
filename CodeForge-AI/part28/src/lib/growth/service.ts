import type { GrowthRepository } from "./persistence/repository.ts";
import type { GrowthDimension, RoleGrowthProfile, TimeWindowPreset } from "./types.ts";
import { buildGrowthSnapshot } from "./engine/snapshot.ts";
import { detectMilestones } from "./engine/milestones.ts";
import { generateInsightsForDimension, milestoneToInsight } from "./engine/insights.ts";
import { byDimension, resolveTimeWindow, filterByWindow } from "./utils.ts";

export interface GrowthService {
  getGrowthOverview(studentId: string, preset: TimeWindowPreset, roleProfile: RoleGrowthProfile | null): Promise<ReturnType<typeof buildGrowthSnapshot>>;
  getGrowthTimeline(studentId: string, preset: TimeWindowPreset): Promise<{ evidenceId: string; dimension: GrowthDimension; occurredAt: string; outcome: string }[]>;
  getSkillTrajectory(studentId: string, dimension: GrowthDimension, preset: TimeWindowPreset): Promise<ReturnType<typeof buildGrowthSnapshot>["dimensions"][number]>;
  getGrowthEvidence(studentId: string, dimension: GrowthDimension): Promise<Awaited<ReturnType<GrowthRepository["getEvidenceForStudent"]>>>;
  getGrowthMilestones(studentId: string): Promise<Awaited<ReturnType<GrowthRepository["getMilestones"]>>>;
  getGrowthInsights(studentId: string, roleProfile: RoleGrowthProfile | null): Promise<Awaited<ReturnType<GrowthRepository["getRecentInsights"]>>>;
  getGrowthSnapshot(studentId: string): Promise<Awaited<ReturnType<GrowthRepository["getLatestSnapshot"]>>>;
  /** Recomputes and PERSISTS a fresh snapshot + any newly-triggered
   * milestones/insights from current evidence. This is the only mutating
   * operation the service exposes, and it's the one background jobs /
   * webhooks call after new evidence lands — never a client action. */
  recomputeGrowth(studentId: string, roleProfile: RoleGrowthProfile | null, studentModelVersion: string, skillModelVersion: string): Promise<ReturnType<typeof buildGrowthSnapshot>>;
}

export function createGrowthService(repo: GrowthRepository): GrowthService {
  return {
    async getGrowthOverview(studentId, preset, roleProfile) {
      const evidence = await repo.getEvidenceForStudent(studentId);
      const window = resolveTimeWindow(preset);
      const previous = await repo.getLatestSnapshot(studentId);
      const previousStates = Object.fromEntries((previous?.dimensions ?? []).map((d) => [d.dimension, d.state]));
      return buildGrowthSnapshot({
        snapshotId: `preview_${studentId}_${Date.now()}`,
        studentId,
        allEvidence: evidence,
        window,
        roleProfile,
        studentModelVersion: previous?.studentModelVersion ?? "unknown",
        skillModelVersion: previous?.skillModelVersion ?? "unknown",
        previousDimensionStates: previousStates,
      });
    },

    async getGrowthTimeline(studentId, preset) {
      const evidence = await repo.getEvidenceForStudent(studentId);
      const window = resolveTimeWindow(preset);
      return filterByWindow(evidence, window)
        .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime())
        .map((e) => ({ evidenceId: e.evidenceId, dimension: e.dimension, occurredAt: e.occurredAt, outcome: e.outcome }));
    },

    async getSkillTrajectory(studentId, dimension, preset) {
      const evidence = await repo.getEvidenceForStudent(studentId, { dimension });
      const window = resolveTimeWindow(preset);
      const snapshot = buildGrowthSnapshot({
        snapshotId: `trajectory_${studentId}_${dimension}_${Date.now()}`,
        studentId,
        allEvidence: evidence,
        window,
        roleProfile: { roleId: "single-dimension-view", primaryDimensions: [dimension] },
        studentModelVersion: "unknown",
        skillModelVersion: "unknown",
      });
      return snapshot.dimensions[0]!;
    },

    async getGrowthEvidence(studentId, dimension) {
      return repo.getEvidenceForStudent(studentId, { dimension });
    },

    async getGrowthMilestones(studentId) {
      return repo.getMilestones(studentId);
    },

    async getGrowthInsights(studentId, roleProfile) {
      const stored = await repo.getRecentInsights(studentId, 50);
      if (stored.length > 0) return stored;
      // Nothing persisted yet for this student (e.g. recompute hasn't run) —
      // fall back to a live, unpersisted computation so the UI never just
      // shows an empty error where a real answer is derivable.
      const evidence = await repo.getEvidenceForStudent(studentId);
      const window = resolveTimeWindow("ALL_TIME");
      const snapshot = buildGrowthSnapshot({
        snapshotId: `live_${studentId}_${Date.now()}`,
        studentId,
        allEvidence: evidence,
        window,
        roleProfile,
        studentModelVersion: "unknown",
        skillModelVersion: "unknown",
      });
      return snapshot.dimensions.flatMap((d) => generateInsightsForDimension(studentId, d));
    },

    async getGrowthSnapshot(studentId) {
      return repo.getLatestSnapshot(studentId);
    },

    async recomputeGrowth(studentId, roleProfile, studentModelVersion, skillModelVersion) {
      const evidence = await repo.getEvidenceForStudent(studentId);
      const window = resolveTimeWindow("ALL_TIME");
      const previous = await repo.getLatestSnapshot(studentId);
      const previousStates = Object.fromEntries((previous?.dimensions ?? []).map((d) => [d.dimension, d.state]));

      const snapshot = buildGrowthSnapshot({
        snapshotId: crypto.randomUUID(),
        studentId,
        allEvidence: evidence,
        window,
        roleProfile,
        studentModelVersion,
        skillModelVersion,
        previousDimensionStates: previousStates,
      });
      await repo.insertSnapshot(snapshot);

      const grouped = byDimension(evidence);
      const allMilestones = Array.from(grouped.entries()).flatMap(([dim, ev]) => detectMilestones(studentId, dim as GrowthDimension, ev));
      const newMilestones = await repo.upsertMilestones(allMilestones);

      const dimensionInsights = snapshot.dimensions.flatMap((d) => generateInsightsForDimension(studentId, d));
      const milestoneInsights = newMilestones.map((m) => milestoneToInsight(studentId, m));
      await repo.insertInsights([...dimensionInsights, ...milestoneInsights]);

      return snapshot;
    },
  };
}
