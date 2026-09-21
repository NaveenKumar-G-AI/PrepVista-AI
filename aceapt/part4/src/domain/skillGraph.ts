import type { Skill, SkillEvidenceRecord, GraphReadiness } from "./types.js";
import { overallSkillLevel } from "./evidence.js";
import { emptyEvidence } from "./types.js";

export interface CycleWarning {
  droppedEdge: { skillId: string; prerequisiteId: string };
  cycle: string[];
}

/**
 * A skill graph, built defensively: if the input contains a circular
 * prerequisite relationship (Phase 59, edge case #8), we do not infinite
 * loop or crash — we deterministically drop the edge that closes the cycle
 * and record a warning the caller can surface to an admin/TPO reviewer.
 */
export class SkillGraph {
  readonly skills: Map<string, Skill>;
  readonly warnings: CycleWarning[] = [];
  private readonly prereqEdges: Map<string, Set<string>>; // skillId -> prerequisite ids
  private readonly dependentEdges: Map<string, Set<string>>; // skillId -> ids that require it

  constructor(skills: Skill[]) {
    this.skills = new Map(skills.map((s) => [s.id, s]));
    this.prereqEdges = new Map();
    this.dependentEdges = new Map();
    for (const s of skills) {
      this.prereqEdges.set(s.id, new Set());
      this.dependentEdges.set(s.id, new Set());
    }
    for (const s of skills) {
      for (const prereqId of s.prerequisiteIds) {
        if (!this.skills.has(prereqId)) continue; // ignore dangling references defensively
        this.prereqEdges.get(s.id)!.add(prereqId);
      }
    }
    this.sanitizeCycles();
    for (const [skillId, prereqs] of this.prereqEdges) {
      for (const p of prereqs) {
        this.dependentEdges.get(p)?.add(skillId);
      }
    }
  }

  /** DFS cycle detection + deterministic edge removal so construction always terminates. */
  private sanitizeCycles(): void {
    const WHITE = 0,
      GRAY = 1,
      BLACK = 2;
    const color = new Map<string, number>();
    for (const id of this.skills.keys()) color.set(id, WHITE);

    const visit = (id: string, stack: string[]): void => {
      color.set(id, GRAY);
      stack.push(id);
      // iterate a snapshot — we may mutate prereqEdges mid-traversal on cycle removal
      for (const prereqId of Array.from(this.prereqEdges.get(id) ?? [])) {
        const c = color.get(prereqId);
        if (c === GRAY) {
          // Found a cycle: id -> ... -> prereqId -> ... -> id. Drop the edge
          // (id requires prereqId) deterministically to break it.
          this.prereqEdges.get(id)!.delete(prereqId);
          const cycleStart = stack.indexOf(prereqId);
          this.warnings.push({
            droppedEdge: { skillId: id, prerequisiteId: prereqId },
            cycle: [...stack.slice(cycleStart), prereqId],
          });
          continue;
        }
        if (c === WHITE) visit(prereqId, stack);
      }
      stack.pop();
      color.set(id, BLACK);
    };

    for (const id of this.skills.keys()) {
      if (color.get(id) === WHITE) visit(id, []);
    }
  }

  prerequisitesOf(skillId: string): string[] {
    return Array.from(this.prereqEdges.get(skillId) ?? []);
  }

  dependentsOf(skillId: string): string[] {
    return Array.from(this.dependentEdges.get(skillId) ?? []);
  }

  /** BFS count of every skill reachable by following "requires this" edges forward. */
  downstreamCount(skillId: string): number {
    const seen = new Set<string>();
    const queue = [...this.dependentsOf(skillId)];
    while (queue.length) {
      const next = queue.shift()!;
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(...this.dependentsOf(next));
    }
    return seen.size;
  }

  downstreamNames(skillId: string, limit = 3): string[] {
    return this.dependentsOf(skillId)
      .slice(0, limit)
      .map((id) => this.skills.get(id)?.name ?? id);
  }

  maxDownstreamCount(): number {
    let max = 0;
    for (const id of this.skills.keys()) max = Math.max(max, this.downstreamCount(id));
    return max || 1;
  }

  /**
   * A skill is "ready" once every hard prerequisite has at least STRONG
   * evidence. If not, we return the *specific* blocking prerequisite so the
   * caller can substitute it (Phase 26 — strengthen the prerequisite before
   * prioritizing the downstream skill).
   */
  computeReadiness(skillId: string, evidenceMap: Map<string, SkillEvidenceRecord>): GraphReadiness {
    for (const prereqId of this.prerequisitesOf(skillId)) {
      const evidence = evidenceMap.get(prereqId) ?? emptyEvidence("", prereqId);
      const level = overallSkillLevel(evidence);
      if (level !== "STRONG" && level !== "VERIFIED") {
        return { isReady: false, blockingPrerequisiteId: prereqId };
      }
    }
    return { isReady: true, blockingPrerequisiteId: null };
  }

  all(): Skill[] {
    return Array.from(this.skills.values());
  }
}
