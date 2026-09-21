import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { ArrowLeft, Sparkles } from "lucide-react";
import { getStudentIdFromHeaders } from "@/lib/session";
import { getStudentOnboardingContext } from "@/lib/onboarding/service";
import { labelForValue, GOAL_OPTIONS, TIMELINE_OPTIONS, OBJECTIVE_OPTIONS, PAIN_POINT_OPTIONS } from "@/lib/onboarding/flow";

export default async function DiagnosticPage() {
  const headersList = await headers();
  const studentId = getStudentIdFromHeaders(headersList);
  if (!studentId) redirect("/");

  // This call is the ENTIRE integration surface Feature 2 needs: the same
  // getStudentOnboardingContext(studentId) function Feature 1 uses internally. Nothing on this
  // page reads React state, query params, or anything UI-specific from the wizard — which is
  // the actual proof that spec section 29's contract decouples this route from the onboarding
  // implementation, rather than just asserting that it does.
  const context = await getStudentOnboardingContext(studentId);

  if (context.onboardingStatus !== "COMPLETED") {
    redirect("/");
  }

  return (
    <main className="ink-surface-measure flex min-h-screen flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-lg text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-measure/40 bg-measure/10">
          <Sparkles className="h-5 w-5 text-measure" aria-hidden />
        </div>
        <p className="mt-5 font-mono text-xs uppercase tracking-[0.2em] text-paper-100/50">Feature 2 · Coming next</p>
        <h1 className="mt-3 text-balance font-display text-3xl font-medium leading-tight sm:text-4xl">
          The Adaptive Diagnostic Engine isn&rsquo;t built yet.
        </h1>
        <p className="mx-auto mt-4 max-w-md text-balance text-[16px] leading-relaxed text-paper-100/70">
          This is a development placeholder, not a working diagnostic — ACEAPT doesn&rsquo;t pretend otherwise. What
          <em className="font-display not-italic text-paper-50"> is </em>
          real: your onboarding context is already saved and ready, fetched below through the exact service contract
          the diagnostic engine will use.
        </p>

        <div className="mx-auto mt-8 max-w-sm rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-left">
          <p className="text-xs uppercase tracking-wide text-paper-100/40">
            Received via <code className="font-mono">getStudentOnboardingContext()</code>
          </p>
          <dl className="mt-3 space-y-2 text-[14px]">
            <div className="flex justify-between gap-4">
              <dt className="text-paper-100/50">Goal</dt>
              <dd className="text-right text-paper-50">
                {context.preparationGoal ? labelForValue(context.preparationGoal, GOAL_OPTIONS) : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-paper-100/50">Window</dt>
              <dd className="text-right text-paper-50">
                {context.daysAvailable != null
                  ? `${context.daysAvailable} days`
                  : context.timelineCategory
                    ? labelForValue(context.timelineCategory, TIMELINE_OPTIONS)
                    : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-paper-100/50">Focus</dt>
              <dd className="text-right text-paper-50">
                {context.primaryObjective ? labelForValue(context.primaryObjective, OBJECTIVE_OPTIONS) : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-paper-100/50">Challenge</dt>
              <dd className="text-right text-paper-50">
                {context.primaryPainPoint ? labelForValue(context.primaryPainPoint, PAIN_POINT_OPTIONS) : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-white/10 pt-2">
              <dt className="text-paper-100/50">Measured capability</dt>
              <dd className="text-right font-mono text-paper-100/40">null — awaiting Feature 2</dd>
            </div>
          </dl>
        </div>

        <Link
          href="/"
          className="mt-8 inline-flex items-center gap-1.5 text-sm text-paper-100/50 transition-colors hover:text-paper-100"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back to your onboarding
        </Link>
      </div>
    </main>
  );
}
