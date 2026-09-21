import type { DevIdentity } from '../api/client';

/** Dev-only convenience so the deliverable is easy to click through without a real login. */
export function IdentityBar({ identity, onChange }: { identity: DevIdentity; onChange: (i: DevIdentity) => void }) {
  return (
    <div className="flex items-center gap-2 text-xs text-inksoft">
      <span>Dev identity:</span>
      <input
        className="w-36 rounded border border-line bg-white px-2 py-1 font-mono"
        value={identity.studentId}
        onChange={(e) => onChange({ ...identity, studentId: e.target.value })}
      />
    </div>
  );
}
