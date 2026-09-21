'use client';

import type { SkillState } from '@/types/skill-state.js';
import { cfTheme, trajectoryTone, toneColor } from '../lib/theme.js';
import { skillStateLabel, trajectoryLabel, transferLabel, retentionLabel, confidenceLabel, formatDate, evidenceCountLabel } from '../lib/format.js';

export interface SkillEvolutionViewProps {
  skillId: string;
  skillLabel?: string;
  /** Chronological snapshot history for this one skill — see getSkillHistory(). */
  history: SkillState[];
}

const PROFICIENCY_BAND_Y = 0.72; // growthRules.proficientThreshold — mirrored here only for the reference band, never recomputed

/**
 * The "heat curve" — this package's one signature visual (see
 * frontend/lib/theme.ts for the design rationale). Plots performanceScore
 * across a skill's real historical snapshots, in the visual language of
 * an industrial heat-treatment log: a reference band for the proficiency
 * threshold, and a tick mark for every snapshot's evidence count. Renders
 * nothing invented — a skill with only one or two snapshots just gets a
 * short, honest curve rather than a padded-out fake one.
 */
function HeatCurve({ history }: { history: SkillState[] }) {
  const points = history.filter((s) => s.performanceScore !== null);
  const width = 640;
  const height = 180;
  const padX = 28;
  const padY = 20;

  if (points.length < 2) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: cfTheme.font.body, fontSize: 13, color: cfTheme.color.textMuted, fontStyle: 'italic' }}>
          {'Not enough snapshots yet to chart a trend — check back after a few more verified activities.'}
        </span>
      </div>
    );
  }

  const xFor = (i: number) => padX + (i / (points.length - 1)) * (width - padX * 2);
  const yFor = (score: number) => height - padY - score * (height - padY * 2);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(1)} ${yFor(p.performanceScore ?? 0).toFixed(1)}`).join(' ');
  const bandY = yFor(PROFICIENCY_BAND_Y);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label="Skill trajectory over time">
      <line x1={padX} x2={width - padX} y1={bandY} y2={bandY} stroke={cfTheme.color.temper} strokeOpacity={0.35} strokeDasharray="4 5" strokeWidth={1} />
      <text x={width - padX} y={bandY - 6} textAnchor="end" fontFamily={cfTheme.font.mono} fontSize={10} fill={cfTheme.color.temper} opacity={0.7}>
        proficiency threshold
      </text>

      <path d={path} fill="none" stroke={cfTheme.color.ember} strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" />

      {points.map((p, i) => (
        <g key={p.computedAt + i}>
          <line x1={xFor(i)} x2={xFor(i)} y1={yFor(p.performanceScore ?? 0) - 5} y2={yFor(p.performanceScore ?? 0) + 5} stroke={cfTheme.color.spark} strokeWidth={1.5} />
          <circle cx={xFor(i)} cy={yFor(p.performanceScore ?? 0)} r={3} fill={cfTheme.color.graphite} stroke={cfTheme.color.ember} strokeWidth={1.5} />
        </g>
      ))}
    </svg>
  );
}

export function SkillEvolutionView({ skillId, skillLabel, history }: SkillEvolutionViewProps) {
  const current = history.at(-1) ?? null;
  const tone = current ? trajectoryTone(current.trajectory) : 'neutral';

  return (
    <div style={{ background: cfTheme.color.graphite, padding: '28px 26px', borderRadius: 14, maxWidth: 760 }}>
      <span style={{ fontFamily: cfTheme.font.mono, fontSize: 12, color: cfTheme.color.temper, letterSpacing: 1.5, textTransform: 'uppercase' }}>Skill evolution</span>
      <h2 style={{ fontFamily: cfTheme.font.display, fontWeight: 700, fontSize: 30, color: cfTheme.color.textPrimary, margin: '6px 0 18px' }}>{skillLabel ?? skillId}</h2>

      <div style={{ background: cfTheme.color.plate, border: `1px solid ${cfTheme.color.plateBorder}`, borderRadius: 10, padding: '18px 20px 8px', marginBottom: 18 }}>
        <HeatCurve history={history} />
      </div>

      {current && (
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', marginBottom: 22 }}>
          <Stat label="Current" value={skillStateLabel(current.state)} color={toneColor(tone)} />
          <Stat label="Trajectory" value={trajectoryLabel(current.trajectory)} color={toneColor(tone)} />
          <Stat label="Transfer" value={transferLabel(current.transfer)} />
          <Stat label="Retention" value={retentionLabel(current.retention)} />
          <Stat label="Confidence" value={`${confidenceLabel(current.confidence.level)} (${evidenceCountLabel(current.evidenceCount)})`} />
        </div>
      )}

      <h4 style={{ fontFamily: cfTheme.font.display, fontWeight: 600, fontSize: 16, color: cfTheme.color.textPrimary, margin: '0 0 10px' }}>How it got here</h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {history.map((s, i) => (
          <div key={s.computedAt + i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: i < history.length - 1 ? `1px solid ${cfTheme.color.plateBorder}` : 'none' }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: toneColor(trajectoryTone(s.trajectory)), flexShrink: 0 }} />
            <span style={{ fontFamily: cfTheme.font.mono, fontSize: 11.5, color: cfTheme.color.textMuted, width: 92, flexShrink: 0 }}>{formatDate(s.computedAt)}</span>
            <span style={{ fontFamily: cfTheme.font.body, fontSize: 14, color: cfTheme.color.textPrimary }}>{skillStateLabel(s.state)}</span>
            <span style={{ fontFamily: cfTheme.font.body, fontSize: 12.5, color: cfTheme.color.textMuted, marginLeft: 'auto' }}>{evidenceCountLabel(s.evidenceCount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontFamily: cfTheme.font.mono, fontSize: 10.5, color: cfTheme.color.slag, textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</span>
      <span style={{ fontFamily: cfTheme.font.body, fontSize: 14.5, color: color ?? cfTheme.color.textPrimary, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

export default SkillEvolutionView;
