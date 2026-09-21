'use client';

import type { GrowthMilestone } from '@/types/milestone.js';
import { cfTheme } from '../lib/theme.js';
import { formatDate, confidenceLabel } from '../lib/format.js';

export interface MilestoneCardProps {
  milestones: GrowthMilestone[];
  skillLabels?: Record<string, string>;
}

/**
 * The Milestone Experience (section 29/39). Milestones get the one bright
 * "spark" accent in this whole design system, and only milestones —
 * everywhere else stays in the ember/temper pair, which is what makes
 * this treatment read as genuinely special rather than routine.
 */
export function MilestoneCard({ milestones, skillLabels }: MilestoneCardProps) {
  if (milestones.length === 0) {
    return (
      <p style={{ fontFamily: cfTheme.font.body, fontSize: 13.5, color: cfTheme.color.textMuted, fontStyle: 'italic' }}>
        {'No milestones yet — they appear here once there is real, confirmed evidence behind one.'}
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 6 }}>
      {[...milestones]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .map((m) => (
          <div
            key={m.milestoneId}
            style={{
              flex: '0 0 240px',
              background: cfTheme.color.plate,
              border: `1px solid ${cfTheme.color.spark}55`,
              borderRadius: 10,
              padding: '16px 18px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: cfTheme.color.spark }} />
              <span style={{ fontFamily: cfTheme.font.mono, fontSize: 10.5, color: cfTheme.color.spark, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                {formatDate(m.timestamp)}
              </span>
            </div>
            <h4 style={{ fontFamily: cfTheme.font.display, fontWeight: 600, fontSize: 16, color: cfTheme.color.textPrimary, margin: '0 0 6px' }}>{m.title}</h4>
            <p style={{ fontFamily: cfTheme.font.body, fontSize: 12.5, color: cfTheme.color.textMuted, margin: 0 }}>{m.description}</p>
            {m.skillId && (
              <p style={{ fontFamily: cfTheme.font.mono, fontSize: 10.5, color: cfTheme.color.slag, margin: '8px 0 0' }}>
                {`${skillLabels?.[m.skillId] ?? m.skillId} · ${confidenceLabel(m.confidence)}`}
              </p>
            )}
          </div>
        ))}
    </div>
  );
}

export default MilestoneCard;
