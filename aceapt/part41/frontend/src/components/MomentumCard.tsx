import type { Momentum } from '../types';
import { tokens } from '../tokens';

const TREND_META: Record<Momentum['trend'], { label: string; color: string; glyph: string }> = {
  improving: { label: 'Improving', color: tokens.color.good, glyph: '↗' },
  stable: { label: 'Stable', color: tokens.color.signal, glyph: '→' },
  declining: { label: 'Declining', color: tokens.color.risk, glyph: '↘' },
  unknown: { label: 'Not enough data', color: tokens.color.unknown, glyph: '·' },
};

/** spec #15-16: momentum from concrete drivers, not a streak counter. */
export function MomentumCard({ momentum }: { momentum: Momentum }) {
  const meta = TREND_META[momentum.trend];
  return (
    <section style={styles.card}>
      <div style={styles.eyebrow}>Momentum</div>
      <div style={styles.headerRow}>
        <span style={{ ...styles.glyph, color: meta.color }}>{meta.glyph}</span>
        <span style={{ ...styles.trendLabel, color: meta.color }}>{meta.label}</span>
      </div>
      {momentum.drivers.length > 0 && (
        <ul style={styles.driverList}>
          {momentum.drivers.map((d, i) => (
            <li key={i} style={styles.driverItem}>{d}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: { background: tokens.color.card, border: `1px solid ${tokens.color.line}`, borderRadius: tokens.radius.lg, padding: 22, fontFamily: tokens.font.body, color: tokens.color.ink },
  eyebrow: { fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: tokens.color.inkMuted, marginBottom: 10 },
  headerRow: { display: 'flex', alignItems: 'center', gap: 8 },
  glyph: { fontSize: 20, fontFamily: tokens.font.mono, lineHeight: 1 },
  trendLabel: { fontSize: 15, fontWeight: 650 },
  driverList: { margin: '12px 0 0', paddingLeft: 18, fontSize: 13, color: tokens.color.inkMuted },
  driverItem: { marginBottom: 4, lineHeight: 1.4 },
};
