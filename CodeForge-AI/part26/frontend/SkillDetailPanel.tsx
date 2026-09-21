import React from 'react';
import { SignalTrace, toneForState } from './SignalTrace.js';
import './tokens.css';

export interface SkillSignalDetailDTO {
  skillId: string;
  signal: number;
  confidence: number;
  state: string;
  trend: string;
  freshness: string;
  evidenceCount: number;
  diversity: number;
  transferConfidence: number;
  retention: number | null;
  contradiction: boolean;
  lastDemonstratedAt: string | null;
  updatedAt: string;
}

export interface SkillExplanationDTO {
  summary: string;
  evidenceHighlights: string[];
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function SpecRow({ label, value, flag }: { label: string; value: string; flag?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 2px', borderTop: '1px solid var(--sig-line)' }}>
      <span style={{ fontSize: 13, color: 'var(--sig-ink-muted)' }}>{label}</span>
      <span className="sig-mono-value" style={{ fontSize: 13, color: flag ? 'var(--sig-uncertain)' : 'var(--sig-ink)' }}>
        {value}
      </span>
    </div>
  );
}

export function SkillDetailPanel({
  skillName,
  signal,
  explanation,
}: {
  skillName: string;
  signal: SkillSignalDetailDTO;
  explanation?: SkillExplanationDTO;
}) {
  const tone = toneForState(signal.state);

  return (
    <div
      style={{
        fontFamily: 'var(--sig-font-body)',
        color: 'var(--sig-ink)',
        background: 'var(--sig-paper-raised)',
        border: '1px solid var(--sig-line)',
        maxWidth: 480,
      }}
    >
      <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--sig-line)' }}>
        <div className="sig-eyebrow">Skill reading</div>
        <div style={{ fontSize: 20, fontWeight: 600, marginTop: 2 }}>{skillName}</div>
      </div>

      <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--sig-line)' }}>
        <SignalTrace signal={signal.signal} confidence={signal.confidence} tone={tone} width={420} height={40} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
          <span className="sig-mono-value" style={{ fontSize: 12, color: 'var(--sig-ink-muted)' }}>
            signal {pct(signal.signal)}
          </span>
          <span className="sig-mono-value" style={{ fontSize: 12, color: 'var(--sig-ink-muted)' }}>
            confidence {pct(signal.confidence)}
          </span>
        </div>
      </div>

      <div style={{ padding: '4px 20px 4px' }}>
        <SpecRow label="State" value={signal.state} />
        <SpecRow label="Trend" value={signal.trend} flag={signal.trend === 'VOLATILE' || signal.trend === 'DECLINING'} />
        <SpecRow label="Freshness" value={signal.freshness} flag={signal.freshness === 'STALE' || signal.freshness === 'VERY_STALE'} />
        <SpecRow label="Evidence count" value={String(signal.evidenceCount)} />
        <SpecRow label="Evidence diversity" value={pct(signal.diversity)} />
        <SpecRow label="Transfer confidence" value={pct(signal.transferConfidence)} flag={signal.transferConfidence < 0.4} />
        <SpecRow label="Retention" value={signal.retention === null ? 'not yet checked' : pct(signal.retention)} flag={signal.retention !== null && signal.retention < 0.5} />
        {signal.contradiction && <SpecRow label="Note" value="recent evidence conflicts with history" flag />}
      </div>

      {explanation && (
        <div style={{ padding: '16px 20px 20px', borderTop: '1px solid var(--sig-line)' }}>
          <div className="sig-eyebrow" style={{ marginBottom: 8 }}>
            Why CodeForge reads it this way
          </div>
          <p style={{ fontSize: 13.5, lineHeight: 1.55, margin: 0, borderLeft: `2px solid var(--sig-trace-accent)`, paddingLeft: 12 }}>{explanation.summary}</p>
          {explanation.evidenceHighlights.length > 0 && (
            <ul style={{ margin: '10px 0 0', paddingLeft: 16, fontSize: 12.5, color: 'var(--sig-ink-muted)', lineHeight: 1.7 }}>
              {explanation.evidenceHighlights.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
