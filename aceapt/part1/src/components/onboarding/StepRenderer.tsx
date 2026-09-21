"use client";

import { Check, Sparkles } from "lucide-react";
import type { StepDefinition, StepOption } from "@/lib/onboarding/flow";
import { CONFIDENCE_LEVELS, type ConfidenceLevel } from "@/lib/onboarding/types";
import { cn } from "@/lib/utils";
import { PerceptionGauge } from "@/components/ui/primitives";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Draft = Record<string, any>;

interface StepRendererProps {
  step: StepDefinition;
  draft: Draft;
  onChange: (updates: Draft) => void;
}

function OptionCard({
  option,
  selected,
  onSelect,
  multi,
}: {
  option: StepOption;
  selected: boolean;
  onSelect: () => void;
  multi?: boolean;
}) {
  return (
    <button
      type="button"
      role={multi ? "checkbox" : "radio"}
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "group flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3.5 text-left text-[15px] transition-all duration-150",
        selected
          ? "border-signal bg-signal-100 text-ink-950 shadow-card"
          : "border-ink-950/12 bg-white text-ink-950/85 hover:border-ink-950/25 hover:bg-paper-100",
      )}
    >
      <span className="font-medium">{option.label}</span>
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center border transition-colors",
          multi ? "rounded-[6px]" : "rounded-full",
          selected ? "border-signal bg-signal text-white" : "border-ink-950/20 bg-white",
        )}
        aria-hidden
      >
        {selected && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
      </span>
    </button>
  );
}

export const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  LOW: "Low",
  DEVELOPING: "Developing",
  MODERATE: "Moderate",
  STRONG: "Strong",
  VERY_STRONG: "Very strong",
};

export const CONFIDENCE_ROWS: Array<{ key: "quantitative" | "logical" | "verbal" | "timePressure"; label: string }> = [
  { key: "quantitative", label: "Quantitative Aptitude" },
  { key: "logical", label: "Logical Reasoning" },
  { key: "verbal", label: "Verbal Aptitude" },
  { key: "timePressure", label: "Solving Under Time Pressure" },
];

function ConfidenceRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ConfidenceLevel | null;
  onChange: (v: ConfidenceLevel) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-ink-950/80">{label}</legend>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-5 gap-1.5">
        {CONFIDENCE_LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            role="radio"
            aria-checked={value === level}
            onClick={() => onChange(level)}
            className={cn(
              "rounded-lg border px-1.5 py-2.5 text-center text-[11px] font-medium leading-tight transition-colors sm:text-xs",
              value === level
                ? "border-signal bg-signal text-white"
                : "border-ink-950/12 bg-white text-ink-950/70 hover:border-ink-950/25",
            )}
          >
            {CONFIDENCE_LABELS[level]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function StepRenderer({ step, draft, onChange }: StepRendererProps) {
  if (step.type === "SINGLE_SELECT" && step.fieldKey && step.options) {
    const fieldKey = step.fieldKey;
    const selected = draft[fieldKey] as string | null;
    return (
      <div className="space-y-4">
        <div role="radiogroup" aria-label={step.title} className="grid gap-2.5 sm:grid-cols-2">
          {step.options.map((option) => (
            <OptionCard
              key={option.value}
              option={option}
              selected={selected === option.value}
              onSelect={() => onChange({ [fieldKey]: option.value })}
            />
          ))}
        </div>

        {step.allowOther && selected === "OTHER" && (
          <div className="animate-fade-up">
            <label htmlFor="goal-other" className="mb-1.5 block text-sm font-medium text-ink-950/80">
              Tell us briefly what you're preparing for
            </label>
            <input
              id="goal-other"
              type="text"
              maxLength={200}
              value={draft.preparationGoalOther ?? ""}
              onChange={(e) => onChange({ preparationGoalOther: e.target.value })}
              placeholder="e.g. a state government exam"
              className="w-full rounded-lg border border-ink-950/15 px-4 py-2.5 text-[15px] focus:border-signal"
            />
          </div>
        )}

        {step.allowDate && (
          <div className="animate-fade-up rounded-xl border border-ink-950/10 bg-paper-100 px-4 py-3.5">
            <label htmlFor="target-date" className="mb-1.5 block text-sm font-medium text-ink-950/80">
              Have a specific date? <span className="font-normal text-ink-950/50">(optional)</span>
            </label>
            <input
              id="target-date"
              type="date"
              value={draft.targetDate ?? ""}
              onChange={(e) => onChange({ targetDate: e.target.value || null })}
              className="w-full max-w-[200px] rounded-lg border border-ink-950/15 bg-white px-3 py-2 text-[15px] focus:border-signal"
            />
          </div>
        )}
      </div>
    );
  }

  if (step.type === "MULTI_SELECT" && step.fieldKey && step.options) {
    const fieldKey = step.fieldKey;
    const selected = (draft[fieldKey] as string[]) ?? [];
    const toggle = (value: string) => {
      const next = selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value];
      onChange({ [fieldKey]: next });
    };
    return (
      <div className="grid gap-2.5 sm:grid-cols-2">
        {step.options.map((option) => (
          <OptionCard
            key={option.value}
            option={option}
            selected={selected.includes(option.value)}
            onSelect={() => toggle(option.value)}
            multi
          />
        ))}
      </div>
    );
  }

  if (step.type === "MULTI_SELECT_WITH_PRIMARY" && step.primaryFieldKey && step.secondaryFieldKey && step.options) {
    const primaryKey = step.primaryFieldKey;
    const secondaryKey = step.secondaryFieldKey;
    const primary = draft[primaryKey] as string | null;
    const secondary = (draft[secondaryKey] as string[]) ?? [];

    const selectPrimary = (value: string) => {
      onChange({ [primaryKey]: value, [secondaryKey]: secondary.filter((v) => v !== value) });
    };
    const toggleSecondary = (value: string) => {
      if (value === primary) return; // primary can't also be a secondary pick
      const next = secondary.includes(value) ? secondary.filter((v) => v !== value) : [...secondary, value];
      onChange({ [secondaryKey]: next });
    };

    return (
      <div className="space-y-2.5">
        {step.options.map((option) => {
          const isPrimary = primary === option.value;
          const isSecondary = secondary.includes(option.value);
          return (
            <div
              key={option.value}
              className={cn(
                "flex items-center justify-between gap-3 rounded-xl border px-4 py-3.5 transition-all duration-150",
                isPrimary
                  ? "border-signal bg-signal-100 shadow-card"
                  : isSecondary
                    ? "border-signal/40 bg-signal-100/40"
                    : "border-ink-950/12 bg-white hover:border-ink-950/25",
              )}
            >
              <button
                type="button"
                onClick={() => toggleSecondary(option.value)}
                disabled={isPrimary}
                className={cn(
                  "flex flex-1 items-center gap-3 text-left text-[15px] font-medium",
                  isPrimary ? "cursor-default text-ink-950" : "text-ink-950/85",
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border",
                    isPrimary || isSecondary ? "border-signal bg-signal text-white" : "border-ink-950/20 bg-white",
                  )}
                  aria-hidden
                >
                  {(isPrimary || isSecondary) && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                </span>
                {option.label}
              </button>
              <button
                type="button"
                onClick={() => selectPrimary(option.value)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                  isPrimary ? "bg-signal text-white" : "bg-ink-950/5 text-ink-950/50 hover:bg-ink-950/10",
                )}
              >
                {isPrimary ? "Primary" : "Make primary"}
              </button>
            </div>
          );
        })}
      </div>
    );
  }

  if (step.type === "CONFIDENCE_GRID") {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-2 text-xs text-ink-950/50">
          <PerceptionGauge />
          <span>Self-reported — your diagnostic measures the rest.</span>
        </div>
        {CONFIDENCE_ROWS.map((row) => (
          <ConfidenceRow
            key={row.key}
            label={row.label}
            value={draft[row.key] ?? null}
            onChange={(v) => onChange({ [row.key]: v })}
          />
        ))}
      </div>
    );
  }

  return null;
}

export function StepClarification({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg bg-measure-100 px-3.5 py-3 text-[13px] leading-relaxed text-ink-900/80">
      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-measure" aria-hidden />
      <span>{text}</span>
    </div>
  );
}
