"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { StudentOnboardingContext } from "@/lib/onboarding/types";
import {
  getStep,
  getNextStepId,
  getPreviousStepId,
  getProgress,
  getResumeStepId,
  initialDraftForStep,
  isDraftComplete,
} from "@/lib/onboarding/flow";
import { WelcomeScreen } from "./WelcomeScreen";
import { SummaryScreen } from "./SummaryScreen";
import { DiagnosticIntroScreen } from "./DiagnosticIntroScreen";
import { StepRenderer, StepClarification } from "./StepRenderer";
import { ProgressBar } from "./ProgressBar";
import { Button, ErrorBanner, TypingIndicator } from "@/components/ui/primitives";

type Phase = "welcome" | "question" | "generating" | "summary" | "transition";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Draft = Record<string, any>;

async function fireClientEvent(type: string, metadata: Record<string, unknown> = {}) {
  try {
    await fetch("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type, metadata }),
      keepalive: true,
    });
  } catch {
    // best-effort — analytics never blocks the product experience
  }
}

export function OnboardingWizard({ initialContext }: { initialContext: StudentOnboardingContext }) {
  const router = useRouter();
  const [context, setContext] = useState(initialContext);
  const [phase, setPhase] = useState<Phase>(initialContext.onboardingStatus === "COMPLETED" ? "summary" : "welcome");
  const [currentStepId, setCurrentStepId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isResuming = initialContext.onboardingStatus === "IN_PROGRESS";

  const loadSummary = useCallback(async (ctx: StudentOnboardingContext) => {
    setError(null);
    try {
      const res = await fetch("/api/onboarding/complete", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't prepare your summary. Please try again.");
        return;
      }
      setContext(data.context);
      setPhase("summary");
    } catch {
      setError("Network error — please check your connection and try again.");
    }
  }, []);

  const goToPhaseForStep = useCallback(
    async (stepId: string | null, ctx: StudentOnboardingContext) => {
      if (stepId === null || stepId === "summary") {
        setPhase("generating");
        await loadSummary(ctx);
        return;
      }
      if (stepId === "diagnostic-intro") {
        setPhase("transition");
        return;
      }
      const step = getStep(stepId);
      if (!step) return;
      setCurrentStepId(stepId);
      setDraft(initialDraftForStep(step, ctx));
      setError(null);
      setPhase("question");
    },
    [loadSummary],
  );

  const handleStart = useCallback(async () => {
    setSaving(true);
    void fireClientEvent("ONBOARDING_STARTED");
    const resumeId = getResumeStepId(context);
    await goToPhaseForStep(resumeId, context);
    setSaving(false);
  }, [context, goToPhaseForStep]);

  const handleSubmitStep = useCallback(async () => {
    if (!currentStepId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/step", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stepId: currentStepId, value: draft }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "That didn't save — please try again.");
        return;
      }
      setContext(data.context);
      if (data.isEdit) {
        await goToPhaseForStep("summary", data.context);
      } else {
        await goToPhaseForStep(data.nextStepId, data.context);
      }
    } catch {
      setError("Network error — your earlier answers are safe. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [currentStepId, draft, goToPhaseForStep]);

  const handleSkip = useCallback(async () => {
    if (!currentStepId) return;
    const nextId = getNextStepId(currentStepId, context);
    await goToPhaseForStep(nextId, context);
  }, [currentStepId, context, goToPhaseForStep]);

  const handleBack = useCallback(() => {
    if (!currentStepId) return;
    const prevId = getPreviousStepId(currentStepId, context);
    if (!prevId) {
      setPhase("welcome");
      setCurrentStepId(null);
      return;
    }
    const step = getStep(prevId);
    if (step) {
      setCurrentStepId(prevId);
      setDraft(initialDraftForStep(step, context));
      setError(null);
    }
  }, [currentStepId, context]);

  const handleEdit = useCallback(
    (stepId: string) => {
      void goToPhaseForStep(stepId, context);
    },
    [context, goToPhaseForStep],
  );

  const handleBeginDiagnostic = useCallback(async () => {
    setSaving(true);
    await fireClientEvent("DIAGNOSTIC_STARTED");
    router.push("/diagnostic");
  }, [router]);

  // Best-effort abandonment signal — only while there's genuinely unfinished progress, and
  // only via sendBeacon so it never blocks the tab from closing (spec section 30).
  useEffect(() => {
    function handlePageHide() {
      if (context.onboardingStatus === "IN_PROGRESS" && phase === "question") {
        const payload = JSON.stringify({
          type: "ONBOARDING_ABANDONED",
          metadata: { stepId: currentStepId },
        });
        navigator.sendBeacon?.("/api/events", new Blob([payload], { type: "application/json" }));
      }
    }
    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [context.onboardingStatus, phase, currentStepId]);

  if (phase === "welcome") {
    return <WelcomeScreen isResuming={isResuming} onStart={handleStart} starting={saving} />;
  }

  if (phase === "generating") {
    return (
      <div className="ink-surface flex min-h-screen flex-col items-center justify-center gap-6 px-6">
        <TypingIndicator label="ACEAPT is putting together your starting point…" />
        {error && (
          <div className="w-full max-w-sm">
            <ErrorBanner message={error} onRetry={() => loadSummary(context)} />
          </div>
        )}
      </div>
    );
  }

  if (phase === "summary") {
    return (
      <SummaryScreen
        context={context}
        onEdit={handleEdit}
        onContinue={() => void goToPhaseForStep("diagnostic-intro", context)}
      />
    );
  }

  if (phase === "transition") {
    return <DiagnosticIntroScreen onBegin={handleBeginDiagnostic} beginning={saving} />;
  }

  // phase === "question"
  const step = currentStepId ? getStep(currentStepId) : null;
  if (!step) return null;
  const progress = getProgress(step.id, context);
  const canSubmit = isDraftComplete(step.id, draft);

  return (
    <div className="min-h-screen bg-paper-50 px-6 py-10 sm:py-16">
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-8 flex items-center gap-4">
          <button
            type="button"
            onClick={handleBack}
            disabled={saving}
            aria-label="Go back"
            className="rounded-full p-2 text-ink-950/35 transition-colors hover:bg-ink-950/5 hover:text-ink-950 disabled:opacity-40"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
          </button>
          <div className="flex-1">
            <ProgressBar current={progress.current} total={progress.total} />
          </div>
        </div>

        <div key={step.id} className="animate-fade-up">
          <p className="font-mono text-xs uppercase tracking-wide text-signal">{step.eyebrow}</p>
          <h1 className="mt-2 text-balance font-display text-2xl font-medium leading-snug text-ink-950 sm:text-3xl">
            {step.title}
          </h1>
          {step.subtitle && <p className="mt-2 text-[15px] text-ink-950/60">{step.subtitle}</p>}

          <div className="mt-7">
            <StepRenderer step={step} draft={draft} onChange={(updates) => setDraft((d) => ({ ...d, ...updates }))} />
          </div>

          {step.clarification && (
            <div className="mt-5">
              <StepClarification text={step.clarification} />
            </div>
          )}

          {error && (
            <div className="mt-5">
              <ErrorBanner message={error} onRetry={handleSubmitStep} />
            </div>
          )}

          <div className="mt-8 flex items-center gap-5">
            <Button onClick={handleSubmitStep} disabled={!canSubmit} loading={saving}>
              Continue
              {!saving && <ArrowRight className="h-4 w-4" aria-hidden />}
            </Button>
            {step.optional && (
              <button
                type="button"
                onClick={handleSkip}
                disabled={saving}
                className="text-sm text-ink-950/40 transition-colors hover:text-ink-950/70 hover:underline disabled:opacity-40"
              >
                Skip for now
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
