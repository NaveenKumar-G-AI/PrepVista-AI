import type { FC, ReactNode } from "react";

export const EmptyState: FC<{ title: string; description?: string; action?: ReactNode; icon?: ReactNode }> = ({
  title,
  description,
  action,
  icon,
}) => (
  <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line px-6 py-12 text-center">
    {icon && <div className="mb-1 text-ink-faint">{icon}</div>}
    <p className="font-medium text-ink">{title}</p>
    {description && <p className="max-w-sm text-sm text-ink-soft">{description}</p>}
    {action && <div className="mt-2">{action}</div>}
  </div>
);
