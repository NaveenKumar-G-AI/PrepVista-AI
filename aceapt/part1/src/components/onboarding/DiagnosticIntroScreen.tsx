"use client";

import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/primitives";

export function DiagnosticIntroScreen({ onBegin, beginning }: { onBegin: () => void; beginning: boolean }) {
  return (
    <div className="ink-surface-measure flex min-h-screen flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-lg animate-fade-up text-center">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-paper-100/50">Next</p>

        <h1 className="mt-5 text-balance font-display text-3xl font-medium leading-[1.2] sm:text-4xl">
          You&rsquo;ve told me where you want to go.
          <br />
          <span className="italic text-measure">Now let&rsquo;s understand where you actually are.</span>
        </h1>

        <div className="mx-auto mt-7 max-w-md space-y-3 text-balance text-[16px] leading-relaxed text-paper-100/75">
          <p>Your first diagnostic is not about passing or failing.</p>
          <p>It helps ACEAPT identify the concepts you already understand and the areas where you can improve.</p>
        </div>

        <div className="mt-10">
          <Button onClick={onBegin} loading={beginning} className="!bg-measure !px-7 !py-3.5 !text-base hover:!bg-[#B36A32]">
            Begin Diagnostic
            {!beginning && <ArrowRight className="h-4 w-4" aria-hidden />}
          </Button>
        </div>
      </div>
    </div>
  );
}
