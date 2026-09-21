import { EVIDENCE_CLASS_ORDER, EvidenceClass } from '../types';

const CLASS_LABEL: Record<EvidenceClass, string> = {
  SELF_REPORTED: 'Self-reported',
  ACTIVITY: 'Activity',
  KNOWLEDGE: 'Knowledge',
  PRACTICE: 'Practice',
  DEMONSTRATED: 'Demonstrated',
  VALIDATED: 'Validated',
  REAL_WORLD: 'Real-world',
};

/**
 * Renders the evidence-class ladder (self-reported → activity → knowledge →
 * practice → demonstrated → validated → real-world) as discrete ticks,
 * filled up to whatever the student has actually reached. This is
 * deliberately not a smooth percentage bar: the underlying thing it depicts
 * — which named rung of evidence has been reached — is itself discrete, and
 * showing it as discrete ticks is what keeps this from turning into "another
 * percentage dashboard" (brief, section 4).
 */
export function EvidenceLadder({
  achievedClass,
  hasConflict,
  compact = false,
}: {
  achievedClass: EvidenceClass | null;
  hasConflict: boolean;
  compact?: boolean;
}) {
  const achievedIndex = achievedClass ? EVIDENCE_CLASS_ORDER.indexOf(achievedClass) : -1;
  const label = achievedClass ? CLASS_LABEL[achievedClass] : 'No evidence yet';
  const a11yLabel = hasConflict ? `Evidence reaches ${label} level, but sources disagree` : `Evidence reaches ${label} level`;

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-[3px]" role="img" aria-label={achievedClass ? a11yLabel : 'No evidence recorded yet'}>
        {EVIDENCE_CLASS_ORDER.map((cls, i) => {
          const filled = i <= achievedIndex;
          const tone = !filled ? 'bg-paper-line' : hasConflict ? 'bg-pending' : 'bg-evidence';
          return <span key={cls} aria-hidden="true" className={`${compact ? 'h-3 w-[6px]' : 'h-4 w-2'} rounded-[2px] ${tone}`} />;
        })}
      </div>
      {!compact && <span className="font-mono text-[11px] text-ink/55">{label}</span>}
    </div>
  );
}
