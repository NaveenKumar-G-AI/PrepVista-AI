"use client";

import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/primitives";

export function WelcomeScreen({
  isResuming,
  onStart,
  starting,
}: {
  isResuming: boolean;
  onStart: () => void;
  starting: boolean;
}) {
  return (
    <div className="ink-surface flex min-h-screen flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-xl animate-fade-up text-center">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-paper-100/50">ACEAPT AI</p>

        {isResuming ? (
          <>
            <h1 className="mt-5 text-balance font-display text-4xl font-medium leading-[1.15] sm:text-5xl">
              Welcome back.
            </h1>
            <p className="mx-auto mt-5 max-w-md text-balance text-[17px] leading-relaxed text-paper-100/70">
              Your journey is partially configured.{" "}
              <span className="font-display italic">Let&rsquo;s continue where you left off.</span>
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-5 text-balance font-display text-4xl font-medium leading-[1.15] sm:text-5xl">
              Let&rsquo;s build your aptitude journey.
            </h1>
            <p className="mx-auto mt-5 max-w-md text-balance text-[17px] leading-relaxed text-paper-100/70">
              ACEAPT will understand where you are, where you want to go, and how much time you have —{" "}
              <span className="font-display italic">before creating your preparation path.</span>
            </p>
          </>
        )}

        <div className="mt-10">
          <Button onClick={onStart} loading={starting} className="!px-7 !py-3.5 !text-base">
            {isResuming ? "Continue My Journey" : "Start My Journey"}
            {!starting && <ArrowRight className="h-4 w-4" aria-hidden />}
          </Button>
        </div>

        <p className="mt-8 font-mono text-[11px] text-paper-100/35">
          ~4 minutes · no data shared with other students
        </p>
      </div>
    </div>
  );
}
