'use client';

import type { ReactNode } from 'react';
import type { GrowthProfile } from '@/api/handlers.js';
import { cfTheme, trajectoryTone, toneColor } from '../lib/theme.js';
import { skillStateLabel, trajectoryLabel, retentionLabel, transferLabel, confidenceLabel, evidenceCountLabel } from '../lib/format.js';

export interface InstructorGrowthViewProps {
  studentLabel: string;
  profile: GrowthProfile;
  skillLabels?: Record<string, string>;
}

/**
 * Instructor Dashboard (section 42, 80). Denser than the student view and
 * organized around the questions section 80 asks for directly: what
 * changed, what's the evidence, how reliable is it, what's the current
 * bottleneck. Nothing here reaches into evidence internals or hidden
 * scoring logic (section 67/98) — it reads the same GrowthProfile shape
 * the student-facing dashboard does, just laid out for someone deciding
 * where to intervene rather than someone tracking their own progress.
 *
 * Authorization is NOT this component's job — by the time a profile
 * reaches this component, src/api/handlers.ts has already verified the
 * caller is allowed to see it (assertAuthorized). Don't render this from
 * data you fetched without going through that check.
 */
export function InstructorGrowthView({ studentLabel, profile, skillLabels }: InstructorGrowthViewProps) {
  const label = (id: string) => skillLabels?.[id] ?? id;

  return (
    <div style={{ background: cfTheme.color.graphite, padding: '30px 28px', borderRadius: 14, maxWidth: 880 }}>
      <span style={{ fontFamily: cfTheme.font.mono, fontSize: 12, color: cfTheme.color.temper, letterSpacing: 1.5, textTransform: 'uppercase' }}>Instructor view</span>
      <h2 style={{ fontFamily: cfTheme.font.display, fontWeight: 700, fontSize: 30, color: cfTheme.color.textPrimary, margin: '6px 0 22px' }}>{studentLabel}</h2>

      <Section title="Where intervention could help">
        {profile.bottleneck === null ? (
          <Muted text="No single skill is clearly bottlenecking the rest right now." />
        ) : (
          <Row
            primary={label(profile.bottleneck.skillId)}
            secondary="Trailing otherwise-proficient skills by a meaningful margin — the highest-leverage place to focus next."
            tone="negative"
          />
        )}
        {profile.atRiskSkills.length > 0 && (
          <div style={{ marginTop: 10 }}>
            {profile.atRiskSkills.map((s) => (
              <Row key={s.skillId} primary={label(s.skillId)} secondary={`${skillStateLabel(s.state)} · ${retentionLabel(s.retention)} · ${evidenceCountLabel(s.evidenceCount)}`} tone="negative" />
            ))}
          </div>
        )}
      </Section>

      <Section title="Recent regressions and recoveries">
        {profile.recoveredSkillIds.length === 0 ? (
          <Muted text="No recorded recoveries yet." />
        ) : (
          profile.recoveredSkillIds.map((id) => <Row key={id} primary={label(id)} secondary="Recovered after a documented decline — see the growth timeline for the evidence trail." tone="positive" />)
        )}
      </Section>

      <Section title="Confirmed strengths">
        {profile.strengths.length === 0 ? (
          <Muted text="Nothing has enough corroborating evidence to call a confirmed strength yet." />
        ) : (
          profile.strengths.map((s) => (
            <Row
              key={s.skillId}
              primary={label(s.skillId)}
              secondary={`${skillStateLabel(s.state)} · ${transferLabel(s.transfer)} transfer · ${confidenceLabel(s.confidence.level)}`}
              tone="positive"
            />
          ))
        )}
      </Section>

      <Section title="Persistent growth areas">
        {profile.weaknesses.length === 0 ? (
          <Muted text="Nothing has shown a persistent, evidence-backed difficulty right now." />
        ) : (
          profile.weaknesses.map((s) => (
            <Row key={s.skillId} primary={label(s.skillId)} secondary={`${skillStateLabel(s.state)} · ${trajectoryLabel(s.trajectory)} · ${evidenceCountLabel(s.evidenceCount)}`} tone="negative" />
          ))
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 20, paddingBottom: 18, borderBottom: `1px solid ${cfTheme.color.plateBorder}` }}>
      <h4 style={{ fontFamily: cfTheme.font.display, fontWeight: 600, fontSize: 16, color: cfTheme.color.textPrimary, margin: '0 0 10px' }}>{title}</h4>
      {children}
    </div>
  );
}

function Muted({ text }: { text: string }) {
  return <p style={{ fontFamily: cfTheme.font.body, fontSize: 13, color: cfTheme.color.textMuted, fontStyle: 'italic', margin: 0 }}>{text}</p>;
}

function Row({ primary, secondary, tone }: { primary: string; secondary: string; tone: 'positive' | 'neutral' | 'negative' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '7px 0' }}>
      <span style={{ width: 7, height: 7, borderRadius: 999, background: toneColor(tone), marginTop: 6, flexShrink: 0 }} />
      <div>
        <div style={{ fontFamily: cfTheme.font.body, fontSize: 14.5, color: cfTheme.color.textPrimary, fontWeight: 600 }}>{primary}</div>
        <div style={{ fontFamily: cfTheme.font.body, fontSize: 12.5, color: cfTheme.color.textMuted }}>{secondary}</div>
      </div>
    </div>
  );
}

export default InstructorGrowthView;
