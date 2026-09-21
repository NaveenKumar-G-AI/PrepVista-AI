import type { StrategyHealth } from '../types';
import { tokens, statusColor, statusLabel } from '../tokens';

const DIMENSION_LABEL = {
  direction: 'Direction',
  readiness: 'Readiness',
  evidence: 'Evidence',
  opportunity: 'Opportunity',
  execution: 'Execution',
  adaptation: 'Adaptation',
} as const;

/** spec #11-12: six dimensions shown distinctly — deliberately not
 * collapsed into a single number. */
export function StrategyHealthCard({ health }: { health: StrategyHealth }) {
  const dims: (keyof typeof DIMENSION_LABEL)[] = ['direction', 'readiness', 'evidence', 'opportunity', 'execution', 'adaptation'];

  return (
    <section style={styles.card}>
      <div style={styles.headerRow}>
        <div style={styles.eyebrow}>Strategy health</div>
        <div style={{ ...styles.statusPill, color: statusColor[health.overallStatus], borderColor: `${statusColor[health.overallStatus]}55` }}>
          {statusLabel[health.overallStatus]}
        </div>
      </div>
      <p style={styles.overallExplanation}>{health.overallExplanation}</p>

      <div style={styles.grid}>
        {dims.map((key) => {
          const dim = health[key];
          return (
            <div key={key} style={styles.cell} title={dim.explanation}>
              <span style={{ ...styles.cellDot, background: statusColor[dim.status] }} />
              <div>
                <div style={styles.cellLabel}>{DIMENSION_LABEL[key]}</div>
                <div style={styles.cellStatus}>{statusLabel[dim.status]}</div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: { background: tokens.color.card, border: `1px solid ${tokens.color.line}`, borderRadius: tokens.radius.lg, padding: 22, fontFamily: tokens.font.body, color: tokens.color.ink },
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: tokens.color.inkMuted },
  statusPill: { fontSize: 12, fontWeight: 600, border: '1px solid', borderRadius: 999, padding: '3px 10px' },
  overallExplanation: { fontSize: 13, color: tokens.color.inkMuted, marginTop: 8, marginBottom: 16, lineHeight: 1.5 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px 10px' },
  cell: { display: 'flex', alignItems: 'flex-start', gap: 8 },
  cellDot: { width: 8, height: 8, borderRadius: 999, marginTop: 5, flexShrink: 0 },
  cellLabel: { fontSize: 12, color: tokens.color.inkMuted, fontWeight: 600 },
  cellStatus: { fontSize: 13, fontWeight: 600, marginTop: 1 },
};
