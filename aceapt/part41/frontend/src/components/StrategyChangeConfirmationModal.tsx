import { useState } from 'react';
import { tokens } from '../tokens';

export interface StrategyChangeConfirmationModalProps {
  previousTargetRole: string;
  proposedTargetRole: string;
  reason: string;
  evidence?: string[];
  tradeoffs?: string[];
  switchingCost?: string;
  unknowns?: string[];
  onConfirm: (assumptions: string[]) => void;
  onCancel: () => void;
}

/**
 * spec #78: STRATEGY CHANGE CONFIRMATION. This is the ONLY UI path that
 * should lead to calling confirmStrategyChange() in the API client — never
 * trigger it automatically from a recommendation (spec #77: "REQUIRE
 * STUDENT CONFIRMATION").
 */
export function StrategyChangeConfirmationModal({
  previousTargetRole, proposedTargetRole, reason, evidence = [], tradeoffs = [], switchingCost, unknowns = [], onConfirm, onCancel,
}: StrategyChangeConfirmationModalProps) {
  const [assumption, setAssumption] = useState('');

  return (
    <div style={styles.overlay} role="dialog" aria-modal="true" aria-label="Confirm strategy change">
      <div style={styles.modal}>
        <div style={styles.eyebrow}>Strategy change</div>
        <div style={styles.compareRow}>
          <div style={styles.compareCol}>
            <div style={styles.compareLabel}>Current</div>
            <div style={styles.compareValue}>{previousTargetRole}</div>
          </div>
          <div style={styles.arrow}>→</div>
          <div style={styles.compareCol}>
            <div style={styles.compareLabel}>Proposed</div>
            <div style={{ ...styles.compareValue, color: tokens.color.signal }}>{proposedTargetRole}</div>
          </div>
        </div>

        <Section title="Why this change is being considered" body={reason} />
        {evidence.length > 0 && <Section title="Evidence" list={evidence} />}
        {tradeoffs.length > 0 && <Section title="Tradeoffs" list={tradeoffs} />}
        {switchingCost && <Section title="Switching cost" body={switchingCost} />}
        {unknowns.length > 0 && <Section title="Unknowns" list={unknowns} />}

        <label style={styles.label}>
          Anything else worth recording about this decision? (optional)
          <textarea
            style={styles.textarea}
            value={assumption}
            onChange={(e) => setAssumption(e.target.value)}
            placeholder="e.g. what would need to be true for this to be the right call"
          />
        </label>

        <div style={styles.actions}>
          <button type="button" style={styles.secondaryButton} onClick={onCancel}>Cancel</button>
          <button type="button" style={styles.primaryButton} onClick={() => onConfirm(assumption ? [assumption] : [])}>
            Confirm strategy change
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, body, list }: { title: string; body?: string; list?: string[] }) {
  return (
    <div style={styles.section}>
      <div style={styles.sectionTitle}>{title}</div>
      {body && <p style={styles.sectionBody}>{body}</p>}
      {list && (
        <ul style={styles.sectionList}>
          {list.map((item, i) => <li key={i}>{item}</li>)}
        </ul>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(18,22,28,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 1000 },
  modal: { background: tokens.color.card, borderRadius: tokens.radius.lg, padding: 28, maxWidth: 480, width: '100%', maxHeight: '85vh', overflowY: 'auto', fontFamily: tokens.font.body, color: tokens.color.ink },
  eyebrow: { fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: tokens.color.inkMuted, marginBottom: 16 },
  compareRow: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 },
  compareCol: { flex: 1 },
  compareLabel: { fontSize: 11, color: tokens.color.inkMuted, fontWeight: 600, textTransform: 'uppercase' },
  compareValue: { fontSize: 16, fontWeight: 650, marginTop: 2 },
  arrow: { color: tokens.color.inkMuted, fontSize: 18 },
  section: { marginBottom: 14, paddingTop: 14, borderTop: `1px solid ${tokens.color.line}` },
  sectionTitle: { fontSize: 12, fontWeight: 650, color: tokens.color.inkMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.03em' },
  sectionBody: { fontSize: 14, lineHeight: 1.5, margin: 0 },
  sectionList: { margin: '4px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.6 },
  label: { display: 'block', fontSize: 13, color: tokens.color.inkMuted, fontWeight: 600, marginTop: 10 },
  textarea: {
    display: 'block', width: '100%', marginTop: 6, padding: 10, fontFamily: tokens.font.body, fontSize: 13,
    border: `1px solid ${tokens.color.line}`, borderRadius: tokens.radius.sm, minHeight: 60, resize: 'vertical', boxSizing: 'border-box',
  },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 },
  secondaryButton: { background: 'transparent', border: `1px solid ${tokens.color.line}`, borderRadius: tokens.radius.sm, padding: '9px 16px', fontSize: 14, fontWeight: 600, color: tokens.color.ink, cursor: 'pointer' },
  primaryButton: { background: tokens.color.signal, color: '#fff', border: 'none', borderRadius: tokens.radius.sm, padding: '9px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
};
