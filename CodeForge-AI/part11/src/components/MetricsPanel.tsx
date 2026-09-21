"use client";

import { useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { api } from "@/lib/client/api";
import { Panel, EmptyState } from "@/components/ui";

export function MetricsPanel({ incidentId, onInspect }: { incidentId: string; onInspect: () => void }) {
  const [series, setSeries] = useState<Record<string, { offsetMinutes: number; value: number }[]> | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.getMetrics(incidentId).then((r) => {
      setSeries(r.series);
      const keys = Object.keys(r.series);
      const preferred = keys.find((k) => k.includes("error_rate")) ?? keys[0] ?? null;
      setSelectedKey(preferred);
    });
  }, [incidentId]);

  const keys = useMemo(() => Object.keys(series ?? {}).sort(), [series]);

  async function refresh() {
    const r = await api.getMetrics(incidentId);
    setSeries(r.series);
    if (!loaded) {
      onInspect();
      setLoaded(true);
    }
  }

  useEffect(() => {
    if (series && !loaded) {
      onInspect();
      setLoaded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series]);

  const data = selectedKey ? series?.[selectedKey] ?? [] : [];
  const [serviceKey, metricName] = selectedKey?.split(/:(.+)/) ?? ["", ""];

  return (
    <Panel
      title="Metrics"
      action={
        <button onClick={refresh} className="font-data text-xs text-console-textFaint hover:text-accent-glow transition-colors">
          refresh
        </button>
      }
    >
      {!series ? (
        <EmptyState>Loading metrics…</EmptyState>
      ) : keys.length === 0 ? (
        <EmptyState>No metrics available yet.</EmptyState>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {keys.map((k) => {
              const [svc, metric] = k.split(/:(.+)/);
              return (
                <button
                  key={k}
                  onClick={() => setSelectedKey(k)}
                  className={`rounded border px-2 py-1 font-data text-[11px] transition-colors ${
                    k === selectedKey
                      ? "border-accent/40 bg-accent/15 text-accent-glow"
                      : "border-console-border bg-console-raised text-console-textMuted hover:border-console-textFaint"
                  }`}
                >
                  {svc}.{metric}
                </button>
              );
            })}
          </div>

          <div className="mb-1 font-data text-xs text-console-textFaint">
            {serviceKey} · {metricName}
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 5, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="#1B2029" strokeDasharray="3 3" />
                <XAxis
                  dataKey="offsetMinutes"
                  tick={{ fill: "#5C6478", fontSize: 10, fontFamily: "IBM Plex Mono, monospace" }}
                  tickFormatter={(v) => `${v}m`}
                  stroke="#252B38"
                />
                <YAxis tick={{ fill: "#5C6478", fontSize: 10, fontFamily: "IBM Plex Mono, monospace" }} stroke="#252B38" width={44} />
                <Tooltip
                  contentStyle={{ background: "#171C27", border: "1px solid #252B38", borderRadius: 6, fontSize: 12 }}
                  labelFormatter={(v) => `t = ${v}m`}
                  labelStyle={{ color: "#8B93A8" }}
                />
                <Line type="monotone" dataKey="value" stroke="#6C7CFF" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </Panel>
  );
}
