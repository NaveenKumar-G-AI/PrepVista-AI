"use client";

import { IncidentInstance, IncidentTemplatePublic } from "@/lib/engine/types";
import { SeverityBadge, StateBadge } from "@/components/ui";

export function IncidentHeader({ incident, template }: { incident: IncidentInstance; template: IncidentTemplatePublic }) {
  const hours = Math.floor(incident.simMinutesElapsed / 60);
  const mins = Math.floor(incident.simMinutesElapsed % 60);
  const clock = hours > 0 ? `+${hours}h ${mins}m` : `+${mins}m`;

  return (
    <div className="rounded-lg border border-console-border bg-console-surface p-5 shadow-panel">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-data text-sm font-semibold text-console-textMuted">{incident.code}</span>
        <SeverityBadge severity={template.severity} />
        <StateBadge state={incident.state} />
        {incident.escalationLevel > 0 && (
          <span className="rounded border border-sev-critical/30 bg-sev-critical/10 px-2 py-0.5 font-data text-xs font-semibold text-sev-critical">
            ESCALATED ×{incident.escalationLevel}
          </span>
        )}
        <span className="ml-auto font-data text-xs text-console-textFaint">
          Incident clock <span className="text-console-text">{clock}</span>
        </span>
      </div>

      <h1 className="mt-3 text-xl font-semibold">{template.title}</h1>
      <p className="mt-1 text-sm text-console-textMuted">{template.businessImpact}</p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {template.services.map((s) => (
          <span key={s.key} className="rounded border border-console-border bg-console-raised px-2 py-1 font-data text-xs text-console-textMuted">
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}
