import type { TimelineEntry } from '../types';
import { tokens } from '../tokens';

const KIND_LABEL: Record<TimelineEntry['kind'], string> = {
  strategy_created: 'Strategy created',
  strategy_version: 'Strategy updated',
  decision: 'Decision',
  action: 'Action',
  outcome: 'Outcome',
  experiment: 'Experiment',
  review: 'Weekly review',
  recommendation: 'Recommendation',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** spec #79: the Career Strategy Timeline — a flight-log style sequence,
 * intentionally the one place in this UI that uses numbered/sequential
 * visual treatment, since this is genuinely a sequence (spec #46's other
 * panels are not). */
export function StrategyTimeline({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) {
    return (
      <section style={styles.card}>
        <div style={styles.eyebrow}>Strategy timeline</div>
        <p style={styles.emptyText}>Nothing recorded yet — the timeline fills in as decisions, actions, and outcomes happen.</p>
      </section>
    );
  }

  return (
    <section style={styles.card}>
      <div style={styles.eyebrow}>Strategy timeline</div>
      <ol style={styles.list}>
        {entries.map((e, i) => (
          <li key={i} style={styles.item}>
            <div style={styles.rail}>
              <span style={styles.railDot} />
              {i < entries.length - 1 && <span style={styles.railLine} />}
            </div>
            <div style={styles.content}>
              <div style={styles.itemHeader}>
                <span style={styles.kind}>{KIND_LABEL[e.kind]}</span>
                <span style={styles.date}>{formatDate(e.at)}</span>
              </div>
              <div style={styles.label}>{e.label}</div>
              {e.detail && <div style={styles.detail}>{e.detail}</div>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: { background: tokens.color.card, border: `1px solid ${tokens.color.line}`, borderRadius: tokens.radius.lg, padding: 22, fontFamily: tokens.font.body, color: tokens.color.ink },
  eyebrow: { fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: tokens.color.inkMuted, marginBottom: 16 },
  list: { listStyle: 'none', margin: 0, padding: 0 },
  item: { display: 'flex', gap: 14 },
  rail: { display: 'flex', flexDirection: 'column', alignItems: 'center', width: 10 },
  railDot: { width: 8, height: 8, borderRadius: 999, background: tokens.color.signal, flexShrink: 0, marginTop: 4 },
  railLine: { flex: 1, width: 1, background: tokens.color.line, minHeight: 24 },
  content: { paddingBottom: 18, flex: 1, minWidth: 0 },
  itemHeader: { display: 'flex', justifyContent: 'space-between', gap: 10 },
  kind: { fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: tokens.color.signal },
  date: { fontSize: 11, fontFamily: tokens.font.mono, color: tokens.color.inkMuted },
  label: { fontSize: 14, fontWeight: 600, marginTop: 3 },
  detail: { fontSize: 13, color: tokens.color.inkMuted, marginTop: 2, lineHeight: 1.4 },
  emptyText: { fontSize: 14, color: tokens.color.inkMuted, lineHeight: 1.5 },
};
