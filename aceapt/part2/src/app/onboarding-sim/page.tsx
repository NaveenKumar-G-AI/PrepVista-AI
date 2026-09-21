"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Eyebrow } from "@/components/ui";
import type { ConfidenceSelfRating, PainPoint } from "@/lib/domain/types";

const PAIN_POINTS: { value: PainPoint; label: string }[] = [
  { value: "SPEED", label: "Solving fast enough" },
  { value: "CARELESS_MISTAKES", label: "Careless mistakes" },
  { value: "CONCEPTUAL_GAPS", label: "Gaps in core concepts" },
  { value: "UNFAMILIAR_VARIATIONS", label: "Unfamiliar question variations" },
  { value: "TIME_PRESSURE", label: "Time pressure in general" },
  { value: "CONSISTENCY", label: "Inconsistent performance" },
];

const CONFIDENCE_OPTIONS: { value: ConfidenceSelfRating; label: string }[] = [
  { value: "LOW", label: "Not confident" },
  { value: "MEDIUM", label: "Somewhat confident" },
  { value: "HIGH", label: "Confident" },
];

interface FormState {
  preparationGoal: string;
  timelineCategory: "URGENT" | "MODERATE" | "LONG_TERM" | "UNSPECIFIED";
  targetDate: string;
  daysAvailable: string;
  experienceLevel: "FIRST_TIME" | "RETAKING" | "EXPERIENCED";
  previousPreparation: string;
  confidenceQuantitative: ConfidenceSelfRating;
  confidenceLogical: ConfidenceSelfRating;
  confidenceVerbal: ConfidenceSelfRating;
  confidenceTimePressure: ConfidenceSelfRating;
  primaryPainPoint: PainPoint | "";
  secondaryPainPoints: PainPoint[];
}

const INITIAL: FormState = {
  preparationGoal: "",
  timelineCategory: "MODERATE",
  targetDate: "",
  daysAvailable: "",
  experienceLevel: "FIRST_TIME",
  previousPreparation: "",
  confidenceQuantitative: "MEDIUM",
  confidenceLogical: "MEDIUM",
  confidenceVerbal: "MEDIUM",
  confidenceTimePressure: "MEDIUM",
  primaryPainPoint: "",
  secondaryPainPoints: [],
};

