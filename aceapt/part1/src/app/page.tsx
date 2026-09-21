import { headers } from "next/headers";
import { getStudentIdFromHeaders } from "@/lib/session";
import { getStudentOnboardingContext, logEvent } from "@/lib/onboarding/service";
import { ONBOARDING_EVENTS } from "@/lib/onboarding/types";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";

export default async function Home() {
  const headersList = await headers();
  const studentId = getStudentIdFromHeaders(headersList);

  if (!studentId) {
    // Unreachable in normal operation — middleware guarantees this header on every request
    // matching its matcher (src/middleware.ts). Fail safely instead of crashing the page.
    return (
      <main className="flex min-h-screen items-center justify-center px-6 text-center">
        <p className="text-ink-950/60">Something went wrong setting up your session. Please refresh the page.</p>
      </main>
    );
  }

  const context = await getStudentOnboardingContext(studentId);

  if (context.onboardingStatus === "IN_PROGRESS") {
    // A returning student with unfinished progress — record it without delaying the render.
    void logEvent(studentId, ONBOARDING_EVENTS.ONBOARDING_RESUMED, {});
  }

  return <OnboardingWizard initialContext={context} />;
}
