import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { SegmentEvidence } from "../lib/types";

function colorFor(pct: number | null): string {
  if (pct == null) return "#cbd5e1"; // slate-300
  if (pct >= 75) return "#10b981"; // emerald-500
  if (pct >= 50) return "#f59e0b"; // amber-500
  return "#f43f5e"; // rose-500
}

export default function SegmentChart({ segments }: { segments: SegmentEvidence[] }) {
  const data = segments.map((s) => ({ name: s.label, accuracy: s.accuracyPct ?? 0, hasData: s.accuracyPct != null }));
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} width={36} />
          <Tooltip
            formatter={(value: number) => [`${value}%`, "Accuracy"]}
            contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }}
          />
          <Bar dataKey="accuracy" radius={[8, 8, 0, 0]} maxBarSize={64}>
            {data.map((d, i) => (
              <Cell key={i} fill={colorFor(d.hasData ? d.accuracy : null)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
