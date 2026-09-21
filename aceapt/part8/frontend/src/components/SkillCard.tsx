import { Link } from "react-router-dom";
import type { MasteryMapEntry } from "../api/client";
import { StateBadge, ConfidenceBadge } from "./StateBadge";

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function SkillCard({ entry }: { entry: MasteryMapEntry }) {
  const lastVerified = formatDate(entry.lastVerifiedAt);
  return (
    <Link
      to={`/skills/${entry.skillId}`}
      className="block rounded-lg border border-line bg-paper-raised p-4 shadow-card hover:shadow-raised hover:border-ink-faint transition-shadow"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-base leading-snug text-ink">{entry.skillName}</h3>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <StateBadge state={entry.state} size="sm" />
        {entry.confidence && <ConfidenceBadge confidence={entry.confidence} />}
      </div>
      {lastVerified && <p className="mt-3 text-xs text-ink-faint">Last verified {lastVerified}</p>}
    </Link>
  );
}
