import { ArrowRight } from 'lucide-react';
import type { NextProofRecommendation } from '../types';

/**
 * Deliberately the one high-contrast (dark) card on the page — everything
 * else reads as calm reference material, this is the one thing meant to
 * pull focus, matching the brief's own emphasis on "what should I prove
 * next" as the primary next action (section 17/70).
 */
export function NextProofCard({ nextProof, onStart }: { nextProof: NextProofRecommendation | null; onStart?: (proof: NextProofRecommendation) => void }) {
  if (!nextProof) {
    return (
      <section className="rounded-card border border-evidence/25 bg-evidence-soft p-6 sm:p-8">
        <p className="font-mono text-xs uppercase tracking-wide text-evidence/70">What should I prove next?</p>
        <p className="mt-2 text-lg font-medium text-evidence">Nothing outstanding right now.</p>
        <p className="mt-1 text-sm text-evidence/80">Every required capability currently meets its bar.</p>
      </section>
    );
  }

  return (
    <section className="rounded-card border border-ink bg-ink p-6 text-paper sm:p-8">
      <p className="font-mono text-xs uppercase tracking-wide text-paper/50">What should I prove next?</p>
      <h2 className="mt-2 text-xl font-semibold">{nextProof.headline}</h2>
      <p className="mt-2 text-sm leading-relaxed text-paper/75">{nextProof.description}</p>
      <button
        type="button"
        onClick={() => onStart?.(nextProof)}
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-paper px-4 py-2 text-sm font-medium text-ink transition-opacity hover:opacity-90"
      >
        {nextProof.ctaLabel}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </section>
  );
}
