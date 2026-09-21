import type { MasteryLevel, RoleReadinessEntry, SkillGapEntry, SkillMasteryEntry } from "../../types/report";

const LEVEL_ORDER: MasteryLevel[] = ["FOUNDATIONAL", "DEVELOPING", "COMPETENT", "PROFICIENT", "ADVANCED", "EXPERT"];

function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, " ");
}

/** Discrete tick-scale gauge — mastery levels are stages, not a percentage, so the gauge reads that way too. */
function MasteryGauge({ level }: { level: MasteryLevel }) {
  const idx = LEVEL_ORDER.indexOf(level);
  return (
    <div className="flex gap-[3px]" role="img" aria-label={`Mastery level: ${titleCase(level)}`}>
      {LEVEL_ORDER.map((l, i) => (
        <span
          key={l}
          aria-hidden="true"
          className={`h-2 w-3.5 rounded-sm border ${
            i <= idx
              ? "bg-[color:var(--report-accent)] border-[color:var(--report-accent)]"
              : "bg-[color:var(--report-surface-2)] border-[color:var(--report-border)]"
          }`}
        />
      ))}
    </div>
  );
}

const TREND_COPY: Record<string, string> = {
  UP: "↗ up",
  DOWN: "↘ down",
  STABLE: "→ stable",
  INSUFFICIENT_DATA: "insufficient data",
};

export function MasteryAndSkillsSection({ skills }: { skills: SkillMasteryEntry[] }) {
  return (
    <section aria-labelledby="skills-heading" className="mb-11">
      <h2
        id="skills-heading"
        className="font-[family-name:var(--report-font-display)] text-lg font-semibold pb-2.5 mb-2 border-b border-[color:var(--report-border)]"
      >
        Skill Mastery Map
      </h2>
      <ul>
        {skills.map((s) => (
          <li
            key={s.skillId}
            className="grid grid-cols-[minmax(160px,1.4fr)_auto_100px_1fr] items-center gap-4 py-3 border-b border-[color:var(--report-border)] last:border-0"
          >
            <div className="flex items-center gap-2 font-medium text-[color:var(--report-text)]">
              <span>{s.skillName}</span>
              {s.gapStatus === "BLOCKING_GAP" && (
                <span className="rounded-full bg-[color:var(--report-alert)]/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-[color:var(--report-alert)]">
                  Blocking gap
                </span>
              )}
              {s.gapStatus === "GAP" && (
                <span className="rounded-full bg-[color:var(--report-accent)]/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-[color:var(--report-accent)]">
                  Gap
                </span>
              )}
            </div>
            <MasteryGauge level={s.masteryLevel} />
            <div className="text-[13px] font-medium text-[color:var(--report-accent)]">{titleCase(s.masteryLevel)}</div>
            <div className="flex items-center gap-1.5 text-[12.5px] text-[color:var(--report-text-muted)]">
              <span>{TREND_COPY[s.trend]}</span>
              <span aria-hidden="true">·</span>
              <span>{titleCase(s.evidenceStrength)} evidence</span>
              <span className="font-[family-name:var(--report-font-mono)]">({s.evidenceCount})</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

const READINESS_TONE: Record<string, string> = {
  READY: "text-[color:var(--report-positive)] border-[color:var(--report-positive)]",
  NEAR_READY: "text-[color:var(--report-accent)] border-[color:var(--report-accent)]",
  DEVELOPING: "text-[color:var(--report-text-muted)] border-[color:var(--report-border)]",
  NOT_READY: "text-[color:var(--report-alert)] border-[color:var(--report-alert)]",
  INSUFFICIENT_DATA: "text-[color:var(--report-text-muted)] border-[color:var(--report-border)]",
};

export function RoleReadinessSection({ roles, gaps }: { roles: RoleReadinessEntry[]; gaps: SkillGapEntry[] }) {
  return (
    <>
      <section aria-labelledby="roles-heading" className="mb-11">
        <h2
          id="roles-heading"
          className="font-[family-name:var(--report-font-display)] text-lg font-semibold pb-2.5 mb-4 border-b border-[color:var(--report-border)]"
        >
          Target Role Readiness
        </h2>
        {roles.length === 0 ? (
          <p className="text-sm italic text-[color:var(--report-text-muted)]">No target role is set yet.</p>
        ) : (
          <div className="grid gap-3.5 sm:grid-cols-2">
            {roles.map((r) => (
              <article key={r.roleId} className="rounded-xl border border-[color:var(--report-border)] bg-[color:var(--report-surface)] p-4">
                <div className="flex items-baseline justify-between gap-3 mb-2">
                  <h3 className="font-[family-name:var(--report-font-display)] font-semibold text-[15px]">{r.roleName}</h3>
                  <span className={`rounded-full border px-2.5 py-0.5 text-[11px] ${READINESS_TONE[r.readiness]}`}>
                    {titleCase(r.readiness)}
                  </span>
                </div>
                {r.readyAreas.length > 0 && (
                  <p className="text-[13px] mb-1">
                    <strong className="font-medium">Ready:</strong> {r.readyAreas.join(", ")}
                  </p>
                )}
                {r.developingAreas.length > 0 && (
                  <p className="text-[13px] mb-1">
                    <strong className="font-medium">Developing:</strong> {r.developingAreas.join(", ")}
                  </p>
                )}
                {r.blockingGaps.length > 0 && (
                  <p className="text-[13px] text-[color:var(--report-alert)]">
                    <strong className="font-medium">Blocking:</strong> {r.blockingGaps.join(", ")}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="gaps-heading" className="mb-11">
        <h2
          id="gaps-heading"
          className="font-[family-name:var(--report-font-display)] text-lg font-semibold pb-2.5 mb-4 border-b border-[color:var(--report-border)]"
        >
          Skill Gaps
        </h2>
        {gaps.length === 0 ? (
          <p className="text-sm italic text-[color:var(--report-text-muted)]">No notable gaps currently on record.</p>
        ) : (
          <div className="grid gap-3.5 sm:grid-cols-2">
            {gaps.map((g) => (
              <article
                key={`${g.roleId}-${g.skillId}`}
                className="rounded-xl border border-l-[3px] border-[color:var(--report-border)] border-l-[color:var(--report-alert)] bg-[color:var(--report-surface)] p-4"
              >
                <div className="flex items-baseline justify-between gap-3 mb-1.5">
                  <h3 className="font-[family-name:var(--report-font-display)] font-semibold text-[15px]">{g.skillName}</h3>
                  <span className="font-[family-name:var(--report-font-mono)] text-[11px] text-[color:var(--report-text-muted)] whitespace-nowrap">
                    {titleCase(g.currentState)} → {titleCase(g.expectedState)}
                  </span>
                </div>
                <p className="text-[13px] mb-1.5">{g.roleImpact}</p>
                <p className="text-[13px] text-[color:var(--report-text-muted)]">{g.recommendedAction}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
