import { useState } from "react";
import { DEMO_IDENTITIES, DEMO_TARGETS, type Identity, pathApi } from "./api/client";
import { usePathDashboard } from "./hooks/usePathDashboard";
import { PathDashboardView } from "./components/PathDashboardView";
import { EmptyState, ErrorState, LoadingState } from "./components/StatePanels";

function keyOf(identity: Identity): string {
  return `${identity.tenantId}:${identity.studentId}`;
}

export default function App() {
  const [identity, setIdentity] = useState<Identity>(DEMO_IDENTITIES[0]);
  const [targetOverride, setTargetOverride] = useState<string | undefined>(undefined);
  const { state, refresh } = usePathDashboard(identity, targetOverride);

  function switchIdentity(next: Identity) {
    setIdentity(next);
    setTargetOverride(undefined);
  }

  // Guards a real, one-render race: when `identity` changes, this component
  // re-renders immediately with the new identity, but `state` (owned by
  // usePathDashboard, updated from its own effect) hasn't caught up yet and
  // still holds the *previous* student's ready data for that one render.
  // Rendering PathDashboardView in that window would hand it a consistent-
  // looking but actually mismatched (new identity, old target) prop pair,
  // and its own effect would fire a request for a path that doesn't exist.
  // Falling back to a loading state here means PathDashboardView only ever
  // mounts once `state` is confirmed to belong to the current identity.
  const currentKey = keyOf(identity);
  const showReady = state.status === "ready" && state.identityKey === currentKey;
  const showEmpty = state.status === "empty" && state.identityKey === currentKey;
  const showLoading = !showReady && !showEmpty && state.status !== "error";

  return (
    <div className="min-h-screen">
      <header className="border-b border-base-border">
        <div className="max-w-4xl mx-auto px-5 py-3 flex items-center justify-between">
          <span className="font-display text-lg italic text-ink-1">ACEAPT</span>
          <div className="flex gap-1.5">
            {DEMO_IDENTITIES.map((id) => (
              <button
                key={id.studentId}
                onClick={() => switchIdentity(id)}
                className={`text-xs font-body rounded-full px-3 py-1.5 border transition-colors ${
                  id.studentId === identity.studentId ? "border-route text-route bg-route/5" : "border-base-border text-ink-3 hover:text-ink-2"
                }`}
              >
                {id.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-5 py-8">
        {state.status === "error" && <ErrorState onRetry={refresh} />}

        {showLoading && <LoadingState />}

        {showEmpty && state.status === "empty" && (
          <EmptyState
            message={state.empty.message}
            detail={state.empty.detail}
            onExplore={async () => {
              await pathApi.selectTarget(identity, DEMO_TARGETS.dataAnalyst, "PRIMARY", 45);
              await refresh();
            }}
          />
        )}

        {showReady && state.status === "ready" && (
          <PathDashboardView
            identity={identity}
            data={state.data}
            onRefresh={refresh}
            onSwitchTarget={async (targetId) => {
              // Setting targetOverride alone is enough -- usePathDashboard's
              // effect depends on it and will refetch with the new id on
              // the next render. Calling refresh() here too would just
              // re-fetch with the stale (pre-update) targetOverride from
              // this closure.
              setTargetOverride(targetId);
            }}
          />
        )}
      </main>
    </div>
  );
}
