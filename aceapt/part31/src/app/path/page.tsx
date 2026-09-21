'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, Eyebrow } from '@/components/ui';
import { NextBestAction } from '@/components/NextBestAction';
import { relativeDate } from '@/lib/format';
import type { PathState } from '@/lib/db/schema';

interface Forecast {
  available: boolean;
  message: string;
  ratePerAttempt?: number;
  projectedAttemptsToThreshold?: number;
}

export default function PathPage() {
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);
  const [path, setPath] = useState<PathState | null>(null);
  const [forecast, setForecast] = useState<Forecast | null>(null);

  useEffect(() => {
    fetch('/api/path')
      .then((r) => r.json())
      .then((data) => {
        setTarget(data.target);
        setPath(data.path);
        setForecast(data.forecast);
      });
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Eyebrow>PATH{target ? ` · ${target.name}` : ''}</Eyebrow>
        <h1 className="text-2xl font-semibold tracking-tightest text-text-1">What should I do next?</h1>
        <p className="mt-2 max-w-xl text-text-2">
          PATH is Feature 30&apos;s job — this is a lightweight local view showing how Feature 31&apos;s simulation evidence feeds into it. Every change below was produced by an actual completed, reliable
          simulation.
        </p>
      </div>

      {!path && <Card><p className="text-sm text-text-2">No simulation evidence yet for this target. Run a readiness simulation to establish your first evidence-based bottleneck.</p></Card>}

      {path && (
        <>
          <Card>
            <Eyebrow>CURRENT BOTTLENECK</Eyebrow>
            <div className="text-xl font-medium text-text-1">{path.currentBottleneck.label}</div>
            <p className="mt-2 text-sm leading-relaxed text-text-2">{path.currentBottleneck.reason}</p>
            <p className="mt-3 text-xs text-text-3">Last updated {relativeDate(path.updatedAt)}</p>
          </Card>

          <NextBestAction action={path.nextBestAction} href="/simulations" hrefLabel="Run readiness simulation" />

          {forecast && (
            <Card>
              <Eyebrow>PROJECTION</Eyebrow>
              <p className="text-sm text-text-2">{forecast.message}</p>
            </Card>
          )}

          {path.history.length > 0 && (
            <Card>
              <Eyebrow>WHY DID MY PATH CHANGE?</Eyebrow>
              <div className="flex flex-col divide-y divide-line">
                {[...path.history].reverse().map((h, i) => (
                  <div key={i} className="py-3">
                    <div className="text-sm text-text-1">{h.bottleneckLabel}</div>
                    <p className="mt-0.5 text-xs text-text-3">
                      {h.reason} · {relativeDate(h.at)}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      <Link href="/simulations/history" className="text-sm text-signal hover:underline">
        View simulation history →
      </Link>
    </div>
  );
}
