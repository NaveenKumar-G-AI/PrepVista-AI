import type { DomainEvent } from "../domain/types.js";
import type { EventBusPort, RoleModelPort } from "../ports/index.js";
import type { GapAnalysisService } from "./gapAnalysisService.js";

export interface SkillMasteryUpdatedPayload {
  organizationId: string;
  studentId: string;
  skillId: string;
}

export const SKILL_MASTERY_UPDATED = "skill.mastery.updated";

/**
 * Implements Phase 57 (Event-Driven Updates) and Phase 58 (Incremental
 * Recalculation). When a skill's authoritative mastery changes upstream,
 * this recalculates ONLY the roles that actually require that skill -
 * never every role for every student.
 *
 * Wire `eventBus` to your real queue/event infrastructure (Kafka, SQS,
 * BullMQ, ...); InMemoryEventBusAdapter is a dev/test stand-in only.
 */
export class RecalculationService {
  constructor(
    private deps: {
      eventBus: EventBusPort;
      roleModel: RoleModelPort;
      gapAnalysis: GapAnalysisService;
    },
  ) {
    this.deps.eventBus.subscribe(SKILL_MASTERY_UPDATED, this.onSkillMasteryUpdated.bind(this));
  }

  private async onSkillMasteryUpdated(event: DomainEvent): Promise<void> {
    const { organizationId, studentId, skillId } = event.payload as unknown as SkillMasteryUpdatedPayload;

    const affectedRoles = await this.deps.roleModel.findRolesRequiringSkill(skillId, organizationId);

    // Recalculate only the affected (role, student) pairs - not the whole
    // system - and let each recalculation's own cache invalidation +
    // downstream pushes cascade to Role Readiness / Next Best Action.
    for (const roleId of affectedRoles) {
      await this.deps.gapAnalysis.invalidate(organizationId, studentId, roleId);
      await this.deps.gapAnalysis.analyzeRole({ organizationId, studentId, roleId, forceRecalculate: true });
    }
  }
}
