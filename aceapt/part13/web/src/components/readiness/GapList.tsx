import { useState } from "react";
import { api } from "../../lib/api";
import { DIMENSION_LABELS } from "../../lib/format";
import type { Intervention, ReadinessGap } from "../../lib/types";

function GapRow({ gap, onIntervene }: { gap: ReadinessGap; onIntervene: (rec: Intervention) => void }) {
  const [loading, setLoading] = useState(false);
  const [requested, setRequested] = useState(false);
  const isHighRisk = gap.severity === "HIGH_RISK";

  return (
    <div className="flex items-start gap-3 py-3 border-b hairline last:border-0">
      <span className={`mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 ${isHighRisk ? "bg-signal-risk" : "bg-signal-developing"}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-paper-100">{DIMENSION_LABELS[gap.dimensionKey]}</span>
          <span className={`label-caps ${isHighRisk ? "text-signal-risk" : "text-signal-developing"}`}>{gap.severity.replace("_", " ")}</span>
        </div>
        <p className="text-sm text-paper-500 mt-0.5 leading-relaxed">{gap.description}</p>
      </div>
      <button
        disabled={loading || requested}
        onClick={async () => {
          setLoading(true);
          try {
            const rec = await api.post<Intervention & { description: string }>("/interventions", { dimensionKey: gap.dimensionKey });
            onIntervene(rec);
            setRequested(true);
          } finally {
            setLoading(false);
          }
        }}
        className="flex-shrink-0 label-caps px-2.5 py-1.5 rounded-md border border-ink-600 text-paper-300 hover:border-signal-ready/40 hover:text-signal-ready transition-colors disabled:opacity-50"
      >
        {requested ? "Requested" : loading ? "..." : "Get intervention"}
      </button>
    </div>
  );
}

export function GapList({ gaps }: { gaps: ReadinessGap[] }) {
  const [recommendation, setRecommendation] = useState<(Intervention & { description?: string }) | null>(null);

  if (gaps.length === 0) {
    return <p className="text-sm text-paper-500 py-4">No high-priority gaps in the current evidence.</p>;
  }

  return (
    <div>
      <div>
        {gaps.map((g) => (
          <GapRow key={g.dimensionKey} gap={g} onIntervene={setRecommendation} />
        ))}
      </div>
      {recommendation && (
        <div className="mt-3 rounded-lg border border-signal-ready/25 bg-signal-ready/5 px-3.5 py-3">
          <div className="label-caps text-signal-ready mb-1">Feature 12 recommends</div>
          <div className="text-sm text-paper-100 font-medium">{recommendation.interventionType?.replaceAll("_", " ")}</div>
          {recommendation.description && <div className="text-sm text-paper-500 mt-0.5">{recommendation.description}</div>}
        </div>
      )}
    </div>
  );
}
