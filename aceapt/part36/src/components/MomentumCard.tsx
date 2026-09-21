import { momentumDisplay } from "@/lib/presentation";
import type { MomentumLabel } from "@/lib/types";
import StateBadge from "./StateBadge";

export default function MomentumCard({ label, facts }: { label: MomentumLabel; facts: string[] }) {
  const display = momentumDisplay(label);
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">Career momentum</p>
      <div className="mt-2">
        <StateBadge label={display.label} tone={display.tone} />
      </div>
      <ul className="mt-2 space-y-1">
        {facts.map((f, i) => (
          <li key={i} className="text-xs text-ink-muted">
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}
