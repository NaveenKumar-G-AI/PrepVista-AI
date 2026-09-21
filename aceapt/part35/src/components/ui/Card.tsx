import type { HTMLAttributes, ReactNode } from 'react';

export function Card({ children, className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-card border border-line bg-surface shadow-card p-6 ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardEyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted mb-2">{children}</p>
  );
}

export function SectionDivider() {
  return <hr className="border-t border-line my-8" />;
}
