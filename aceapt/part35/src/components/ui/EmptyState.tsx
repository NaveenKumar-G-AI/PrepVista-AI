import type { ReactNode } from 'react';

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-card border border-dashed border-line bg-surface/60 p-10 text-center">
      <p className="font-display text-xl text-ink">{title}</p>
      <p className="mt-2 text-sm text-muted max-w-sm mx-auto">{body}</p>
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  );
}
