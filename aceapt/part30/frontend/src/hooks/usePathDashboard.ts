import { useCallback, useEffect, useState } from "react";
import { type Identity, isEmptyState, pathApi } from "../api/client";
import type { EmptyStateResponse, PathDashboard } from "../types";

export type DashboardState =
  | { status: "loading" }
  | { status: "empty"; empty: EmptyStateResponse; identityKey: string }
  | { status: "ready"; data: PathDashboard; identityKey: string }
  | { status: "error"; message: string };

function keyOf(identity: Identity): string {
  return `${identity.tenantId}:${identity.studentId}`;
}

export function usePathDashboard(identity: Identity, targetId?: string) {
  const [state, setState] = useState<DashboardState>({ status: "loading" });
  const identityKey = keyOf(identity);

  const refresh = useCallback(async () => {
    // The "keep showing the last dashboard while revalidating" optimization
    // (avoids a loading flash on a plain recalculate/complete-action
    // refresh) must only apply within the SAME student. Across an identity
    // switch it would leave one student's data on screen -- and reachable
    // by a child effect -- while a different student's fetch is still in
    // flight, which is exactly the "wrong identity + stale target" bug this
    // hook used to have.
    setState((prev) => (prev.status === "ready" && prev.identityKey === identityKey ? prev : { status: "loading" }));
    try {
      const result = await pathApi.current(identity, targetId);
      if (isEmptyState(result)) {
        setState({ status: "empty", empty: result, identityKey });
      } else {
        setState({ status: "ready", data: result, identityKey });
      }
    } catch {
      // Section 54: never expose internal errors, never lose the student's
      // sense that their progress is safe.
      setState({ status: "error", message: "Path temporarily unavailable." });
    }
  }, [identity, targetId, identityKey]);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  return { state, refresh };
}

