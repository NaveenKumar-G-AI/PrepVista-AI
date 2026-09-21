'use client';

import type { ReactNode } from 'react';
import type { GrowthProfile } from '@/api/handlers.js';
import { cfTheme, trajectoryTone, toneColor } from '../lib/theme.js';
import { skillStateLabel, trajectoryLabel, transferLabel, retentionLabel, confidenceLabel, evidenceCountLabel } from '../lib/format.js';

export interface GrowthDashboardProps {
  profile: GrowthProfile;
  /** Optional skillId -> display name map. Falls back to the raw skillId when a label is missing. */
  skillLabels?: Record<string, string>;
  studentFirstName?: string;
}

function labelFor(skillId: string, skillLabels?: Record<string, string>): string {
  return skillLabels?.[skillId] ?? skillId;
}

function Panel({ title, subtitle, children, accent }: { title: string; subtitle?: string; children: ReactNode; accent?: string }) {
  return (
    <div
      style={{
        background: cfTheme.color.plate,
        border: `1px solid ${cfTheme.color.plateBorder}`,
        borderRadius: 10,
        padding: '20px 22px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
        <h3 style={{ fontFamily: cfTheme.font.display, fontWeight: 600, fontSize: 20, letterSpacing: 0.2, color: cfTheme.color.textPrimary, margin: 0 }}>{title}</h3>
        {accent && (
          <span style={{ fontFamily: cfTheme.font.mono, fontSize: 12, color: accent, textTransform: 'uppercase', letterSpacing: 1 }}>{accent}</span>
        )}
      </div>
      {subtitle && <p style={{ fontFamily: cfTheme.font.body, fontSize: 13, color: cfTheme.color.textMuted, margin: '0 0 14px' }}>{subtitle}</p>}
      <div style={{ marginTop: subtitle ? 0 : 10 }}>{children}</div>
    </div>
  );
}

function SkillChip({ skillId, sublabel, tone, skillLabels }: { skillId: string; sublabel: string; tone: 'positive' | 'neutral' | 'negative'; skillLabels?: Record<string, string> }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${cfTheme.color.plateBorder}` }}>
      <span style={{ width: 7, height: 7, borderRadius: 999, background: toneColor(tone), flexShrink: 0 }} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontFamily: cfTheme.font.body, fontSize: 14.5, color: cfTheme.color.textPrimary }}>{labelFor(skillId, skillLabels)}</span>
        <span style={{ fontFamily: cfTheme.font.mono, fontSize: 11.5, color: cfTheme.color.textMuted }}>{sublabel}</span>
      </div>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <p style={{ fontFamily: cfTheme.font.body, fontSize: 13.5, color: cfTheme.color.textMuted, fontStyle: 'italic', margin: 0 }}>{text}</p>;
}

/**
 * The Student Growth Dashboard (section 37) + Growth Card (section 72).
 * Every number and label here traces back to profile fields the backend
 * computed from evidence — there is no client-side scoring or synthetic
 * fallback data. When a category is empty, it says so plainly (section
 * 98/99) instead of hiding the section or inventing a placeholder.
 */
export function GrowthDashboard({ profile, skillLabels, studentFirstName }: GrowthDashboardProps) {
  const hasAnySignal =
    profile.strengths.length > 0 ||
    profile.weaknesses.length > 0 ||
    profile.improvingSkills.length > 0 ||
    profile.stableSkills.length > 0 ||
    profile.bottleneck !== null;

  return (
    <div style={{ background: cfTheme.color.graphite, padding: '32px 28px', borderRadius: 14, maxWidth: 920 }}>
      <div style={{ marginBottom: 26 }}>
        <span style={{ fontFamily: cfTheme.font.mono, fontSize: 12, color: cfTheme.color.temper, letterSpacing: 1.5, textTransform: 'uppercase' }}>Technical growth</span>
        <h2 style={{ fontFamily: cfTheme.font.display, fontWeight: 700, fontSize: 34, color: cfTheme.color.textPrimary, margin: '6px 0 0', letterSpacing: 0.3 }}>
          {studentFirstName ? `${studentFirstName}’s growth profile` : 'Growth profile'}
        </h2>
      </div>

      {!hasAnySignal ? (
        <Panel title="Getting started">
          <EmptyRow text="Your growth profile is still being established. Complete a few more verified activities to build a reliable technical baseline." />
        </Panel>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          <Panel title="Strongest skills" subtitle="Consistently strong, and holding up outside familiar problems.">
            {profile.strengths.length === 0 ? (
              <EmptyRow text="No skill has enough corroborating evidence to call a strength yet." />
            ) : (
              profile.strengths.map((s) => (
                <SkillChip key={s.skillId} skillId={s.skillId} sublabel={`${skillStateLabel(s.state)} · ${transferLabel(s.transfer)}`} tone="positive" skillLabels={skillLabels} />
              ))
            )}
          </Panel>

          <Panel title="Growth areas" subtitle="Where the evidence shows real, repeated difficulty.">
            {profile.weaknesses.length === 0 ? (
              <EmptyRow text="Nothing has shown a persistent, evidence-backed difficulty right now." />
            ) : (
              profile.weaknesses.map((s) => (
                <SkillChip key={s.skillId} skillId={s.skillId} sublabel={`${skillStateLabel(s.state)} · ${evidenceCountLabel(s.evidenceCount)}`} tone="negative" skillLabels={skillLabels} />
              ))
            )}
          </Panel>

          <Panel title="Improving now" subtitle="Trending up across recent activity.">
            {profile.improvingSkills.length === 0 ? (
              <EmptyRow text="Nothing is showing a clear upward trend this window." />
            ) : (
              profile.improvingSkills.map((s) => (
                <SkillChip key={s.skillId} skillId={s.skillId} sublabel={trajectoryLabel(s.trajectory)} tone="positive" skillLabels={skillLabels} />
              ))
            )}
          </Panel>

          <Panel title="Bottleneck" accent={cfTheme.color.ember} subtitle="The one thing most limiting further progress right now.">
            {profile.bottleneck === null ? (
              <EmptyRow text="No single skill is clearly holding back the others yet." />
            ) : (
              <SkillChip skillId={profile.bottleneck.skillId} sublabel="Trailing your otherwise-proficient skills" tone="negative" skillLabels={skillLabels} />
            )}
          </Panel>

          {profile.atRiskSkills.length > 0 && (
            <Panel title="At risk" accent={cfTheme.color.negative} subtitle="Evidence suggests these need attention soon.">
              {profile.atRiskSkills.map((s) => (
                <SkillChip key={s.skillId} skillId={s.skillId} sublabel={`${skillStateLabel(s.state)} · ${retentionLabel(s.retention)}`} tone="negative" skillLabels={skillLabels} />
              ))}
            </Panel>
          )}

          <Panel title="Transfer" subtitle="Skills proven to work outside the problems they were learned on.">
            {profile.transferStrongSkillIds.length === 0 ? (
              <EmptyRow text="No skill has confirmed strong transfer yet." />
            ) : (
              profile.transferStrongSkillIds.map((id) => <SkillChip key={id} skillId={id} sublabel="Strong transfer" tone="positive" skillLabels={skillLabels} />)
            )}
          </Panel>

          <Panel title="Retention" subtitle="Skills that stayed available after a gap in practice.">
            {profile.retentionStableSkillIds.length === 0 ? (
              <EmptyRow text="Not enough time has passed to judge retention yet." />
            ) : (
              profile.retentionStableSkillIds.map((id) => <SkillChip key={id} skillId={id} sublabel="Retained" tone="positive" skillLabels={skillLabels} />)
            )}
          </Panel>
        </div>
      )}

      {profile.recentMilestones.length > 0 && (
        <div style={{ marginTop: 22, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {profile.recentMilestones.map((m) => (
            <span
              key={m.milestoneId}
              style={{
                fontFamily: cfTheme.font.mono,
                fontSize: 12,
                color: cfTheme.color.graphite,
                background: cfTheme.color.spark,
                padding: '6px 12px',
                borderRadius: 999,
              }}
              title={`${m.description} (${confidenceLabel(m.confidence)})`}
            >
              {m.title}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default GrowthDashboard;
