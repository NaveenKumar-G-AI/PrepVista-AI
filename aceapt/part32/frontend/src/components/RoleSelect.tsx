import type { RoleOption } from "../types";

export function RoleSelect({
  roles,
  onSelect,
  submitting,
}: {
  roles: RoleOption[];
  onSelect: (roleId: string) => void;
  submitting: boolean;
}) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="font-display text-2xl font-semibold">Readiness Radar</h1>
      <p className="mt-2 max-w-md text-sm text-ink-muted">
        Choose the role you're preparing for. We'll read your assessment history against what that role expects, and
        tell you exactly what to focus on next.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {roles.map((role) => (
          <button
            key={role.roleId}
            disabled={submitting}
            onClick={() => onSelect(role.roleId)}
            className="group rounded-card border border-line bg-surface p-5 text-left transition-colors hover:border-accent disabled:opacity-50"
          >
            <div className="font-display text-base font-semibold group-hover:text-accent">{role.roleName}</div>
            <div className="mt-2 text-xs text-ink-muted">
              {role.capabilities.map((c) => c.capabilityName).join(" · ")}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
