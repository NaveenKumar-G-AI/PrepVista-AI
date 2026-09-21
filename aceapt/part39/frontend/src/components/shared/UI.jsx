export const RECOMMENDATION_STYLES = {
  APPLY_NOW: { bg: 'bg-pine-50', text: 'text-pine-700', dot: 'bg-pine-600', label: 'Apply now' },
  PREPARE_THEN_APPLY: { bg: 'bg-denim-50', text: 'text-denim-700', dot: 'bg-denim-600', label: 'Prepare, then apply' },
  LOW_PRIORITY: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-600', label: 'Low priority' },
  DO_NOT_PRIORITIZE: { bg: 'bg-ink/5', text: 'text-ink-soft', dot: 'bg-ink-faint', label: "Don't prioritize" },
  VERIFY_FIRST: { bg: 'bg-brick-50', text: 'text-brick-700', dot: 'bg-brick-600', label: 'Verify before applying' },
  ANALYZING: { bg: 'bg-ink/5', text: 'text-ink-soft', dot: 'bg-ink-faint', label: 'Analyzing...' },
};

export const SAFETY_STYLES = {
  LOW: { bg: 'bg-pine-50', text: 'text-pine-700', label: 'Low concern' },
  VERIFY: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Verify' },
  HIGH: { bg: 'bg-brick-50', text: 'text-brick-700', label: 'High concern' },
};

export const MATCH_STATUS = {
  STRONG_MATCH: { icon: '\u2713', color: 'text-pine-600', label: 'Strong match' },
  PARTIAL_MATCH: { icon: '\u25b3', color: 'text-amber-600', label: 'Limited evidence' },
  GAP: { icon: '\u2013', color: 'text-brick-600', label: 'Gap' },
  UNKNOWN: { icon: '?', color: 'text-ink-faint', label: 'Unknown' },
};

export const STAGE_LABELS = {
  SAVED: 'Saved', RESEARCHING: 'Researching', PREPARING: 'Preparing', APPLIED: 'Applied',
  ASSESSMENT: 'Assessment', RECRUITER_CONTACT: 'Recruiter contact', INTERVIEW_1: 'Interview 1',
  INTERVIEW_2: 'Interview 2', FINAL_ROUND: 'Final round', OFFER: 'Offer', REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn', NO_RESPONSE: 'No response', CLOSED: 'Closed',
};

export function Badge({ children, tone = 'neutral', dot, className = '' }) {
  const tones = {
    neutral: 'bg-ink/5 text-ink-soft',
    pine: 'bg-pine-50 text-pine-700',
    amber: 'bg-amber-50 text-amber-700',
    brick: 'bg-brick-50 text-brick-700',
    denim: 'bg-denim-50 text-denim-700',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${tones[tone] || tones.neutral} ${className}`}>
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
      {children}
    </span>
  );
}

export function RecommendationBadge({ recommendation, size = 'sm' }) {
  const style = RECOMMENDATION_STYLES[recommendation] || RECOMMENDATION_STYLES.ANALYZING;
  const sizeCls = size === 'lg' ? 'px-3.5 py-1.5 text-sm' : 'px-2.5 py-1 text-xs';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium ${style.bg} ${style.text} ${sizeCls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}

export function SafetyBadge({ level }) {
  const style = SAFETY_STYLES[level] || SAFETY_STYLES.LOW;
  return <Badge tone={level === 'HIGH' ? 'brick' : level === 'VERIFY' ? 'amber' : 'pine'}>{style.label}</Badge>;
}

export function ConfidenceTag({ confidence }) {
  if (!confidence || confidence === 'UNKNOWN') return <span className="text-xs text-ink-faint font-mono">Confidence: unknown</span>;
  return <span className="text-xs text-ink-faint font-mono">Confidence: {confidence.toLowerCase()}</span>;
}

export function MatchStatusIcon({ status }) {
  const s = MATCH_STATUS[status] || MATCH_STATUS.UNKNOWN;
  return <span className={`font-mono font-semibold ${s.color}`} title={s.label}>{s.icon}</span>;
}

export function StagePill({ stage }) {
  const closed = ['REJECTED', 'WITHDRAWN', 'CLOSED'].includes(stage);
  const offer = stage === 'OFFER';
  return (
    <Badge tone={offer ? 'pine' : closed ? 'neutral' : 'denim'}>
      {STAGE_LABELS[stage] || stage}
    </Badge>
  );
}

export function FitDimensionBar({ label, value, band }) {
  const numeric = typeof value === 'number';
  const pct = numeric ? Math.max(2, Math.min(100, value)) : null;
  const barColor = band === 'STRONG' ? 'bg-pine-600' : band === 'MODERATE' ? 'bg-denim-600' : band === 'WEAK' ? 'bg-amber-600' : 'bg-ink-faint';
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs text-ink-soft">{label}</span>
        <span className="text-xs font-mono text-ink-faint">{numeric ? `${value}` : (value || 'Unknown')}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-ink/5 overflow-hidden">
        {numeric ? <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} /> : null}
      </div>
    </div>
  );
}

export function SectionCard({ title, subtitle, action, children, className = '' }) {
  return (
    <div className={`rounded-2xl border border-border-soft bg-surface p-5 sm:p-6 ${className}`}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            {title && <h3 className="font-heading font-semibold text-ink text-sm tracking-wide uppercase">{title}</h3>}
            {subtitle && <p className="text-sm text-ink-soft mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function EmptyState({ title, subtitle, action }) {
  return (
    <div className="rounded-2xl border border-dashed border-border-soft bg-surface/50 p-10 text-center">
      <p className="font-heading font-medium text-ink">{title}</p>
      {subtitle && <p className="text-sm text-ink-soft mt-1.5 max-w-md mx-auto">{subtitle}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function LoadingState({ label = 'Loading...' }) {
  return (
    <div className="flex items-center gap-2 text-sm text-ink-faint py-10 justify-center font-mono">
      <span className="h-1.5 w-1.5 rounded-full bg-ink-faint animate-pulse" />
      {label}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="rounded-2xl border border-brick-100 bg-brick-50 p-6 text-center">
      <p className="text-sm text-brick-700">{message || 'Something went wrong.'}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-3 text-sm font-medium text-brick-700 underline underline-offset-2">
          Try again
        </button>
      )}
    </div>
  );
}

export function Button({ children, variant = 'primary', size = 'md', className = '', ...props }) {
  const base = 'inline-flex items-center justify-center gap-1.5 rounded-full font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  const variants = {
    primary: 'bg-ink text-paper hover:bg-ink/90',
    secondary: 'bg-transparent text-ink border border-border-soft hover:bg-ink/5',
    ghost: 'bg-transparent text-ink-soft hover:text-ink hover:bg-ink/5',
    danger: 'bg-transparent text-brick-700 border border-brick-100 hover:bg-brick-50',
  };
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-5 py-2.5 text-sm' };
  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function ScoreDigit({ value, label }) {
  return (
    <div>
      <div className="font-mono text-2xl text-ink tabular-nums">{value ?? '--'}</div>
      <div className="text-xs text-ink-faint mt-0.5">{label}</div>
    </div>
  );
}
