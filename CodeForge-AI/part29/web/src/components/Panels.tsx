import { useEffect, useState } from "react";
import { api, type SkillSummary, type SnapshotPoint } from "../api.js";
import { SkillTrace } from "./SkillTrace.js";

const TREND_STYLE: Record<string, { label: string; className: string }> = {
  IMPROVING: { label: "Improving", className: "bg-growth/10 text-growth" },
  STABLE: { label: "Stable", className: "bg-ink/5 text-ink/70" },
  PLATEAU: { label: "Plateau", className: "bg-milestone/10 text-milestone" },
  DECLINING: { label: "Declining", className: "bg-regression/10 text-regression" },
  INSUFFICIENT_EVIDENCE: { label: "Insufficient evidence", className: "bg-ink/5 text-ink/50" },
};

export function TrendBadge({ label }: { label: string }) {
  const style = TREND_STYLE[label] ?? TREND_STYLE.INSUFFICIENT_EVIDENCE!;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium font-mono ${style.className}`}>
      {style.label}
    </span>
  );
}

function ConfidenceTag({ confidence }: { confidence: string }) {
  return <span className="text-[11px] font-mono uppercase tracking-wide text-ink/40">{confidence.toLowerCase()} confidence</span>;
}

export function OverviewHeader({
  overallGrowth,
}: {
  overallGrowth: { value: number; skillsIncluded: number } | { unavailable: true; reason: string };
}) {
  const available = !("unavailable" in overallGrowth);
  return (
    <div className="border border-line bg-raised rounded-lg p-6">
      <div className="text-xs font-mono uppercase tracking-wider text-ink/50 mb-2">Overall technical growth</div>
      {available ? (
        <>
          <div className="font-display text-5xl font-semibold text-growth">
            {overallGrowth.value > 0 ? "+" : ""}
            {overallGrowth.value}
          </div>
          <div className="text-sm text-ink/60 mt-1">
            averaged across {overallGrowth.skillsIncluded} skill{overallGrowth.skillsIncluded === 1 ? "" : "s"} with comparable, evidence-backed history
          </div>
        </>
      ) : (
        <div className="text-ink/50 text-sm">{overallGrowth.reason}</div>
      )}
    </div>
  );
}

function SkillRow({
  skill,
  studentId,
  userId,
  role,
  milestones,
}: {
  skill: SkillSummary;
  studentId: string;
  userId: string;
  role: string;
  milestones: { type: string; achieved_at: string; description: string; skill_name: string }[];
}) {
  const [series, setSeries] = useState<SnapshotPoint[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.snapshots(studentId, skill.skillId, userId, role).then((res) => {
      if (!cancelled) setSeries(res.snapshots);
    });
    return () => {
      cancelled = true;
    };
  }, [studentId, skill.skillId, userId, role]);

  const growthAvailable = !("unavailable" in skill.growth) || !skill.growth.unavailable;
  const change = growthAvailable ? skill.growth.absoluteChange ?? 0 : 0;
  const skillMilestones = milestones.filter((m) => m.skill_name === skill.skillName);

  return (
    <div className="grid grid-cols-[1fr_auto] gap-4 items-center py-4 border-b border-line last:border-b-0">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="font-display font-medium text-sm">{skill.skillName}</span>
          <TrendBadge label={skill.trend.label} />
        </div>
        <SkillTrace
          points={series ?? []}
          milestones={skillMilestones}
          confidence={skill.currentConfidence}
          positive={change >= 0}
        />
      </div>
      <div className="text-right min-w-[110px]">
        <div className={`font-mono text-2xl font-semibold ${growthAvailable ? (change >= 0 ? "text-growth" : "text-regression") : "text-ink/30"}`}>
          {growthAvailable ? `${change >= 0 ? "+" : ""}${change}` : "—"}
        </div>
        <div className="font-mono text-xs text-ink/50">now: {skill.currentValue}</div>
        <ConfidenceTag confidence={skill.currentConfidence} />
      </div>
    </div>
  );
}

export function SkillList({
  skills,
  studentId,
  userId,
  role,
  milestones,
}: {
  skills: SkillSummary[];
  studentId: string;
  userId: string;
  role: string;
  milestones: { type: string; achieved_at: string; description: string; skill_name: string }[];
}) {
  return (
    <div className="border border-line bg-raised rounded-lg px-6">
      {skills.map((s) => (
        <SkillRow key={s.skillId} skill={s} studentId={studentId} userId={userId} role={role} milestones={milestones} />
      ))}
    </div>
  );
}

export function MilestonesPanel({
  milestones,
}: {
  milestones: { type: string; achieved_at: string; description: string; skill_name: string }[];
}) {
  return (
    <div className="border border-line bg-raised rounded-lg p-6">
      <div className="text-xs font-mono uppercase tracking-wider text-ink/50 mb-4">Milestones</div>
      {milestones.length === 0 ? (
        <div className="text-sm text-ink/40">None yet.</div>
      ) : (
        <ul className="space-y-3">
          {milestones.map((m, i) => (
            <li key={i} className="flex gap-3">
              <div className="mt-1 w-2 h-2 rotate-45 bg-milestone flex-shrink-0" />
              <div>
                <div className="text-sm font-medium">
                  {m.skill_name} <span className="text-ink/40 font-mono text-xs">{m.type}</span>
                </div>
                <div className="text-sm text-ink/60">{m.description}</div>
                <div className="text-xs font-mono text-ink/35 mt-0.5">
                  {new Date(m.achieved_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const EVENT_LABEL: Record<string, string> = {
  SNAPSHOT_CREATED: "Snapshot recorded",
  MILESTONE_ACHIEVED: "Milestone achieved",
  REGRESSION_DETECTED: "Regression detected",
  RECOVERY_DETECTED: "Recovered",
};

export function TimelinePanel({ events }: { events: { event_type: string; created_at: string; skill_name?: string }[] }) {
  return (
    <div className="border border-line bg-raised rounded-lg p-6">
      <div className="text-xs font-mono uppercase tracking-wider text-ink/50 mb-4">Timeline</div>
      <ol className="relative border-l border-line ml-1.5 space-y-4">
        {events.map((e, i) => (
          <li key={i} className="ml-4">
            <div className="absolute w-2 h-2 bg-signal rounded-full -translate-x-[19px] mt-1.5" />
            <div className="text-sm font-medium">{EVENT_LABEL[e.event_type] ?? e.event_type}</div>
            <div className="text-xs text-ink/50">
              {e.skill_name ? `${e.skill_name} · ` : ""}
              {new Date(e.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
