import { tokens } from '../tokens';

/** spec #64: EMPTY STATE — shown when no strategy exists yet. */
export function EmptyState({ onStart }: { onStart?: () => void }) {
  return (
    <section style={styles.card}>
      <div style={styles.eyebrow}>Career strategy</div>
      <h2 style={styles.title}>Build your first career strategy</h2>
      <p style={styles.body}>Tell us the target role you're working toward, and this starts tracking evidence, opportunities, and next moves against it.</p>
      <button type="button" style={styles.primaryButton} onClick={onStart}>Set a target role</button>
    </section>
  );
}

/** spec #65: LOW-DATA STATE — shown when there's a goal but not enough
 * recorded activity yet to say much with confidence. */
export function LowDataState({ missing }: { missing: string[] }) {
  return (
    <section style={styles.card}>
      <div style={styles.eyebrow}>Career strategy</div>
      <h2 style={styles.title}>We need more evidence</h2>
      <p style={styles.body}>There's a target role set, but not enough recorded activity yet to identify a reliable bottleneck or next move.</p>
      {missing.length > 0 && (
        <ul style={styles.list}>
          {missing.map((m, i) => (
            <li key={i} style={styles.listItem}>{m}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: { background: tokens.color.card, border: `1px solid ${tokens.color.line}`, borderRadius: tokens.radius.lg, padding: 32, textAlign: 'center', fontFamily: tokens.font.body, color: tokens.color.ink },
  eyebrow: { fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: tokens.color.inkMuted, marginBottom: 14 },
  title: { fontSize: 20, fontWeight: 650, margin: '0 0 10px' },
  body: { fontSize: 14, color: tokens.color.inkMuted, lineHeight: 1.6, maxWidth: 420, margin: '0 auto 20px' },
  primaryButton: { background: tokens.color.signal, color: '#fff', border: 'none', borderRadius: tokens.radius.sm, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  list: { textAlign: 'left', display: 'inline-block', margin: '0 auto', fontSize: 13, color: tokens.color.inkMuted, paddingLeft: 18 },
  listItem: { marginBottom: 4 },
};
