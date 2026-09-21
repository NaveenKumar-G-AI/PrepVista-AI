'use client';

interface Point {
  attemptId: string;
  simulatedReadiness: number;
  usedAsEvidence: boolean;
}

export function HistoryTrend({ points, threshold }: { points: Point[]; threshold: number }) {
  const reliable = points.filter((p) => p.usedAsEvidence);
  if (reliable.length === 0) {
    return <p className="text-sm text-text-3">No reliable attempts yet — a trend will appear once you have completed simulations with enough coverage to count as evidence.</p>;
  }

  const W = 560;
  const H = 140;
  const PAD = 24;
  const n = reliable.length;
  const xFor = (i: number) => (n === 1 ? W / 2 : PAD + (i * (W - PAD * 2)) / (n - 1));
  const yFor = (v: number) => H - PAD - (v / 100) * (H - PAD * 2);
  const thresholdY = yFor(threshold);

  const linePoints = reliable.map((p, i) => `${xFor(i)},${yFor(p.simulatedReadiness)}`).join(' ');

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Simulated readiness across attempts">
      <line x1={PAD} y1={thresholdY} x2={W - PAD} y2={thresholdY} stroke="#5C6577" strokeDasharray="3 4" strokeWidth={1} />
      <text x={W - PAD} y={thresholdY - 6} textAnchor="end" fontSize={10} fill="#5C6577" fontFamily="ui-monospace, monospace">
        target {threshold}%
      </text>
      <polyline points={linePoints} fill="none" stroke="#4C8DFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {reliable.map((p, i) => (
        <g key={p.attemptId}>
          <circle cx={xFor(i)} cy={yFor(p.simulatedReadiness)} r={4} fill="#12151A" stroke="#4C8DFF" strokeWidth={2} />
          <text x={xFor(i)} y={yFor(p.simulatedReadiness) - 10} textAnchor="middle" fontSize={11} fill="#F3F5F8" fontFamily="ui-monospace, monospace">
            {p.simulatedReadiness}%
          </text>
        </g>
      ))}
    </svg>
  );
}
