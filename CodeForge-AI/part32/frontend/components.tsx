import type { GapStatus, GapTrend, RoleGapProfile, Severity, SkillGapResult } from "./types";
import { MASTERY_SCALE_MAX } from "./types";

// ---------------------------------------------------------------------------
// Small inline icons (no external icon library assumed)
// ---------------------------------------------------------------------------
function IconCheck(props: { size?: number }) {
  const s = props.size ?? 14;
  return (
    <svg width={s} height={s} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4 10.5 8 14l8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconAlert(props: { size?: number }) {
  const s = props.size ?? 14;
  return (
    <svg width={s} height={s} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 3 2 17h16L10 3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M10 8v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="10" cy="14.5" r="0.9" fill="currentColor" />
    </svg>
  );
}
function IconHelp(props: { size?: number }) {
  const s = props.size ?? 14;
  return (
    <svg width={s} height={s} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7.8 8a2.2 2.2 0 1 1 3 2c-.7.5-1 .9-1 1.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="9.8" cy="14" r="0.9" fill="currentColor" />
    </svg>
  );
}
function IconTrend(props: { direction: "up" | "down" | "flat" | "volatile"; size?: number }) {
  const s = props.size ?? 14;
  if (props.direction === "up")
    return (
      <svg width={s} height={s} viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M3 14 8 9l3 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13 5h4v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (props.direction === "down")
    return (
      <svg width={s} height={s} viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M3 6l5 5 3-3 6 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13 15h4v-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (props.direction === "volatile")
    return (
      <svg width={s} height={s} viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M2 10h3l2-6 3 12 3-9 2 3h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  return (
    <svg width={s} height={s} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M3 10h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Status -> visual mapping (single source of truth for color semantics)
// ---------------------------------------------------------------------------
function statusColorVar(status: GapStatus): string {
  switch (status) {
    case "NO_GAP":
      return "var(--rsg-progress)";
    case "BELOW_TARGET":
    case "DEPENDENCY_BLOCKED":
      return "var(--rsg-critical)";
    case "PARTIAL":
    case "INCONSISTENT":
      return "var(--rsg-warning)";
    case "UNASSESSED":
    case "INSUFFICIENT_EVIDENCE":
    default:
      return "var(--rsg-muted)";
  }
}

function severityBadgeClass(severity: Severity): string {
  if (severity === "CRITICAL") return "rsg-badge rsg-badge--critical";
  if (severity === "HIGH") return "rsg-badge rsg-badge--warning";
  if (severity === "MEDIUM") return "rsg-badge rsg-badge--warning";
  return "rsg-badge rsg-badge--neutral";
}

function statusLabel(status: GapStatus): string {
  switch (status) {
    case "NO_GAP":
      return "Meets target";
    case "BELOW_TARGET":
      return "Below target";
    case "PARTIAL":
      return "Close to target";
    case "UNASSESSED":
      return "Needs assessment";
    case "INSUFFICIENT_EVIDENCE":
      return "More evidence needed";
    case "INCONSISTENT":
      return "Inconsistent performance";
    case "DEPENDENCY_BLOCKED":
      return "Blocked by prerequisite";
  }
}

function trendDirection(trend: GapTrend): "up" | "down" | "flat" | "volatile" {
  if (trend === "IMPROVING") return "up";
  if (trend === "WORSENING") return "down";
  if (trend === "VOLATILE") return "volatile";
  return "flat";
}

// ---------------------------------------------------------------------------
// The signature element: current mastery filled, target rendered as a
// notch. The gap is the visible space between them.
// ---------------------------------------------------------------------------
export function MasteryGapBar(props: { current: number | null; target: number; status: GapStatus }) {
  const { current, target, status } = props;
  const pct = (n: number) => `${Math.min(100, (n / MASTERY_SCALE_MAX) * 100)}%`;
  return (
    <div className="gap-bar" aria-hidden="true">
      <div className="gap-bar__track">
        {current !== null && (
          <div className="gap-bar__fill" style={{ width: pct(current), background: statusColorVar(status) }} />
        )}
        <div className="gap-bar__target-marker" style={{ left: pct(target) }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase 36: role skill coverage overview strip
// ---------------------------------------------------------------------------
export function RoleSkillCoverageOverview(props: { skills: SkillGapResult[] }) {
  const coreSkills = props.skills.filter((s) => s.importance === "CORE");
  return (
    <div className="rsg-card" style={{ padding: 16 }}>
      <div className="rsg-panel-title" style={{ marginBottom: 10 }}>
        Core skill coverage
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {coreSkills.map((s) => {
          const icon =
            s.gapStatus === "NO_GAP" ? (
              <IconCheck />
            ) : s.gapStatus === "UNASSESSED" || s.gapStatus === "INSUFFICIENT_EVIDENCE" ? (
              <IconHelp />
            ) : (
              <IconAlert />
            );
          return (
            <span
              key={s.skillId}
              className="rsg-badge"
              style={{
                background: "var(--rsg-paper)",
                color: statusColorVar(s.gapStatus),
                border: "1px solid var(--rsg-line)",
              }}
              title={statusLabel(s.gapStatus)}
            >
              {icon}
              {s.skillName}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase 37: per-skill gap card
// ---------------------------------------------------------------------------
export function SkillGapCard(props: { skill: SkillGapResult; expanded: boolean; onToggle: () => void }) {
  const { skill, expanded, onToggle } = props;

  return (
    <div className="rsg-card" style={{ padding: "14px 16px" }}>
      <button
        onClick={onToggle}
        style={{
          all: "unset",
          cursor: "pointer",
          display: "flex",
          width: "100%",
          alignItems: "center",
          gap: 16,
        }}
        aria-expanded={expanded}
      >
        <div style={{ flex: "0 0 160px" }}>
          <div className="rsg-heading" style={{ fontSize: 15 }}>
            {skill.skillName}
          </div>
          <div className="rsg-muted" style={{ fontSize: 12 }}>
            {skill.importance.charAt(0) + skill.importance.slice(1).toLowerCase()}
          </div>
        </div>

        <div style={{ flex: "1 1 auto", minWidth: 140 }}>
          <MasteryGapBar current={skill.currentState.masteryLevel} target={skill.targetState.masteryLevel} status={skill.gapStatus} />
          <div className="rsg-muted rsg-mono" style={{ fontSize: 11, marginTop: 4, display: "flex", justifyContent: "space-between" }}>
            <span>{skill.currentState.label}</span>
            <span>target: {skill.targetState.label}</span>
          </div>
        </div>

        <span className={severityBadgeClass(skill.severity)}>{statusLabel(skill.gapStatus)}</span>

        <span title={`Trend: ${skill.trend}`} style={{ color: "var(--rsg-muted)" }}>
          <IconTrend direction={trendDirection(skill.trend)} />
        </span>

        <div className="rsg-mono rsg-muted" style={{ fontSize: 11, flex: "0 0 90px", textAlign: "right" }}>
          confidence {Math.round(skill.confidence * 100)}%
        </div>
      </button>

      {expanded && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--rsg-line)", display: "grid", gap: 10 }}>
          <p style={{ margin: 0, fontSize: 13.5 }}>{skill.aiExplanation ?? skill.explanation.summarySentence}</p>
          {skill.explanation.trendNote && (
            <p className="rsg-muted" style={{ margin: 0, fontSize: 12.5 }}>
              {skill.explanation.trendNote}
            </p>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 12 }}>
            <span className="rsg-muted">
              Evidence:{" "}
              <span className="rsg-mono" style={{ color: "var(--rsg-ink)" }}>
                {skill.evidenceSummary.totalCount}
              </span>{" "}
              ({skill.evidenceSummary.diversity} distinct)
            </span>
            <span className="rsg-muted">
              Closure:{" "}
              <span className="rsg-mono" style={{ color: "var(--rsg-ink)" }}>
                {skill.closureState}
              </span>
            </span>
            <span className="rsg-muted">
              Priority rank:{" "}
              <span className="rsg-mono" style={{ color: "var(--rsg-ink)" }}>
                {skill.priorityRank ?? "-"}
              </span>
            </span>
            {skill.dependency.isRootGap && <span className="rsg-badge rsg-badge--critical">Root cause</span>}
            {skill.dependency.blockedBy.length > 0 && (
              <span className="rsg-muted">Blocked by {skill.dependency.blockedBy.length} prerequisite skill(s)</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase 38: critical gaps, surfaced first, never buried under optional items
// ---------------------------------------------------------------------------
export function CriticalGapsPanel(props: { gaps: SkillGapResult[] }) {
  if (props.gaps.length === 0) {
    return (
      <div className="rsg-card" style={{ padding: 16 }}>
        <div className="rsg-panel-title">Critical for this role</div>
        <p className="rsg-muted" style={{ fontSize: 13, marginTop: 8, marginBottom: 0 }}>
          No critical gaps right now.
        </p>
      </div>
    );
  }
  return (
    <div className="rsg-card" style={{ padding: 16, borderColor: "var(--rsg-critical)" }}>
      <div className="rsg-panel-title" style={{ color: "var(--rsg-critical)" }}>
        Critical for this role
      </div>
      <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
        {props.gaps.map((g) => (
          <div key={g.skillId} style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
            <span>{g.skillName}</span>
            <span className="rsg-muted rsg-mono" style={{ fontSize: 12 }}>
              {g.currentState.label} → {g.targetState.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase 39: skills that simply lack evidence - kept visually distinct from
// confirmed deficiencies (Phase 8).
// ---------------------------------------------------------------------------
export function UnassessedSkillsPanel(props: { skills: SkillGapResult[] }) {
  if (props.skills.length === 0) return null;
  return (
    <div className="rsg-card" style={{ padding: 16 }}>
      <div className="rsg-panel-title">Needs assessment</div>
      <p className="rsg-muted" style={{ fontSize: 12.5, marginTop: 6 }}>
        No meaningful evidence yet - this is not the same as a weak result.
      </p>
      <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
        {props.skills.map((s) => (
          <div key={s.skillId} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
            <span style={{ color: "var(--rsg-muted)" }}>
              <IconHelp />
            </span>
            {s.skillName}
          </div>
        ))}
      </div>
    </div>
  );
}

export function RoleProgressSummary(props: { profile: RoleGapProfile }) {
  const { coreSkillCoverage } = props.profile;
  return (
    <div style={{ display: "flex", gap: 24, alignItems: "baseline" }}>
      <div>
        <span className="rsg-mono" style={{ fontSize: 22, fontWeight: 600 }}>
          {coreSkillCoverage.meetingTarget}/{coreSkillCoverage.total}
        </span>
        <span className="rsg-muted" style={{ fontSize: 12.5, marginLeft: 6 }}>
          core skills at target
        </span>
      </div>
      <div>
        <span className="rsg-mono" style={{ fontSize: 22, fontWeight: 600, color: "var(--rsg-critical)" }}>
          {props.profile.criticalGaps.length}
        </span>
        <span className="rsg-muted" style={{ fontSize: 12.5, marginLeft: 6 }}>
          critical
        </span>
      </div>
      <div>
        <span className="rsg-mono" style={{ fontSize: 22, fontWeight: 600 }}>
          {props.profile.unassessedSkills.length}
        </span>
        <span className="rsg-muted" style={{ fontSize: 12.5, marginLeft: 6 }}>
          need assessment
        </span>
      </div>
    </div>
  );
}
