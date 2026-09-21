import type { ReadinessDTO } from '../types';
import { READABLE_STATE, StatusPill, confidenceTone } from './shared';

/**
 * Screen 1 from the brief: the first thing a student sees, answering "am I
 * ready?" in the first viewport, in words rather than a percentage (section
 * 4/32/70). "Why" bullets are rendered as a plain numbered ledger rather
 * than icon-per-line, since guessing positive/negative from the bullet text
 * itself would be fragile — the state pill and gap panel already carry that
 * distinction with real data.
 */
export function ReadinessHero({ data }: { data: ReadinessDTO }) {
  return (
    <section className="rounded-card border border-paper-line bg-white/70 p-6 sm:p-8">
      <p className="font-mono text-xs uppercase tracking-wide text-ink/45">Target role</p>
      <h1 className="mt-1 text-2xl font-semibold text-ink sm:text-3xl">{data.roleName}</h1>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <span className="font-mono text-3xl font-semibold leading-none tracking-tight text-ink sm:text-4xl">
          {READABLE_STATE[data.state]}
        </span>
        <StatusPill tone={confidenceTone(data.confidence)}>{data.confidence} confidence</StatusPill>
      </div>

      <div className="mt-6 border-t border-paper-line pt-5">
        <p className="font-mono text-xs uppercase tracking-wide text-ink/45">Why</p>
        <ol className="mt-3 space-y-2.5">
          {data.reasons.map((reason, i) => (
            <li key={i} className="flex items-start gap-3 text-sm leading-relaxed text-ink/85">
              <span className="mt-0.5 shrink-0 font-mono text-[11px] text-ink/35">{String(i + 1).padStart(2, '0')}</span>
              <span>{reason}</span>
            </li>
          ))}
        </ol>
      </div>

      {data.underPreparationNote && (
        <p className="mt-5 rounded-md bg-gap-soft px-3.5 py-2.5 text-sm text-gap" role="note">
          {data.underPreparationNote}
        </p>
      )}
      {data.overPreparationNote && (
        <p className="mt-5 rounded-md bg-evidence-soft px-3.5 py-2.5 text-sm text-evidence" role="note">
          {data.overPreparationNote}
        </p>
      )}
    </section>
  );
}
