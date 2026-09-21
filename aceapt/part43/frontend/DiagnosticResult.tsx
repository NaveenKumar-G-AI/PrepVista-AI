import React, { useState } from 'react';
import { ApiResult, AdaptiveDiagnosticApi } from './api';

const LABEL_COPY: Record<string, string> = {
  unknown: 'Not yet explored',
  emerging: 'Early stage',
  developing: 'Developing',
  proficient: 'Solid',
  advanced: 'Strength',
};

/**
 * Combines the spec's CapabilitySummary, EvidenceExplanation, and
 * NextBestAction components into one result screen - split back apart if
 * your design system wants them as separate cards/routes.
 */
export function DiagnosticResult({ sessionId, result }: { sessionId: string; result: ApiResult }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28, maxWidth: 640 }}>
      <header>
        <h2 style={{ margin: 0, fontSize: 22, color: '#2c2418' }}>Your Adaptive Diagnostic</h2>
        <p style={{ margin: '4px 0 0', fontSize: 14, color: '#8a7a68' }}>
          Overall evidence confidence: <strong>{result.evidenceConfidenceOverall}</strong>
        </p>
      </header>

      <Section title="Strongest areas">
        {result.strongestAreas.length === 0 ? (
          <Empty text="Nothing reached a confirmed strength yet - that's normal for a first session." />
        ) : (
          result.strongestAreas.map((s) => <SkillRow key={s.skillId} sessionId={sessionId} skill={s} />)
        )}
      </Section>

      <Section title="Development areas">
        {result.developmentAreas.length === 0 ? (
          <Empty text="No clear development areas identified yet." />
        ) : (
          result.developmentAreas.map((s) => <SkillRow key={s.skillId} sessionId={sessionId} skill={s} />)
        )}
      </Section>

      {result.unknownAreas.length > 0 && (
        <Section title="Not yet explored">
          <p style={{ margin: 0, fontSize: 14, color: '#8a7a68' }}>{result.unknownAreas.join(', ')}</p>
        </Section>
      )}

      <Section title="What to work on next">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {result.nextBestActions.map((a) => (
            <div key={a.skillId} style={{ border: '1px solid #e4d8c8', borderRadius: 12, padding: '12px 16px' }}>
              <div style={{ fontWeight: 600, fontSize: 15, color: '#2c2418' }}>{a.skillLabel}</div>
              <div style={{ fontSize: 14, color: '#4a3a2c', marginTop: 2 }}>{a.recommendedAction}</div>
              <div style={{ fontSize: 13, color: '#8a7a68', marginTop: 4 }}>{a.reason}</div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function SkillRow({ sessionId, skill }: { sessionId: string; skill: ApiResult['currentCapability'][number] }) {
  const [why, setWhy] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadWhy() {
    if (why) {
      setWhy(null); // toggle closed
      return;
    }
    setLoading(true);
    try {
      const explanation = await AdaptiveDiagnosticApi.why(sessionId, skill.skillId);
      setWhy(explanation.narrative);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ borderBottom: '1px solid #f0e6d8', paddingBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15, color: '#2c2418' }}>{skill.skillLabel}</div>
          <div style={{ fontSize: 13, color: '#8a7a68' }}>{LABEL_COPY[skill.capabilityLabel] ?? skill.capabilityLabel}</div>
        </div>
        <button
          type="button"
          onClick={loadWhy}
          style={{ fontSize: 13, color: '#c98a4b', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
        >
          {loading ? '...' : why ? 'Hide' : 'Why?'}
        </button>
      </div>
      {why && <p style={{ fontSize: 13.5, color: '#4a3a2c', marginTop: 8, lineHeight: 1.5 }}>{why}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: '#8a7a68', marginBottom: 10 }}>{title}</h3>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p style={{ margin: 0, fontSize: 14, color: '#8a7a68', fontStyle: 'italic' }}>{text}</p>;
}
