import type { ConstraintCheckResult } from '../types';
import { tokens } from '../tokens';

/** spec #38-39: "PLAN DOES NOT FIT YOUR CURRENT CONSTRAINTS" /
 * "YOUR PLAN IS OVERLOADED". Renders nothing when the plan fits — this is
 * meant to appear only when it's true, not as permanent chrome. */
export function ConstraintBanner({ check }: { check: ConstraintCheckResult }) {
  if (check.ok) return null;

  return (
    <div role="status" style={styles.banner}>
      <div style={styles.title}>{check.overcommitted ? 'Your plan is overloaded' : 'This plan doesn\u2019t fit your current constraints'}</div>
      <ul style={styles.list}>
        {check.violations.map((v, i) => (
          <li key={i} style={styles.item}>{v}</li>
        ))}
      </ul>
      {check.availableHoursPerWeek != null && (
        <div style={styles.meta}>
          {check.plannedHoursPerWeek}h/week planned vs {check.availableHoursPerWeek}h/week available.
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  banner: {
    background: '#FBF2F0', border: `1px solid ${tokens.color.risk}40`, borderRadius: tokens.radius.md,
    padding: '14px 18px', fontFamily: tokens.font.body, color: tokens.color.ink,
  },
  title: { fontSize: 14, fontWeight: 650, color: tokens.color.risk },
  list: { margin: '8px 0 0', paddingLeft: 18, fontSize: 13, color: tokens.color.ink },
  item: { marginBottom: 3, lineHeight: 1.4 },
  meta: { fontSize: 12, color: tokens.color.inkMuted, marginTop: 8, fontFamily: tokens.font.mono },
};
