"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { IncidentEventRow } from "@/lib/engine/types";
import { Panel, EmptyState } from "@/components/ui";

export function TimelinePanel({ incidentId, refreshKey }: { incidentId: string; refreshKey: number }) {
  const [events, setEvents] = useState<IncidentEventRow[] | null>(null);

  useEffect(() => {
    api.listEvents(incidentId).then((r) => setEvents(r.events));
  }, [incidentId, refreshKey]);

  return (
    <Panel title="Your investigation timeline">
      {!events ? (
        <EmptyState>Loading…</EmptyState>
      ) : events.length === 0 ? (
        <EmptyState>Nothing recorded yet — start investigating.</EmptyState>
      ) : (
        <ol className="space-y-1.5">
          {events.map((e) => (
            <li key={e.id} className="flex items-baseline gap-3">
              <span className="font-data text-[11px] text-console-textFaint shrink-0 w-12">+{e.simMinutesAt}m</span>
              <span className="font-data text-xs text-console-text">{e.eventType.replace(/_/g, " ").toLowerCase()}</span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
