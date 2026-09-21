import React from 'react';
import { SignalTrace, toneForState } from './SignalTrace.js';
import './tokens.css';

export interface SkillSignalDTO {
  skillId: string;
  signal: number;
  confidence: number;
  state: string;
  trend: string;
  freshness: string;
  evidenceCount: number;
}

const STATE_LABEL: Record<string, string> = {
  UNKNOWN: 'Not yet seen',
  INTRODUCED: 'Introduced',
  DEVELOPING: 'Developing',
  PRACTICED: 'Practiced',
  PROFICIENT: 'Proficient',
  MASTERED: 'Strong',
  AT_RISK: 'Slipping',
  REGRESSING: 'Declining',
  UNCERTAIN: 'Not enough evidence yet',
};

const TREND_MARK: Record<string, string> = {
  IMPROVING: '↗ improving',
  STABLE: '→ steady',
  DECLINING: '↘ declining',
  VOLATILE: '↕ inconsistent',
  INSUFFICIENT_DATA: '',
};

function skillDisplayName(skillId: string): string {
  return skillId
    .split('_')
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(' ');
}

export function SkillProfileList({ skills, skillNames = {} }: { skills: SkillSignalDTO[]; skillNames?: Record<string, string> }) {
  if (skills.length === 0) {
    return (
      <div style={{ fontFamily: 'var(--sig-font-body)', color: 'var(--sig-ink-muted)', padding: '24px 4px' }}>
        No readings yet. This fills in as challenges, projects, and reviews produce evidence.
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'var(--sig-font-body)', color: 'var(--sig-ink)', background: 'var(--sig-paper)', padding: 4 }}>
      <div className="sig-eyebrow" style={{ marginBottom: 12 }}>
        Technical profile — {skills.length} skill{skills.length === 1 ? '' : 's'} tracked
      </div>
      <div>
        {skills.map((s) => {
          const tone = toneForState(s.state);
          return (
            <div
              key={s.skillId}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                alignItems: 'center',
                gap: 12,
                padding: '14px 2px',
                borderTop: '1px solid var(--sig-line)',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{skillNames[s.skillId] ?? skillDisplayName(s.skillId)}</span>
                  <span className="sig-eyebrow">{STATE_LABEL[s.state] ?? s.state}</span>
                  {TREND_MARK[s.trend] && (
                    <span className="sig-mono-value" style={{ fontSize: 11, color: 'var(--sig-ink-muted)' }}>
                      {TREND_MARK[s.trend]}
                    </span>
                  )}
                </div>
                <SignalTrace signal={s.signal} confidence={s.confidence} tone={tone} width={260} height={22} />
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="sig-mono-value" style={{ fontSize: 12, color: 'var(--sig-ink-muted)' }}>
                  {s.evidenceCount} demo{s.evidenceCount === 1 ? '' : 's'}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