export default function OnboardingSimPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleSecondary(point: PainPoint) {
    setForm((f) => ({
      ...f,
      secondaryPainPoints: f.secondaryPainPoints.includes(point)
        ? f.secondaryPainPoints.filter((p) => p !== point)
        : [...f.secondaryPainPoints, point],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.preparationGoal.trim() || !form.primaryPainPoint) {
      setError("Fill in your goal and pick a main pain point before continuing.");
      return;
    }
    setSubmitting(true);
    try {
      const onboardingRes = await fetch("/api/onboarding-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preparationGoal: form.preparationGoal.trim(),
          targetDate: form.targetDate || null,
          timelineCategory: form.timelineCategory,
          daysAvailable: form.daysAvailable ? Number(form.daysAvailable) : null,
          experienceLevel: form.experienceLevel,
          previousPreparation: form.previousPreparation.trim() || null,
          confidenceQuantitative: form.confidenceQuantitative,
          confidenceLogical: form.confidenceLogical,
          confidenceVerbal: form.confidenceVerbal,
          confidenceTimePressure: form.confidenceTimePressure,
          primaryPainPoint: form.primaryPainPoint,
          secondaryPainPoints: form.secondaryPainPoints,
        }),
      });
      if (!onboardingRes.ok) throw new Error("Could not save your context.");
      const { onboardingContextId } = await onboardingRes.json();

      const startRes = await fetch("/api/diagnostic/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboardingContextId }),
      });
      if (!startRes.ok) throw new Error("Could not start the diagnostic.");
      const { sessionId } = await startRes.json();

      router.push(`/diagnostic/${sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen px-6 py-14 sm:py-20">
      <div className="mx-auto max-w-2xl">
        <Eyebrow>Standing in for Feature 1</Eyebrow>
        <h1 className="font-display mt-3 text-3xl font-medium text-ink sm:text-4xl">
          Before the diagnostic, a few quick questions
        </h1>
        <p className="mt-3 max-w-xl text-ink-soft">
          This short form takes the place of ACEAPT&rsquo;s onboarding step, which hasn&rsquo;t
          been built yet. It exists only to produce real context for the diagnostic to
          use — including your own sense of where you stand, which the diagnostic will
          later compare against what it actually measures.
        </p>

        <form onSubmit={handleSubmit} className="mt-10 space-y-8">
          <Card className="p-6 space-y-5">
            <Field label="What are you preparing for?" htmlFor="goal">
              <input
                id="goal"
                type="text"
                required
                value={form.preparationGoal}
                onChange={(e) => update("preparationGoal", e.target.value)}
                placeholder="e.g. Campus placements, CAT, Bank PO"
                className={inputClass}
              />
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="How soon do you need to be ready?" htmlFor="timeline">
                <select
                  id="timeline"
                  value={form.timelineCategory}
                  onChange={(e) => update("timelineCategory", e.target.value as FormState["timelineCategory"])}
                  className={inputClass}
                >
                  <option value="URGENT">Urgent — within a month</option>
                  <option value="MODERATE">Moderate — 1 to 3 months</option>
                  <option value="LONG_TERM">Long-term — 3 months or more</option>
                  <option value="UNSPECIFIED">Not sure yet</option>
                </select>
              </Field>
              <Field label="Target date (optional)" htmlFor="targetDate">
                <input
                  id="targetDate"
                  type="date"
                  value={form.targetDate}
                  onChange={(e) => update("targetDate", e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Have you prepared for this before?" htmlFor="experience">
                <select
                  id="experience"
                  value={form.experienceLevel}
                  onChange={(e) => update("experienceLevel", e.target.value as FormState["experienceLevel"])}
                  className={inputClass}
                >
                  <option value="FIRST_TIME">No, this is my first time</option>
                  <option value="RETAKING">Yes, I&rsquo;m retaking after a previous attempt</option>
                  <option value="EXPERIENCED">Yes, I&rsquo;ve done this a fair amount</option>
                </select>
              </Field>
              <Field label="Days you can realistically dedicate to prep (optional)" htmlFor="days">
                <input
                  id="days"
                  type="number"
                  min={0}
                  max={3650}
                  value={form.daysAvailable}
                  onChange={(e) => update("daysAvailable", e.target.value)}
                  placeholder="e.g. 45"
                  className={inputClass}
                />
              </Field>
            </div>

            <Field label="Anything you've already tried? (optional)" htmlFor="previous">
              <textarea
                id="previous"
                rows={2}
                value={form.previousPreparation}
                onChange={(e) => update("previousPreparation", e.target.value)}
                placeholder="Courses, books, mock tests you've already done"
                className={inputClass}
              />
            </Field>
          </Card>

          <Card className="p-6 space-y-5">
            <Eyebrow>Your own sense of where you stand</Eyebrow>
            <p className="text-sm text-ink-soft -mt-2">
              Be honest, not modest — the diagnostic is specifically designed to compare
              this against what it measures, and that comparison is one of the more
              useful parts of your report.
            </p>
            <ConfidenceRow
              label="Quantitative Aptitude"
              value={form.confidenceQuantitative}
              onChange={(v) => update("confidenceQuantitative", v)}
            />
            <ConfidenceRow
              label="Logical Reasoning"
              value={form.confidenceLogical}
              onChange={(v) => update("confidenceLogical", v)}
            />
            <ConfidenceRow
              label="Verbal Aptitude"
              value={form.confidenceVerbal}
              onChange={(v) => update("confidenceVerbal", v)}
            />
            <ConfidenceRow
              label="Working under time pressure"
              value={form.confidenceTimePressure}
              onChange={(v) => update("confidenceTimePressure", v)}
            />
          </Card>

          <Card className="p-6 space-y-4">
            <Eyebrow>What holds you back most</Eyebrow>
            <Field label="Pick your main one" htmlFor="primaryPain">
              <select
                id="primaryPain"
                value={form.primaryPainPoint}
                onChange={(e) => update("primaryPainPoint", e.target.value as PainPoint)}
                required
                className={inputClass}
              >
                <option value="" disabled>
                  Choose one
                </option>
                {PAIN_POINTS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-ink">
                Anything else that applies? (optional)
              </legend>
              <div className="flex flex-wrap gap-2">
                {PAIN_POINTS.filter((p) => p.value !== form.primaryPainPoint).map((p) => {
                  const checked = form.secondaryPainPoints.includes(p.value);
                  return (
                    <label
                      key={p.value}
                      className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-colors ${
                        checked ? "border-steel bg-steel-soft text-ink" : "border-line text-ink-soft hover:border-ink/30"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        onChange={() => toggleSecondary(p.value)}
                      />
                      {p.label}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </Card>

          {error && (
            <p role="alert" className="rounded-lg border border-steel/40 bg-steel-soft px-4 py-3 text-sm text-ink">
              {error}
            </p>
          )}

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Setting things up…" : "Continue to the diagnostic"}
            </Button>
          </div>
        </form>
      </div>
    </main>
  );
}

const inputClass =
  "w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-ink placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-steel";

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      {children}
    </div>
  );
}

function ConfidenceRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ConfidenceSelfRating;
  onChange: (v: ConfidenceSelfRating) => void;
}) {
  return (
    <fieldset className="flex flex-wrap items-center justify-between gap-3">
      <legend className="text-sm text-ink">{label}</legend>
      <div className="flex gap-2">
        {CONFIDENCE_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs transition-colors ${
              value === opt.value ? "border-brass bg-brass-soft text-brass-strong" : "border-line text-ink-soft hover:border-ink/30"
            }`}
          >
            <input
              type="radio"
              name={label}
              className="sr-only"
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
            />
            {opt.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
