/**
 * CodeForge Growth Intelligence — design tokens.
 *
 * Design plan (frontend-design skill process):
 *
 * Subject: an evidence-backed technical-growth dashboard for programming
 * students inside CodeForge AI. Audience: students first, instructors
 * second (denser view). The page's one job: show what's actually changed
 * and how reliably, without ever inflating a thin signal into a
 * confident-sounding claim.
 *
 * Color (6 named hex): a workshop/forge world — "graphite" background and
 * an oxidized-steel-plate panel, with two accents that carry real meaning
 * rather than decoration: ember (warm) marks active/recent change,
 * temper (cool) marks stability and confidence. Deliberately not a
 * single-bright-accent-on-near-black treatment — which accent shows up
 * where is itself part of how the data reads, and the background is a
 * warm graphite rather than true near-black.
 *
 * Type: Big Shoulders for display (a condensed grotesk drawn from
 * industrial ironwork lettering — a real, specific match for "Forge"),
 * Source Sans 3 for body copy, IBM Plex Mono for anything that reads as
 * data rather than prose (evidence counts, timestamps, skill ids,
 * confidence). Not bundled here — wire them through your app's normal
 * font loading; the stacks below fall back gracefully without it.
 *
 * Signature: a "heat curve" — an SVG trajectory chart styled like the
 * temperature-over-time logs used in real heat-treatment, with evidence
 * points marked as tick strikes along the line and a horizontal
 * proficiency-threshold band. Lives only in SkillEvolutionView — every
 * other surface stays quiet and disciplined around it.
 */
export const cfTheme = {
  color: {
    graphite: '#1C1B1A',
    plate: '#26241F',
    plateBorder: '#3A362E',
    ember: '#E2703A',
    temper: '#6FA8B5',
    slag: '#8A8378',
    spark: '#F2C879',
    textPrimary: '#F3EFE7',
    textMuted: '#B8B0A2',
    negative: '#C4574B',
  },
  font: {
    display: '"Big Shoulders", "Arial Narrow", sans-serif',
    body: '"Source Sans 3", "Segoe UI", sans-serif',
    mono: '"IBM Plex Mono", "SFMono-Regular", Menlo, monospace',
  },
} as const;

export type TrajectoryTone = 'positive' | 'neutral' | 'negative';

export function trajectoryTone(trajectory: string): TrajectoryTone {
  if (trajectory === 'RAPIDLY_IMPROVING' || trajectory === 'IMPROVING' || trajectory === 'RECOVERING') return 'positive';
  if (trajectory === 'DECLINING' || trajectory === 'SLOWING') return 'negative';
  return 'neutral';
}

export function toneColor(tone: TrajectoryTone): string {
  if (tone === 'positive') return cfTheme.color.ember;
  if (tone === 'negative') return cfTheme.color.negative;
  return cfTheme.color.temper;
}
