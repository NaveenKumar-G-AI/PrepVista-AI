/**
 * NextChallengeCard
 *
 * Implements the "RECOMMENDATION UI" mock from the Feature 25 spec. This
 * is NOT built against a bespoke new visual identity — the spec is
 * explicit that Feature 25 should "use the existing CodeForge design
 * system," and no such system is available to inspect here. Instead this
 * component leans on the semantic design-token classes conventional in a
 * Tailwind + shadcn/ui setup (bg-card, text-muted-foreground, etc.),
 * which is a reasonable bet for a Next.js + Supabase stack but should be
 * reconciled with this repository's actual `tailwind.config` / theme
 * tokens on integration. Swap the className tokens for real ones if the
 * names differ — the structure and behavior underneath do not depend on
 * the specific token names.
 *
 * NOT type-checked against a real React/Tailwind toolchain (none is
 * available in this environment) — see STATUS_REPORT.md.
 */

import * as React from 'react';

export type SelectionMode = 'PRACTICE' | 'ASSESSMENT' | 'INTERVIEW';

export interface NextChallengeCardProps {
  title: string;
  topic: string;
  difficultyLabel: 'Beginner' | 'Easy' | 'Intermediate' | 'Advanced' | 'Expert';
  estimatedTimeMinutes: number;
  primarySkillLabel: string;
  /**
   * Student-facing explanation string, already produced by
   * explain.ts::explainForStudent(). In ASSESSMENT mode this will be the
   * restricted generic string — the component does not need its own
   * mode-branching logic, it just renders whatever string it's given.
   */
  whyThisChallenge: string;
  mode: SelectionMode;
  onStart: () => void;
  /** Optional: renders a quiet "why not something else?" affordance for practice mode only. */
  onSeeAlternatives?: () => void;
  isLoading?: boolean;
}

const DIFFICULTY_STYLES: Record<NextChallengeCardProps['difficultyLabel'], string> = {
  Beginner: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  Easy: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  Intermediate: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  Advanced: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  Expert: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
};

export function NextChallengeCard({
  title,
  topic,
  difficultyLabel,
  estimatedTimeMinutes,
  primarySkillLabel,
  whyThisChallenge,
  mode,
  onStart,
  onSeeAlternatives,
  isLoading = false,
}: NextChallengeCardProps) {
  return (
    <div className="w-full max-w-md rounded-xl border border-border bg-card text-card-foreground shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Next challenge
        </span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${DIFFICULTY_STYLES[difficultyLabel]}`}>
          {difficultyLabel}
        </span>
      </div>

      <div className="px-5 py-4">
        <p className="text-xs text-muted-foreground">{topic}</p>
        <h3 className="mt-0.5 text-lg font-semibold leading-snug">{title}</h3>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Estimated time</dt>
            <dd className="font-medium">{estimatedTimeMinutes} min</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Primary skill</dt>
            <dd className="font-medium">{primarySkillLabel}</dd>
          </div>
        </dl>

        <div className="mt-4 rounded-lg bg-muted/50 px-3.5 py-3">
          <p className="text-xs font-medium text-muted-foreground">Why this challenge</p>
          <p className="mt-1 text-sm leading-relaxed">{whyThisChallenge}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-border px-5 py-3.5">
        <button
          type="button"
          onClick={onStart}
          disabled={isLoading}
          className="inline-flex flex-1 items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isLoading ? 'Loading…' : 'Start challenge'}
        </button>
        {mode === 'PRACTICE' && onSeeAlternatives && (
          <button
            type="button"
            onClick={onSeeAlternatives}
            className="inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            See other options
          </button>
        )}
      </div>
    </div>
  );
}

export default NextChallengeCard;
