import { useEffect, useState, useCallback } from 'react';
import type { CommandCenterView, TimelineEntry, NotNowReason } from '../types';
import type { CareerStrategyApi } from '../api/careerStrategyApi';
import { tokens, statusColor, statusLabel, tierColor } from '../tokens';
import { NextBestMoveCard } from './NextBestMoveCard';
import { BottleneckCard } from './BottleneckCard';
import { StrategyHealthCard } from './StrategyHealthCard';
import { MomentumCard } from './MomentumCard';
import { StrategyTimeline } from './StrategyTimeline';
import { ConstraintBanner } from './ConstraintBanner';
import { EmptyState, LowDataState } from './StatePlaceholders';
import { StrategyChangeConfirmationModal } from './StrategyChangeConfirmationModal';

export interface CareerCommandCenterProps {
  studentId: string;
  api: CareerStrategyApi;
}

/**
 * spec #45-46: CAREER COMMAND CENTER. Above the fold answers five questions
 * — where am I, where am I going, what's blocking me, what should I do now,
 * why — before anything else. Everything past the Next Best Move card is
 * supporting detail, not competing for the same attention (spec #67:
 * "do not bury the action under analytics").
 */
export function CareerCommandCenter({ studentId, api }: CareerCommandCenterProps) {
  const [view, setView] = useState<CommandCenterView | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingChange, setPendingChange] = useState<{ from: string; to: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cc, tl] = await Promise.all([api.getCommandCenter(studentId), api.getTimeline(studentId)]);
      setView(cc);
      setTimeline(tl.timeline);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load your strategy.');
    } finally {
      setLoading(false);
    }
  }, [api, studentId]);

  useEffect(() => { load(); }, [load]);

  const handleStart = () => {
    if (!view?.nextBestMove) return;
    if (view.nextBestMove.requiresConfirmation) {
      setPendingChange({ from: view.target, to: view.nextBestMove.title });
      return;
    }
    // Wire this to POST an accepted action via your action-creation route,
    // then reload. Left as a no-op call site here since action creation
    // wasn't in the spec's route list for this card specifically.
    load();
  };

  const handleNotNow = async (reason: NotNowReason) => {
    // Requires the action's id, which the current view doesn't carry on
    // NextBestMove directly — wire this once actions are created via your
    // action-creation route and the id is available to this component.
    void reason;
  };

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!view) return null;

  if (view.dataSufficiency === 'empty') {
    return <EmptyState />;
  }

  return (
    <div style={styles.page}>
      <header style={styles.statusBar}>
        <div>
          <div style={styles.eyebrow}>Career strategy</div>
          <h1 style={styles.targetHeading}>{view.target}</h1>
        </div>
        <div style={{ ...styles.statusPill, color: statusColor[view.strategyStatus], borderColor: `${statusColor[view.strategyStatus]}55` }}>
          {statusLabel[view.strategyStatus]}
        </div>
      </header>

      {view.dataSufficiency === 'low_data' && (
        <LowDataState missing={['More evidence, applications, or decisions need to be recorded before this can say much with confidence.']} />
      )}

      {/* spec #5: the five above-the-fold questions, at a glance */}
      <section style={styles.glanceGrid}>
        <GlanceStat label="Where you stand" value={view.currentPosition} />
        <GlanceStat label="Where you're headed" value={view.target} />
        <GlanceStat label="Biggest gap" value={view.biggestGap} />
        <GlanceStat label="Biggest opportunity" value={view.biggestOpportunity} />
        <GlanceStat label="Biggest risk" value={view.biggestRisk} />
      </section>

      <ConstraintBanner check={view.constraintCheck} />

      {view.nextBestMove && (
        <NextBestMoveCard move={view.nextBestMove} recommendation={view.recommendation} onStart={handleStart} onNotNow={handleNotNow} />
      )}

      <section style={styles.row3}>
        <BottleneckCard bottleneck={view.bottleneck} />
        <StrategyHealthCard health={view.strategyHealth} />
        <MomentumCard momentum={view.momentum} />
      </section>

      {view.focus.length > 0 && (
        <section style={styles.focusCard}>
          <div style={styles.eyebrow}>This week's focus</div>
          <div style={styles.focusRow}>
            {view.focus.map((f, i) => (
              <div key={i} style={styles.focusChip}>
                <span style={{ ...styles.focusDot, background: tierColor[f.tier] }} />
                {f.title}
              </div>
            ))}
          </div>
        </section>
      )}

      <StrategyTimeline entries={timeline} />

      {pendingChange && (
        <StrategyChangeConfirmationModal
          previousTargetRole={pendingChange.from}
          proposedTargetRole={pendingChange.to}
          reason="The next best move engine determined this represents a change in direction rather than a step within the current plan."
          onCancel={() => setPendingChange(null)}
          onConfirm={async (assumptions) => {
            await api.confirmStrategyChange(studentId, { newTargetRole: pendingChange.to, reason: 'Confirmed from Next Best Move', assumptions });
            setPendingChange(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function GlanceStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.glanceStat}>
      <div style={styles.glanceLabel}>{label}</div>
      <div style={styles.glanceValue}>{value}</div>
    </div>
  );
}

function LoadingState() {
  return (
    <div style={styles.centerPage}>
      <p style={{ color: tokens.color.inkMuted, fontFamily: tokens.font.body }}>Loading your strategy…</p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div style={styles.centerPage}>
      <p style={{ color: tokens.color.risk, fontFamily: tokens.font.body, marginBottom: 12 }}>{message}</p>
      <button
        type="button"
        onClick={onRetry}
        style={{ background: tokens.color.signal, color: '#fff', border: 'none', borderRadius: tokens.radius.sm, padding: '8px 16px', cursor: 'pointer' }}
      >
        Retry
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { display: 'flex', flexDirection: 'column', gap: 20, background: tokens.color.surface, padding: 24, fontFamily: tokens.font.body },
  centerPage: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 200 },
  statusBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  eyebrow: { fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: tokens.color.inkMuted },
  targetHeading: { fontSize: 24, fontWeight: 700, margin: '4px 0 0', color: tokens.color.ink },
  statusPill: { fontSize: 12, fontWeight: 600, border: '1px solid', borderRadius: 999, padding: '5px 12px', whiteSpace: 'nowrap' },
  glanceGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 },
  glanceStat: { background: tokens.color.card, border: `1px solid ${tokens.color.line}`, borderRadius: tokens.radius.md, padding: '12px 14px' },
  glanceLabel: { fontSize: 11, fontWeight: 600, color: tokens.color.inkMuted, textTransform: 'uppercase', letterSpacing: '0.03em' },
  glanceValue: { fontSize: 13, color: tokens.color.ink, marginTop: 4, lineHeight: 1.4 },
  row3: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 },
  focusCard: { background: tokens.color.card, border: `1px solid ${tokens.color.line}`, borderRadius: tokens.radius.lg, padding: 20 },
  focusRow: { display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  focusChip: {
    display: 'flex', alignItems: 'center', gap: 8, background: tokens.color.surface, border: `1px solid ${tokens.color.line}`,
    borderRadius: 999, padding: '7px 14px', fontSize: 13, color: tokens.color.ink,
  },
  focusDot: { width: 7, height: 7, borderRadius: 999, flexShrink: 0 },
};
