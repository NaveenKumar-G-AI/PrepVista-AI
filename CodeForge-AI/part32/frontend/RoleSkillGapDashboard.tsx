import { useMemo, useState } from "react";
import "./tokens.css";
import type { RoleGapProfile } from "./types";
import {
  CriticalGapsPanel,
  RoleProgressSummary,
  RoleSkillCoverageOverview,
  SkillGapCard,
  UnassessedSkillsPanel,
} from "./components";

type ViewFilter = "priority" | "all" | "needs-assessment";

/**
 * Implements Phase 35 (Student Experience). Deliberately NOT a chatbot-
 * style interface - a structured dashboard the student can scan in a few
 * seconds: target role, what's meeting the bar, what's critical, what
 * needs evidence, and the detail behind any one skill on demand.
 */
export function RoleSkillGapDashboard(props: { profile: RoleGapProfile }) {
  const { profile } = props;
  const [filter, setFilter] = useState<ViewFilter>("priority");
  const [expandedSkillId, setExpandedSkillId] = useState<string | null>(null);

  const visibleSkills = useMemo(() => {
    if (filter === "priority") return profile.priorityGaps;
    if (filter === "needs-assessment") return profile.unassessedSkills;
    return profile.skills;
  }, [filter, profile]);

  return (
    <div className="rsg-root" style={{ padding: 24, maxWidth: 880, margin: "0 auto" }}>
      <header style={{ marginBottom: 20 }}>
        <div className="rsg-muted" style={{ fontSize: 12.5, marginBottom: 4 }}>
          Target role
        </div>
        <h1 className="rsg-heading" style={{ fontSize: 26, margin: 0 }}>
          {profile.roleName}
        </h1>
        <div className="rsg-muted rsg-mono" style={{ fontSize: 11, marginTop: 4 }}>
          role model {profile.roleModelVersion} · calculated {new Date(profile.calculatedAt).toLocaleString()}
        </div>
      </header>

      <div style={{ marginBottom: 20 }}>
        <RoleProgressSummary profile={profile} />
      </div>

      <div style={{ display: "grid", gap: 16, marginBottom: 20 }}>
        <RoleSkillCoverageOverview skills={profile.skills} />
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
          <CriticalGapsPanel gaps={profile.criticalGaps} />
          <UnassessedSkillsPanel skills={profile.unassessedSkills} />
        </div>
      </div>

      <div role="tablist" aria-label="Skill list filter" style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        {(
          [
            ["priority", `Priority (${profile.priorityGaps.length})`],
            ["all", `All skills (${profile.skills.length})`],
            ["needs-assessment", `Needs assessment (${profile.unassessedSkills.length})`],
          ] as [ViewFilter, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={filter === value}
            onClick={() => setFilter(value)}
            style={{
              all: "unset",
              cursor: "pointer",
              padding: "6px 12px",
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 500,
              background: filter === value ? "var(--rsg-focus-soft)" : "transparent",
              color: filter === value ? "var(--rsg-focus)" : "var(--rsg-muted)",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {visibleSkills.length === 0 && (
          <p className="rsg-muted" style={{ fontSize: 13.5 }}>
            Nothing in this view right now.
          </p>
        )}
        {visibleSkills.map((skill) => (
          <SkillGapCard
            key={skill.skillId}
            skill={skill}
            expanded={expandedSkillId === skill.skillId}
            onToggle={() => setExpandedSkillId((prev) => (prev === skill.skillId ? null : skill.skillId))}
          />
        ))}
      </div>
    </div>
  );
}

export default RoleSkillGapDashboard;
