import React from 'react';

interface HorizonMarker {
  label: string;
  direction: 'up' | 'flat' | 'down';
  strength: number; // 0..1, drives how far above/below the line the marker sits
}

/**
 * The signature visual: a horizon line with each signal plotted as a marker
 * that rises into the "sky" (dark band) for growing/emerging signals, sits on
 * the line for stable ones, and dips toward the "ground" for declining ones.
 * Height is driven by real signal strength, not decorative -- this is a
 * direct visual encoding of src/services/marketIntelligence.service.ts's
 * output, not an illustration.
 */
function HorizonInstrument({ markers }: { markers: HorizonMarker[] }) {
  const width = 720;
  const height = 220;
  const lineY = height * 0.62;
  const usable = markers.slice(0, 7);
  const spacing = width / (usable.length + 1);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Horizon instrument showing how key skills are trending">
      <line x1={0} y1={lineY} x2={width} y2={lineY} stroke="#E8DCC8" strokeOpacity={0.35} strokeWidth={1} />
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={0} y1={lineY - (lineY * f)} x2={width} y2={lineY - (lineY * f)} stroke="#E8DCC8" strokeOpacity={0.06} strokeWidth={1} />
      ))}
      {usable.map((m, i) => {
        const x = spacing * (i + 1);
        const maxRise = lineY * 0.75;
        const maxDip = (height - lineY) * 0.7;
        const offset = m.direction === 'up' ? -m.strength * maxRise : m.direction === 'down' ? m.strength * maxDip : 0;
        const y = lineY + offset;
        const color = m.direction === 'up' ? '#C9822E' : m.direction === 'down' ? '#A13D2E' : '#2B6E68';
        return (
          <g key={m.label} className="horizon-marker" style={{ animationDelay: `${i * 90}ms` }}>
            <line x1={x} y1={lineY} x2={x} y2={y} stroke={color} strokeOpacity={0.35} strokeWidth={1} strokeDasharray="2 3" />
            <circle cx={x} cy={y} r={5} fill={color} />
            <circle cx={x} cy={y} r={9} fill={color} fillOpacity={0.15} />
            <text x={x} y={m.direction === 'down' ? y + 22 : y - 14} textAnchor="middle" fill="#E8DCC8" fontSize="11" fontFamily="'JetBrains Mono', monospace" opacity={0.85}>
              {m.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function Hero({
  targetRoleTitle,
  markers,
  classification,
}: {
  targetRoleTitle: string | null;
  markers: HorizonMarker[];
  classification: string | null;
}) {
  return (
    <div className="relative overflow-hidden bg-ink px-6 py-14 sm:px-10 sm:py-20">
      <div className="mx-auto max-w-4xl">
        <p className="font-mono text-[12px] uppercase tracking-[0.2em] text-dawn/60">ACEAPT &middot; Career Horizon</p>
        <h1 className="mt-3 font-display text-4xl font-medium tracking-tight text-dawn sm:text-5xl">Your Career Horizon</h1>
        {targetRoleTitle ? (
          <p className="mt-3 font-serif text-lg text-dawn/80">
            Where <span className="text-dawn">{targetRoleTitle}</span> is heading, and what to prepare for next.
            {classification && (
              <span className="ml-2 font-mono text-[11px] uppercase tracking-wide text-dawn/50">[{classification.toLowerCase()}]</span>
            )}
          </p>
        ) : (
          <p className="mt-3 font-serif text-lg text-dawn/80">No target direction yet -- explore possible paths below to begin.</p>
        )}
      </div>
      {markers.length > 0 && (
        <div className="mx-auto mt-10 max-w-4xl">
          <HorizonInstrument markers={markers} />
          <div className="mt-1 flex justify-center gap-6 font-mono text-[11px] uppercase tracking-wide text-dawn/40">
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-signal-amber" /> rising</span>
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-signal-teal" /> steady</span>
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-signal-rust" /> declining</span>
          </div>
        </div>
      )}
    </div>
  );
}

export type { HorizonMarker };
