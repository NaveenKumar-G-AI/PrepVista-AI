'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, ConfidenceBadge, Eyebrow, ReadinessStateBadge } from '@/components/ui';
import { HistoryTrend } from '@/components/HistoryTrend';
import { AttemptCompare } from '@/components/AttemptCompare';
import { relativeDate } from '@/lib/format';
import type { DimensionScores, EvidenceConfidence, ReadinessState } from '@/lib/db/schema';

interface AttemptSummary {
  attemptId: string;
  resultId: string;
  createdAt: string;
  simulationTitle: string;
  simulatedReadiness: number;
  evidenceConfidence: EvidenceConfidence;
  readinessState: ReadinessState;
  usedAsEvidence: boolean;
  primaryBottleneckLabel: string | null;
  dimensions: DimensionScores;
}

interface ComparisonSide {
  attemptId: string;
  createdAt: string;
  simulatedReadiness: number;
  dimensions: DimensionScores;
}

export default function HistoryPage() {
  const [attempts, setAttempts] = useState<AttemptSummary[] | null>(null);
  const [threshold, setThreshold] = useState(80);
  const [selected, setSelected] = useState<string[]>([]);
  const [comparison, setComparison] = useState<{ a: ComparisonSide; b: ComparisonSide } | null>(null);

  useEffect(() => {
    fetch('/api/history')
      .then((r) => r.json())
      .then((data) => {
        setAttempts(data.attempts);
        setThreshold(data.targetReadinessThreshold);
      });
  }, []);

  function toggleSelect(attemptId: string) {
    setComparison(null);
    setSelected((prev) => {
      if (prev.includes(attemptId)) return prev.filter((id) => id !== attemptId);
      if (prev.length >= 2) return [prev[1], attemptId];
      return [...prev, attemptId];
    });
  }

  async function runComparison() {
    if (selected.length !== 2) return;
    const res = await fetch(`/api/history?compare=${selected[0]},${selected[1]}`);
    const data = await res.json();
    setComparison(data.comparison);
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Eyebrow>SIMULATION HISTORY</Eyebrow>
        <h1 className="text-2xl font-semibold tracking-tightest text-text-1">Your attempts</h1>
      </div>

      {!attempts && <p className="text-text-3">Loading…</p>}
      {attempts && attempts.length === 0 && <p className="text-text-3">No simulations yet. Run your first one from the lobby.</p>}

      {attempts && attempts.length > 0 && (
        <>
          <Card>
            <Eyebrow>READINESS TREND</Eyebrow>
            <div className="mt-3">
              <HistoryTrend points={attempts.map((a) => ({ attemptId: a.attemptId, simulatedReadiness: a.simulatedReadiness, usedAsEvidence: a.usedAsEvidence }))} threshold={threshold} />
            </div>
          </Card>

          <Card>
            <div className="mb-3 flex items-center justify-between">
              <Eyebrow>ATTEMPTS — select two to compare</Eyebrow>
              {selected.length === 2 && (
                <button onClick={runComparison} className="text-sm text-signal hover:underline">
                  Compare selected →
                </button>
              )}
            </div>
            <div className="flex flex-col divide-y divide-line">
              {attempts.map((a) => (
                <div key={a.attemptId} className="flex items-center gap-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.includes(a.attemptId)}
                    onChange={() => toggleSelect(a.attemptId)}
                    className="h-4 w-4 accent-signal"
                    aria-label={`Select attempt from ${relativeDate(a.createdAt)}`}
                  />
                  <Link href={`/attempts/${a.attemptId}/result`} className="flex flex-1 items-center justify-between gap-4 hover:opacity-80">
                    <div>
                      <div className="text-sm text-text-1">{a.simulationTitle}</div>
                      <div className="mt-0.5 text-xs text-text-3">
                        {relativeDate(a.createdAt)} {!a.usedAsEvidence && '· not used as evidence'} {a.primaryBottleneckLabel && `· bottleneck: ${a.primaryBottleneckLabel}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <ConfidenceBadge confidence={a.evidenceConfidence} />
                      <ReadinessStateBadge state={a.readinessState} />
                      <span className="font-data w-12 text-right text-text-1">{a.simulatedReadiness}%</span>
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          </Card>

          {comparison && (
            <Card>
              <Eyebrow>ATTEMPT COMPARISON</Eyebrow>
              <div className="mt-3">
                <AttemptCompare a={comparison.a} b={comparison.b} />
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
