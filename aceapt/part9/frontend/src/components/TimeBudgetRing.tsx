interface Props {
  remainingSeconds: number;
  totalSeconds: number;
}

/**
 * The signature element of the runner screen: a depleting arc that
 * visualizes the time budget described throughout the spec (section
 * 17). Color shifts from brass to rust only in the final quarter of
 * time - a steady, informative cue rather than a flashing alarm, per
 * spec section 21 ("do not use anxiety-inducing gimmicks").
 */
export function TimeBudgetRing({ remainingSeconds, totalSeconds }: Props) {
  const fraction = totalSeconds > 0 ? Math.max(0, Math.min(1, remainingSeconds / totalSeconds)) : 0;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - fraction);
  const isLow = fraction <= 0.25;

  const mins = Math.floor(remainingSeconds / 60);
  const secs = Math.floor(remainingSeconds % 60);

  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg viewBox="0 0 96 96" className="h-24 w-24 -rotate-90">
        <circle cx="48" cy="48" r={radius} fill="none" stroke="#262B33" strokeWidth="6" />
        <circle
          cx="48"
          cy="48"
          r={radius}
          fill="none"
          stroke={isLow ? '#B85B48' : '#C6A75A'}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="readout text-lg text-bone">
          {mins}:{secs.toString().padStart(2, '0')}
        </span>
        <span className="text-[10px] uppercase tracking-widest text-slate">left</span>
      </div>
    </div>
  );
}
