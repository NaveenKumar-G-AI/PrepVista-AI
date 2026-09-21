import React, { useEffect, useState } from "react";
import { accuracyApi } from "../lib/api.js";

interface ErrorPatternCardData {
  bottleneck: { errorType: string; recurrenceStatus: string; frequency: number; interventionType: string } | null;
  whyThisFocus: string;
}

function humanize(s: string): string {
  return s.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());
}

export function ErrorPatternCard() {
  const [data, setData] = useState<ErrorPatternCardData | null>(null);

  useEffect(() => {
    accuracyApi.getErrorPatternCard().then((d) => setData(d as ErrorPatternCardData));
  }, []);

  if (!data) return null;
  if (!data.bottleneck) {
    return <div className="max-w-md border border-rule bg-paper p-4 text-sm text-ink-soft">Not enough recent attempts yet to identify a pattern.</div>;
  }

  return (
    <div className="max-w-md border border-rule bg-paper p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Your current pattern</p>
      <p className="mt-1 text-lg font-semibold text-ink">{humanize(data.bottleneck.errorType)}</p>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">{data.whyThisFocus}</p>
      <button type="button" className="mt-3 border border-ink px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-ink hover:text-paper">
        Practice
      </button>
    </div>
  );
}
