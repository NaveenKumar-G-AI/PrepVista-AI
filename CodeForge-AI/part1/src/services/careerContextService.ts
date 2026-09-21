import { randomUUID } from 'node:crypto';
import type { CatalogRepo } from '../repositories/catalogRepo.js';
import type { CareerContextRepo } from '../repositories/careerContextRepo.js';
import type { RoleSlot, StudentCareerContext, StudentRoleHistoryEntry } from '../domain/types.js';
import { InvalidCareerContextError, RoleNotFoundError, RoleNotSelectableError } from '../api/errors.js';
import { emitEvent } from './events.js';

export interface SetContextInput {
  primaryRoleSlug: string;
  secondaryRoleSlug?: string | null;
}

export interface CareerContextView {
  hasSelection: boolean;
  context: (StudentCareerContext & { primaryRoleSlug: string; secondaryRoleSlug: string | null }) | null;
}

function resolveSelectableRole(catalog: CatalogRepo, slug: string): { id: string; version: number } {
  const role = catalog.getRoleStatusAndVersion(slug);
  if (!role) throw new RoleNotFoundError(slug);
  if (role.status !== 'ACTIVE') throw new RoleNotSelectableError(slug);
  return { id: role.id, version: role.currentVersion };
}

export class CareerContextService {
  constructor(
    private catalog: CatalogRepo,
    private contextRepo: CareerContextRepo,
  ) {}

  getContext(studentId: string): CareerContextView {
    const context = this.contextRepo.getContext(studentId);
    if (!context) return { hasSelection: false, context: null };
    const primary = this.catalog.getRoleDetailAtVersion(
      this.slugForRoleId(context.primaryRoleId),
      context.primaryRoleVersion,
    );
    const secondarySlug = context.secondaryRoleId ? this.slugForRoleId(context.secondaryRoleId) : null;
    return {
      hasSelection: true,
      context: {
        ...context,
        primaryRoleSlug: primary?.slug ?? this.slugForRoleId(context.primaryRoleId),
        secondaryRoleSlug: secondarySlug,
      },
    };
  }

  getHistory(studentId: string): StudentRoleHistoryEntry[] {
    return this.contextRepo.listHistory(studentId);
  }

  /**
   * Sets (or changes) a student's career context. Always atomic: the
   * current-state row and the history rows for any slot that actually
   * changed are updated together in one transaction (Step 58/59) — a
   * partial write is not possible. Source is always SELF_SELECTED here;
   * INSTITUTION_ASSIGNED / IMPORTED are for future privileged flows that
   * are not exposed through this student-facing endpoint.
   */
  setContext(studentId: string, input: SetContextInput): CareerContextView {
    const primary = resolveSelectableRole(this.catalog, input.primaryRoleSlug);
    let secondary: { id: string; version: number } | null = null;
    if (input.secondaryRoleSlug) {
      if (input.secondaryRoleSlug === input.primaryRoleSlug) {
        throw new InvalidCareerContextError('primaryRoleSlug and secondaryRoleSlug must differ.');
      }
      secondary = resolveSelectableRole(this.catalog, input.secondaryRoleSlug);
    }

    const existing = this.contextRepo.getContext(studentId);

    // Idempotency (Step 84): an identical repeat request is a no-op, not a
    // new history transition.
    if (
      existing &&
      existing.primaryRoleId === primary.id &&
      existing.secondaryRoleId === (secondary?.id ?? null)
    ) {
      return this.getContext(studentId);
    }

    const nowIso = new Date().toISOString();

    this.contextRepo.transaction(() => {
      this.reconcileSlot(studentId, 'PRIMARY', existing?.primaryRoleId ?? null, primary, nowIso);
      this.reconcileSlot(studentId, 'SECONDARY', existing?.secondaryRoleId ?? null, secondary, nowIso);

      this.contextRepo.upsertContext({
        studentId,
        primaryRoleId: primary.id,
        primaryRoleVersion: primary.version,
        secondaryRoleId: secondary?.id ?? null,
        secondaryRoleVersion: secondary?.version ?? null,
        source: 'SELF_SELECTED',
        nowIso,
      });
    });

    emitEvent(existing ? 'CODEFORGE_ROLE_CHANGED' : 'CODEFORGE_ROLE_SELECTED', {
      student_id: studentId,
      role_id: primary.id,
      role_version: primary.version,
      source: 'SELF_SELECTED',
    });

    return this.getContext(studentId);
  }

  /** Closes the previous history row for a slot and opens a new one, only if the role in that slot actually changed. */
  private reconcileSlot(
    studentId: string,
    slot: RoleSlot,
    previousRoleId: string | null,
    next: { id: string; version: number } | null,
    nowIso: string,
  ): void {
    if (previousRoleId === (next?.id ?? null)) return; // unchanged — leave history alone

    const open = this.contextRepo.getOpenHistoryRow(studentId, slot);
    if (open) this.contextRepo.closeHistoryRow(open.id, nowIso);

    if (next) {
      this.contextRepo.insertHistoryRow({
        id: randomUUID(),
        studentId,
        roleId: next.id,
        roleVersion: next.version,
        slot,
        source: 'SELF_SELECTED',
        startedAtIso: nowIso,
      });
    }
  }

  private slugForRoleId(roleId: string): string {
    return this.catalog.getRoleSlugById(roleId) ?? roleId;
  }
}
