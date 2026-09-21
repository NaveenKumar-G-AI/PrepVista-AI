import type { CapabilityEvidenceLabel, ReadinessGap, RequiredLevel } from '../types';

const REQUIRED_LEVEL_TEXT: Record<RequiredLevel, string> = { BASIC: 'basic', INTERMEDIATE: 'intermediate', STRONG: 'strong' };
const CURRENT_LABEL_TEXT: Record<CapabilityEvidenceLabel, string> = {
  UNKNOWN: 'has not been validated yet',
  LIMITED: 'has limited evidence',
  DEVELOPING: 'is developing',
  STRONG: 'has strong evidence',
};

export function ReadinessGapPanel({ gaps }: { gaps: ReadinessGap[] }) {
  if (gaps.length === 0) {
    return (
      <section className="rounded-card border border-paper-line bg-white/70 p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-ink">Readiness gaps</h2>
        <p className="mt-3 text-sm text-ink/70">Every required capability for this role currently meets or exceeds its target level.</p>
      </section>
    );
  }

  return (
    <section className="rounded-card border border-paper-line bg-white/70 p-6 sm:p-8">
      <h2 className="text-lg font-semibold text-ink">Readiness gaps</h2>
      <ul className="mt-4 space-y-3">
        {gaps.map((gap, i) => (
          <li key={gap.capabilityId} className={`flex items-start gap-3 rounded-md px-3.5 py-3 ${i === 0 ? 'bg-gap-soft' : 'bg-paper-dim/50'}`}>
            <span className={`mt-0.5 shrink-0 font-mono text-[11px] ${i === 0 ? 'text-gap' : 'text-ink/40'}`} aria-hidden="true">
              {i === 0 ? '!' : String(i + 1).padStart(2, '0')}
            </span>
            <div>
              <p className={`text-sm font-medium ${i === 0 ? 'text-gap' : 'text-ink'}`}>{gap.capabilityName}</p>
              <p className={`mt-0.5 text-sm ${i === 0 ? 'text-gap/85' : 'text-ink/60'}`}>
                {CURRENT_LABEL_TEXT[gap.currentLabel]}, this role expects {REQUIRED_LEVEL_TEXT[gap.requiredLevel]}.
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
