"use client";

import { type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2, AlertCircle, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  loading?: boolean;
  children: ReactNode;
}

export function Button({ variant = "primary", loading, disabled, className, children, ...props }: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-[15px] font-medium transition-all duration-150",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" &&
          "bg-signal text-white shadow-card hover:bg-signal-600 hover:shadow-cardHover active:scale-[0.98]",
        variant === "secondary" &&
          "border border-ink-950/15 bg-white text-ink-950 hover:border-ink-950/25 hover:bg-paper-100 active:scale-[0.98]",
        variant === "ghost" && "text-ink-950/60 hover:text-ink-950 underline-offset-4 hover:underline",
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />}
      {children}
    </button>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-measure/30 bg-measure-100 px-4 py-3 text-sm text-ink-900 animate-fade-in"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-measure" aria-hidden />
      <div className="flex-1">
        <p>{message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-1.5 inline-flex items-center gap-1.5 font-medium text-measure underline-offset-2 hover:underline"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * The product's one recurring signature mark (frontend-design skill: "spend your boldness in
 * one place"). A two-segment capsule — filled signal-blue for "what you told us", a dashed
 * outline for "not measured yet" — visualizing the core self-perception-vs-measured-capability
 * idea in miniature. Used sparingly: the confidence step legend and the summary recap.
 */
export function PerceptionGauge({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 14"
      className={cn("h-3.5 w-10 shrink-0", className)}
      aria-hidden="true"
      focusable="false"
    >
      <rect x="0.5" y="0.5" width="18" height="13" rx="6.5" fill="#3454D1" />
      <rect x="21" y="0.5" width="18.5" height="13" rx="6.5" fill="none" stroke="#C97A3D" strokeDasharray="2.5 2.5" strokeWidth="1" />
    </svg>
  );
}

export function TypingIndicator({ label: text }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-paper-100/70">
      <span className="flex gap-1" aria-hidden>
        <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-current motion-reduce:animate-none" style={{ animationDelay: "0ms" }} />
        <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-current motion-reduce:animate-none" style={{ animationDelay: "180ms" }} />
        <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-current motion-reduce:animate-none" style={{ animationDelay: "360ms" }} />
      </span>
      <span className="font-mono text-xs tracking-wide">{text}</span>
    </div>
  );
}
