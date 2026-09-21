"use client";

import { ArrowRight, Pencil } from "lucide-react";
import type { StudentOnboardingContext } from "@/lib/onboarding/types";
import {
  labelForValue,
  GOAL_OPTIONS,
  TIMELINE_OPTIONS,
  AVAILABILITY_OPTIONS,
  OBJECTIVE_OPTIONS,
  EXPERIENCE_OPTIONS,
  PAIN_POINT_OPTIONS,
  ASSISTANCE_OPTIONS,
} from "@/lib/onboarding/flow";
import { CONFIDENCE_LABELS, CONFIDENCE_ROWS } from "./StepRenderer";
import { Button, PerceptionGauge } from "@/components/ui/primitives";

interface RecapRow {
  label: string;
  value: string;
  editStepId: string;
}

function buildRecapRows(ctx: StudentOnboardingContext): RecapRow[] {
  const rows: RecapRow[] = [];

  if (ctx.preparationGoal) {
    rows.push({
      label: "Goal",
      value:
        ctx.preparationGoal === "OTHER" && ctx.preparationGoalOther
          ? ctx.preparationGoalOther
          : labelForValue(ctx.preparationGoal, GOAL_OPTIONS),
      editStepId: "goal",
    });
  }
  if (ctx.timelineCategory) {
    rows.push({
      label: "Preparation window",
      value:
        ctx.daysAvailable != null
          ? `${ctx.daysAvailable} day${ctx.daysAvailable === 1 ? "" : "s"}`
          : labelForValue(ctx.timelineCategory, TIMELINE_OPTIONS),
      editStepId: "timeline",
    });
  }
  if (ctx.dailyAvailability) {
    rows.push({
      label: "Daily availability",
      value: labelForValue(ctx.dailyAvailability, AVAILABILITY_OPTIONS),
      editStepId: "daily-availability",
    });
  }
  if (ctx.primaryObjective) {
    rows.push({
      label: "Primary focus",
      value: labelForValue(ctx.primaryObjective, OBJECTIVE_OPTIONS),
      editStepId: "objective",
    });
  }
  if (ctx.experienceLevel) {
    rows.push({
      label: "Experience",
      value: labelForValue(ctx.experienceLevel, EXPERIENCE_OPTIONS),
      editStepId: "experience",
    });
  }
  if (ctx.primaryPainPoint) {
    rows.push({
      label: "Primary challenge",
      value: labelForValue(ctx.primaryPainPoint, PAIN_POINT_OPTIONS),
      editStepId: "pain-point",
    });
  }
  if (ctx.preferredAssistanceModes.length) {
    rows.push({
      label: "Preferred help",
      value: ctx.preferredAssistanceModes.map((m) => labelForValue(m, ASSISTANCE_OPTIONS)).join(" · "),
      editStepId: "assistance-preference",
    });
  }
  return rows;
}

export function SummaryScreen({
  context,
  onEdit,
  onContinue,
}: {
  context: StudentOnboardingContext;
  onEdit: (stepId: string) => void;
  onContinue: () => void;
}) {
  const rows = buildRecapRows(context);
  const conf = context.selfPerceivedConfidence;
  const hasConfidence = conf.quantitative || conf.logical || conf.verbal || conf.timePressure;

  return (
    <div className="ink-surface flex min-h-screen flex-col items-center px-6 py-16">
      <div className="w-full max-w-xl animate-fade-up">
        <p className="text-center font-mono text-xs uppercase tracking-[0.2em] text-paper-100/50">
          Your starting context
        </p>
        <h1 className="mt-4 text-balance text-center font-display text-3xl font-medium leading-tight sm:text-4xl">
          Here&rsquo;s what I understand.
        </h1>

        {context.summary && (
          <p className="mx-auto mt-6 max-w-lg text-balance text-center text-[16px] leading-relaxed text-paper-100/80">
            {context.summary.text}
          </p>
        )}
        <p className="mt-2 text-center font-mono text-[11px] text-paper-100/35">Prepared from your answers.</p>

        <div className="mt-8 divide-y divide-white/10 rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm">
          {rows.map((row) => (
            <div key={row.editStepId} className="flex items-center justify-between gap-4 px-5 py-3.5">
              <div>
                <dt className="text-xs uppercase tracking-wide text-paper-100/40">{row.label}</dt>
                <dd className="mt-0.5 text-[15px] text-paper-50">{row.value}</dd>
              </div>
              <button
                type="button"
                onClick={() => onEdit(row.editStepId)}
                aria-label={`Edit ${row.label}`}
                className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-paper-100/40 transition-colors hover:bg-white/10 hover:text-paper-100"
              >
                <Pencil className="h-3 w-3" aria-hidden />
                Edit
              </button>
            </div>
          ))}

          {hasConfidence && (
            <div className="px-5 py-3.5">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <PerceptionGauge />
                  <dt className="text-xs uppercase tracking-wide text-paper-100/40">Confidence (self-reported)</dt>
                </div>
                <button
                  type="button"
                  onClick={() => onEdit("confidence-map")}
                  aria-label="Edit confidence"
                  className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-paper-100/40 transition-colors hover:bg-white/10 hover:text-paper-100"
                >
                  <Pencil className="h-3 w-3" aria-hidden />
                  Edit
                </button>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
                {CONFIDENCE_ROWS.map(
                  (row) =>
                    conf[row.key] && (
                      <div key={row.key} className="flex justify-between text-[13px]">
                        <dt className="text-paper-100/50">{row.label.replace(" Aptitude", "")}</dt>
                        <dd className="text-paper-50">{CONFIDENCE_LABELS[conf[row.key]!]}</dd>
                      </div>
                    ),
                )}
              </dl>
            </div>
          )}
        </div>

        <p className="mx-auto mt-8 max-w-md text-balance text-center font-display text-lg italic leading-relaxed text-paper-100/85">
          Your answers tell me how you see your preparation today. Your diagnostic will measure what you can
          actually do.
        </p>

        <div className="mt-8 flex justify-center">
          <Button onClick={onContinue} className="!px-7 !py-3.5 !text-base">
            Discover My Aptitude Level
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}
