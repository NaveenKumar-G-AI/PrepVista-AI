import { DifficultyGauge } from './DifficultyGauge.js';
import type { AdminSnapshot, HistoryEntry } from '../lib/api.js';

function fmtPct(v: string | null): string {
  if (v === null) return '—';
  return `${(Number(v) * 100).toFixed(1)}%`;
}

function fmtMs(v: number | null): string {
  if (v === null) return '—';
  return v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${v}ms`;
}

const STATUS_COLOR: Record<string, string> = {
  CALIBRATED: '#3D6B63',
  PROVISIONAL: '#A67C1E',
  STALE: '#8C6A3F',
  NEEDS_REVIEW: '#9C4A3C',
};

function Field({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between border-b border-grid py-2 text-sm">
      <span className="text-ink-soft">{label}</span>
      <span className={mono ? 'font-mono tabular-nums text-ink' : 'text-ink'}>{value}</span>
    </div>
  );
}

/**
 * §119-121, §125: the admin "calibration certificate" for one question
 * version — initial estimate, empirical evidence, and what's changed and
 * why, in one place. History/evidence live inline here rather than as
 * separate components (a deliberate scope call for this reference build —
 * see README) since they're read together in practice.
 */
export function QuestionDifficultyDetail({
  snapshot,
  history,
  onRecalibrate,
}: {
  snapshot: AdminSnapshot;
  history: HistoryEntry[];
  onRecalibrate?: () => void;
}) {
  const facility = snapshot.facility === null ? null : Number(snapshot.facility);
  const position = facility === null ? 0.5 : 1 - facility;
  const bandLow = snapshot.ci_high === null ? undefined : 1 - Number(snapshot.ci_high);
  const bandHigh = snapshot.ci_low === null ? undefined : 1 - Number(snapshot.ci_low);

  return (
    <div className="overflow-hidden rounded border border-grid bg-panel">
      <div className="flex items-start justify-between gap-4 border-b border-grid px-5 py-4">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-wide text-ink-soft">
            Question version {snapshot.question_version_id.slice(0, 8)}
          </div>
          <h2 className="font-display text-xl text-ink">{snapshot.category ?? 'Not yet categorized'}</h2>
        </div>
        <span
          className="rounded-full border px-2.5 py-1 text-xs font-medium"
          style={{ color: STATUS_COLOR[snapshot.status], borderColor: STATUS_COLOR[snapshot.status] }}
        >
          {snapshot.status.replace('_', ' ').toLowerCase()}
        </span>
      </div>

      {snapshot.label_mismatch && (
        <div className="border-b border-grid bg-rust-light px-5 py-3 text-sm text-rust">
          Labeled <strong>{snapshot.initial_category?.toLowerCase()}</strong> at authoring time, but empirical
          performance places it in <strong>{snapshot.category?.toLowerCase()}</strong>. Review validity, prerequisite
          dependencies, and question structure before relabeling (§32-33).
        </div>
      )}

      <div className="grid gap-6 px-5 py-5 sm:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center gap-2">
          <DifficultyGauge position={position} bandLow={bandLow} bandHigh={bandHigh} category={snapshot.category} size={160} />
          <span className="font-mono text-xs text-ink-soft">
            {facility === null ? 'no evidence yet' : `facility ${fmtPct(snapshot.facility)}`}
          </span>
        </div>

        <div>
          <Field label="Initial estimate" value={snapshot.initial_category ?? '—'} mono={false} />
          <Field label="Empirical category" value={snapshot.category ?? '—'} mono={false} />
          <Field label="Sample size" value={String(snapshot.sample_size)} />
          <Field
            label="95% interval"
            value={snapshot.ci_low && snapshot.ci_high ? `${fmtPct(snapshot.ci_low)} – ${fmtPct(snapshot.ci_high)}` : '—'}
          />
          <Field label="Confidence" value={snapshot.confidence} />
          <Field label="Median time" value={fmtMs(snapshot.median_time_ms)} />
          <Field
            label="Discrimination"
            value={snapshot.discrimination === null ? 'not enough evidence' : Number(snapshot.discrimination).toFixed(2)}
          />
          <Field label="Source" value={snapshot.source} mono={false} />
          <Field
            label="Last calibrated"
            value={snapshot.calibrated_at ? new Date(snapshot.calibrated_at).toLocaleString() : 'not yet'}
            mono={false}
          />
        </div>
      </div>

      {onRecalibrate && (
        <div className="border-t border-grid px-5 py-3">
          <button
            onClick={onRecalibrate}
            className="rounded border border-brass px-3 py-1.5 text-sm text-brass transition-colors hover:bg-brass hover:text-white"
          >
            Request recalibration
          </button>
        </div>
      )}

      <div className="border-t border-grid px-5 py-4">
        <h3 className="font-display text-sm text-ink">Calibration history</h3>
        <ul className="mt-2 space-y-2">
          {history.length === 0 && <li className="text-sm text-ink-soft">No changes recorded yet.</li>}
          {history.slice(0, 8).map((h) => (
            <li key={h.id} className="text-xs">
              <span className="font-mono text-ink-soft">{new Date(h.createdAt).toLocaleDateString()}</span>{' '}
              <span className="text-ink">
                {h.fieldChanged}
                {h.oldValue !== null && h.newValue !== null ? (
                  <>
                    {' '}
                    <span className="font-mono text-ink-soft">{h.oldValue}</span> →{' '}
                    <span className="font-mono text-ink">{h.newValue}</span>
                  </>
                ) : null}
              </span>
              <span className="text-ink-soft"> — {h.reason.replaceAll('_', ' ')}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
