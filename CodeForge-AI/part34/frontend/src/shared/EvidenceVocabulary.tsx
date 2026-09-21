// ============================================================================
// EvidenceBadge and SkillCoverageRail are the one visual idea this whole
// frontend is built around: the product's actual data model (Phase 7's four
// EvidenceStates) rendered directly, instead of a generic score/progress
// bar standing in for it. Used in the live session rail (Phase 57), the
// post-interview coverage map (Phase 58), and the institutional gap list
// (Phase 59) — one component, three contexts, so the vocabulary stays
// consistent everywhere a student or reviewer sees it.
// ============================================================================

import "./tokens.css";
import "./sharedComponents.css";

export type EvidenceState = "VERIFIED" | "PARTIALLY_VERIFIED" | "UNCERTAIN" | "UNASSESSED";

const EVIDENCE_LABEL: Record<EvidenceState, string> = {
  VERIFIED: "Verified",
  PARTIALLY_VERIFIED: "Partially verified",
  UNCERTAIN: "Uncertain",
  UNASSESSED: "Not yet assessed",
};

export function EvidenceBadge({ state, size = "md" }: { state: EvidenceState; size?: "sm" | "md" }) {
  return (
    <span className={`ti-evidence-badge ti-evidence-badge--${state.toLowerCase()} ti-evidence-badge--${size}`}>
      <span className="ti-evidence-badge__dot" aria-hidden="true" />
      {EVIDENCE_LABEL[state]}
    </span>
  );
}

export interface CoverageRailItem {
  skillId: string;
  skillLabel: string;
  state: EvidenceState;
  isCurrent?: boolean;
}

/**
 * The live-session rail (Phase 57): each skill gets one mark that fills in
 * as real evidence accumulates. Deliberately NOT "3 of 6 skills done" —
 * that framing implies a checklist to race through, when the actual product
 * goal (Phase 22-23) is sufficient evidence, not maximum speed.
 */
export function SkillCoverageRail({ items, orientation = "vertical" }: { items: CoverageRailItem[]; orientation?: "vertical" | "horizontal" }) {
  return (
    <ul className={`ti-coverage-rail ti-coverage-rail--${orientation}`} aria-label="Skill coverage">
      {items.map((item) => (
        <li key={item.skillId} className={`ti-coverage-rail__item${item.isCurrent ? " ti-coverage-rail__item--current" : ""}`}>
          <span className={`ti-coverage-rail__mark ti-coverage-rail__mark--${item.state.toLowerCase()}`} aria-hidden="true" />
          <span className="ti-coverage-rail__label">{item.skillLabel}</span>
        </li>
      ))}
    </ul>
  );
}
