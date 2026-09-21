import type { Bottleneck } from '../types';
import { tokens, statusColor } from '../tokens';

const CATEGORY_LABEL: Record<string, string> = {
  insufficient_technical_evidence: 'Insufficient technical evidence',
  poor_interview_performance: 'Interviews aren\u2019t converting',
  weak_communication: 'Weak communication',
  insufficient_project_depth: 'Insufficient project depth',
  poor_positioning: 'Poor positioning',
  inadequate_opportunity_targeting: 'Opportunity targeting needs work',
  inconsistent_execution: 'Inconsistent execution',
  missing_experience: 'Missing experience',
  unclear_career_direction: 'Unclear career direction',
  insufficient_application_volume: 'Application volume is low',
  weak_preparation: 'Weak preparation',
  lack_of_portfolio_evidence: 'Lack of portfolio evidence',
};

export function BottleneckCard({ bottleneck }: { bottleneck: Bottleneck | null }) {
  if (!bottleneck) {
    return (
      <section style={styles.card}>
        <div style={styles.eyebrow}>What's blocking you</div>
        <p style={styles.emptyText}>No single blocker stands out with enough evidence right now — that's a reasonable place to be.</p>
      </section>
    );
  }

  const dotColor = bottleneck.severity === 'high' ? statusColor.shift_recommended : bottleneck.severity === 'medium' ? statusColor.needs_attention : statusColor.unknown;

  return (
    <section style={styles.card}>
      <div style={styles.eyebrow}>What's blocking you</div>
      <div style={styles.titleRow}>
        <span style={{ ...styles.dot, background: dotColor }} />
        <h3 style={styles.title}>{CATEGORY_LABEL[bottleneck.category] ?? bottleneck.category}</h3>
      </div>
      <p style={styles.description}>{bottleneck.description}</p>

      <Row label="Why it matters" value={bottleneck.whyItMatters} />
      {bottleneck.evidence.length > 0 && <Row label="Evidence" value={bottleneck.evidence.join(' · ')} />}
      <Row label="If ignored" value={bottleneck.whatHappensIfIgnored} />

      {bottleneck.cascade && (
        <div style={styles.cascade}>
          <div style={styles.cascadeLabel}>Investigated further</div>
          <div style={styles.cascadeText}>
            Checked: {bottleneck.cascade.investigated.join(', ')}.{' '}
            {bottleneck.cascade.refinedCause
              ? `Most likely cause: ${bottleneck.cascade.refinedCause.replace(/_/g, ' ')}.`
              : bottleneck.cascade.unknowns[0] ?? 'Not enough detail yet to narrow this further.'}
          </div>
        </div>
      )}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.row}>
      <div style={styles.rowLabel}>{label}</div>
      <div style={styles.rowValue}>{value}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: { background: tokens.color.card, border: `1px solid ${tokens.color.line}`, borderRadius: tokens.radius.lg, padding: 22, fontFamily: tokens.font.body, color: tokens.color.ink },
  eyebrow: { fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: tokens.color.inkMuted, marginBottom: 10 },
  titleRow: { display: 'flex', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 999, flexShrink: 0 },
  title: { fontSize: 16, fontWeight: 650, margin: 0 },
  description: { fontSize: 14, color: tokens.color.inkMuted, marginTop: 8, lineHeight: 1.5 },
  row: { display: 'flex', gap: 12, padding: '8px 0', fontSize: 13, borderTop: `1px solid ${tokens.color.line}` },
  rowLabel: { width: 100, flexShrink: 0, color: tokens.color.inkMuted, fontWeight: 600 },
  rowValue: { color: tokens.color.ink, lineHeight: 1.5 },
  cascade: { marginTop: 10, padding: 12, background: tokens.color.surface, borderRadius: tokens.radius.sm },
  cascadeLabel: { fontSize: 12, fontWeight: 600, color: tokens.color.inkMuted, marginBottom: 4 },
  cascadeText: { fontSize: 13, lineHeight: 1.5 },
  emptyText: { fontSize: 14, color: tokens.color.inkMuted, lineHeight: 1.5 },
};
