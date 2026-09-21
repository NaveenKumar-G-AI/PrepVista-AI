import React from 'react';

/**
 * Mirrors src/ai/explainReadiness.ts's StudentFacingReadinessView shape —
 * duplicated here (rather than imported) so this component has zero
 * dependency on the backend package and can be dropped into any React app.
 * Keep the two in sync, or import the shared type if you wire this into
 * the same monorepo/package as the engine.
 */
export interface RoleReadinessCardProps {
  roleName: string;
  readinessState: 'NOT_ASSESSED' | 'EARLY_STAGE' | 'DEVELOPING' | 'APPROACHING_READY' | 'READY' | 'STRONGLY_READY';
  readinessScore: number; // 0-100, from the server — never invent this on the client
  confidence: 'low' | 'medium' | 'high';
  strengths: { skillName: string; message: string }[];
  blockers: { skillName: string; message: string; severity: string }[];
  /** Supplied by the existing Next Best Action Engine (Phase 38) — this component never invents a recommendation. */
  nextStep?: string;
}

const STATE_META: Record<
  RoleReadinessCardProps['readinessState'],
  { label: string; color: string; bg: string }
> = {
  NOT_ASSESSED: { label: 'Not yet assessed', color: '#64748b', bg: '#f1f5f9' },
  EARLY_STAGE: { label: 'Early stage', color: '#b45309', bg: '#fef3c7' },
  DEVELOPING: { label: 'Developing', color: '#b45309', bg: '#fef3c7' },
  APPROACHING_READY: { label: 'Approaching ready', color: '#1d4ed8', bg: '#dbeafe' },
  READY: { label: 'Ready', color: '#15803d', bg: '#dcfce7' },
  STRONGLY_READY: { label: 'Strongly ready', color: '#15803d', bg: '#dcfce7' },
};

const CONFIDENCE_META: Record<RoleReadinessCardProps['confidence'], string> = {
  low: 'Low confidence — evidence is still thin',
  medium: 'Medium confidence',
  high: 'High confidence — backed by extensive evidence',
};

export default function RoleReadinessCard({
  roleName,
  readinessState,
  readinessScore,
  confidence,
  strengths,
  blockers,
  nextStep,
}: RoleReadinessCardProps) {
  const meta = STATE_META[readinessState];
  const criticalBlockers = blockers.filter((b) => b.severity === 'critical');
  const otherBlockers = blockers.filter((b) => b.severity !== 'critical');

  return (
    <div
      style={{
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
        maxWidth: 480,
        border: '1px solid #e2e8f0',
        borderRadius: 12,
        padding: 24,
        background: '#ffffff',
      }}
    >
      <div style={{ fontSize: 13, color: '#64748b', letterSpacing: 0.3, textTransform: 'uppercase' }}>
        Target role
      </div>
      <div style={{ fontSize: 20, fontWeight: 600, color: '#0f172a', marginTop: 2 }}>{roleName}</div>

      <div
        style={{
          display: 'inline-block',
          marginTop: 12,
          padding: '4px 12px',
          borderRadius: 999,
          background: meta.bg,
          color: meta.color,
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        {meta.label}
      </div>

      <div style={{ marginTop: 16 }}>
        <div
          style={{
            height: 8,
            borderRadius: 999,
            background: '#e2e8f0',
            overflow: 'hidden',
          }}
          role="progressbar"
          aria-valuenow={readinessScore}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            style={{
              height: '100%',
              width: `${readinessScore}%`,
              background: meta.color,
              transition: 'width 400ms ease',
            }}
          />
        </div>
        <div style={{ marginTop: 6, fontSize: 13, color: '#64748b' }}>
          {readinessScore}/100 · {CONFIDENCE_META[confidence]}
        </div>
      </div>

      {strengths.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 6 }}>Strong areas</div>
          <ul style={{ margin: 0, paddingLeft: 18, color: '#334155', fontSize: 14 }}>
            {strengths.map((s) => (
              <li key={s.skillName}>{s.message}</li>
            ))}
          </ul>
        </div>
      )}

      {blockers.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 6 }}>
            What's blocking readiness
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, color: '#334155', fontSize: 14 }}>
            {[...criticalBlockers, ...otherBlockers].map((b) => (
              <li key={b.skillName} style={{ marginBottom: 4 }}>
                {b.message}
                {b.severity === 'critical' && (
                  <span style={{ marginLeft: 6, fontSize: 11, color: '#b91c1c', fontWeight: 600 }}>REQUIRED</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {nextStep && (
        <div
          style={{
            marginTop: 20,
            padding: 12,
            borderRadius: 8,
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            fontSize: 14,
            color: '#0f172a',
          }}
        >
          <span style={{ fontWeight: 600 }}>Next step: </span>
          {nextStep}
        </div>
      )}
    </div>
  );
}
