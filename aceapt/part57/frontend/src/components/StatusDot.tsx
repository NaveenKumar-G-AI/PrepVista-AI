import type { TrustState } from '../types';

const TRUST_COPY: Record<TrustState, { label: string; dot: string; text: string }> = {
  TRUSTED: { label: 'Trusted', dot: 'bg-verified', text: 'text-verified' },
  RELIABLE: { label: 'Developing', dot: 'bg-focus', text: 'text-focus' },
  DEVELOPING: { label: 'Developing', dot: 'bg-focus/60', text: 'text-inksoft' },
  NEEDS_REVIEW: { label: 'Needs review', dot: 'bg-caution', text: 'text-caution' },
  EXPERIMENTAL: { label: 'Not started', dot: 'bg-line', text: 'text-inksoft' },
};

export function StatusDot({ state }: { state: TrustState }) {
  const copy = TRUST_COPY[state] ?? TRUST_COPY.EXPERIMENTAL;
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm ${copy.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${copy.dot}`} aria-hidden />
      {copy.label}
    </span>
  );
}
