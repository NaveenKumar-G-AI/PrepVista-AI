import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({
  variant = "primary",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-[0.95rem] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
  const variants: Record<string, string> = {
    primary: "bg-ink text-paper hover:bg-[#22304f] active:bg-[#0f1729]",
    secondary: "border border-ink/25 text-ink bg-transparent hover:bg-surface hover:border-ink/40",
    ghost: "text-steel hover:text-ink underline-offset-4 hover:underline px-2 py-1",
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-line bg-surface ${className}`}>
      {children}
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="font-mono text-xs uppercase tracking-[0.14em] text-steel">{children}</p>
  );
}

export function Badge({ children, tone = "steel" }: { children: ReactNode; tone?: "steel" | "brass" }) {
  const tones: Record<string, string> = {
    steel: "bg-steel-soft text-steel",
    brass: "bg-brass-soft text-brass-strong",
  };
  return (
    <span className={`font-mono inline-block rounded-full px-2.5 py-1 text-[0.7rem] uppercase tracking-wide ${tones[tone]}`}>
      {children}
    </span>
  );
}
