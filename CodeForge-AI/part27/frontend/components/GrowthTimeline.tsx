'use client';

import type { GrowthEvent } from '@/types/growth-event.js';
import { cfTheme, trajectoryTone, toneColor } from '../lib/theme.js';
import { eventTypeLabel, formatDate, formatMonthYear, evidenceCountLabel } from '../lib/format.js';

export interface GrowthTimelineProps {
  events: GrowthEvent[];
  skillLabels?: Record<string, string>;
}

const POSITIVE_EVENTS = new Set(['SKILL_ACQUIRED', 'SKILL_IMPROVED', 'SKILL_MASTERED', 'SKILL_RECOVERED', 'TRANSFER_CONFIRMED', 'RETENTION_CONFIRMED', 'MILESTONE_REACHED', 'ROLE_READINESS_IMPROVED']);
const NEGATIVE_EVENTS = new Set(['SKILL_REGRESSED']);

function toneForEvent(eventType: string): 'positive' | 'neutral' | 'negative' {
  if (POSITIVE_EVENTS.has(eventType)) return 'positive';
  if (NEGATIVE_EVENTS.has(eventType)) return 'negative';
  return 'neutral';
}

/**
 * The Growth Timeline (section 38). A real chronological sequence, so —
 * unlike the categorical panels in GrowthDashboard — date-grouped
 * ordering genuinely carries information here and earns the structural
 * treatment. Every entry is a persisted GrowthEvent; nothing is
 * synthesized to fill out the visual (section 38: "do not create fake
 * events for visual appearance").
 */
export function GrowthTimeline({ events, skillLabels }: GrowthTimelineProps) {
  const sorted = [...events].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  if (sorted.length === 0) {
    return (
      <div style={{ background: cfTheme.color.graphite, padding: '28px 26px', borderRadius: 14, maxWidth: 640 }}>
        <p style={{ fontFamily: cfTheme.font.body, fontSize: 14, color: cfTheme.color.textMuted, fontStyle: 'italic' }}>
          No growth events yet. They will start appearing here once your activity produces enough evidence to confirm a real change.
        </p>
      </div>
    );
  }

  const groups: { month: string; items: GrowthEvent[] }[] = [];
  for (const event of sorted) {
    const month = formatMonthYear(event.timestamp);
    const lastGroup = groups.at(-1);
    if (lastGroup && lastGroup.month === month) lastGroup.items.push(event);
    else groups.push({ month, items: [event] });
  }

  return (
    <div style={{ background: cfTheme.color.graphite, padding: '28px 26px', borderRadius: 14, maxWidth: 640 }}>
      <span style={{ fontFamily: cfTheme.font.mono, fontSize: 12, color: cfTheme.color.temper, letterSpacing: 1.5, textTransform: 'uppercase' }}>Growth timeline</span>
      <h2 style={{ fontFamily: cfTheme.font.display, fontWeight: 700, fontSize: 28, color: cfTheme.color.textPrimary, margin: '6px 0 20px' }}>What actually changed</h2>

      {groups.map((group) => (
        <div key={group.month} style={{ marginBottom: 22 }}>
          <div style={{ fontFamily: cfTheme.font.mono, fontSize: 11.5, color: cfTheme.color.slag, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>{group.month}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingLeft: 4, borderLeft: `2px solid ${cfTheme.color.plateBorder}` }}>
            {group.items.map((event) => (
              <div key={event.eventId} style={{ marginLeft: -5, paddingLeft: 18, position: 'relative' }}>
                <span
                  style={{
                    position: 'absolute',
                    left: -5,
                    top: 5,
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: toneColor(toneForEvent(event.eventType)),
                  }}
                />
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: cfTheme.font.body, fontWeight: 600, fontSize: 14.5, color: cfTheme.color.textPrimary }}>{eventTypeLabel(event.eventType)}</span>
                  {event.skillId && (
                    <span style={{ fontFamily: cfTheme.font.mono, fontSize: 12, color: cfTheme.color.textMuted }}>{skillLabels?.[event.skillId] ?? event.skillId}</span>
                  )}
                  <span style={{ fontFamily: cfTheme.font.mono, fontSize: 11, color: cfTheme.color.slag, marginLeft: 'auto' }}>{formatDate(event.timestamp)}</span>
                </div>
                <p style={{ fontFamily: cfTheme.font.body, fontSize: 13.5, color: cfTheme.color.textMuted, margin: '3px 0 0' }}>{event.explanation}</p>
                <span style={{ fontFamily: cfTheme.font.mono, fontSize: 10.5, color: cfTheme.color.slag }}>{evidenceCountLabel(event.evidenceRefs.length)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default GrowthTimeline;
