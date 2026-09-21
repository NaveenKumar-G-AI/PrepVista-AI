import { useCallback, useEffect, useState } from "react";
import { api } from "./api/client";
import type { ApiError, ReadinessEvent, ReadinessState, RoleOption } from "./types";
import { EmptyState, ErrorState, LoadingState, UnauthorizedState } from "./components/common";
import { RoleSelect } from "./components/RoleSelect";
import { CapabilityGapsOverview } from "./components/CapabilityGapsOverview";
import { PriorityActions } from "./components/PriorityActions";
import { LogAssessmentForm } from "./components/LogAssessmentForm";

type LoadPhase = "loading" | "error" | "unauthorized" | "loaded";

export default function App() {
  const [phase, setPhase] = useState<LoadPhase>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [state, setState] = useState<ReadinessState | null>(null);
  const [events, setEvents] = useState<ReadinessEvent[]>([]);
  const [manualRoleChange, setManualRoleChange] = useState(false);
  const [submittingRole, setSubmittingRole] = useState(false);
  const [submittingAssessment, setSubmittingAssessment] = useState(false);
  const [busyRecommendationId, setBusyRecommendationId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setPhase("loading");
    try {
      const [rolesRes, stateRes] = await Promise.all([api.getRoles(), api.getState()]);
      setRoles(rolesRes.roles);
      setState(stateRes);
      setPhase("loaded");
      // Recent activity is a nice-to-have; fetch it without blocking the
      // main view or surfacing its own error UI if it fails.
      api
        .getEvents()
        .then((r) => setEvents(r.events))
        .catch(() => undefined);
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr.status === 401) {
        setPhase("unauthorized");
      } else {
        setErrorMessage(apiErr.message || "Something went wrong.");
        setPhase("error");
      }
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSelectRole(roleId: string) {
    setSubmittingRole(true);
    try {
      const next = await api.setTargetRole(roleId);
      setState(next);
      setManualRoleChange(false);
    } catch (err) {
      setErrorMessage((err as ApiError).message || "Couldn't save that.");
      setPhase("error");
    } finally {
      setSubmittingRole(false);
    }
  }

  async function handleLogAssessment(capabilityId: string, score: number) {
    setSubmittingAssessment(true);
    try {
      const next = await api.submitAssessment(capabilityId, score);
      setState(next);
    } catch (err) {
      setErrorMessage((err as ApiError).message || "Couldn't save that result.");
      setPhase("error");
    } finally {
      setSubmittingAssessment(false);
    }
  }

  async function handleComplete(recommendationId: string, resultScore?: number) {
    setBusyRecommendationId(recommendationId);
    try {
      const next = await api.completeRecommendation(recommendationId, resultScore);
      setState(next);
    } catch (err) {
      setErrorMessage((err as ApiError).message || "Couldn't update that recommendation.");
      setPhase("error");
    } finally {
      setBusyRecommendationId(null);
    }
  }

  async function handleSkip(recommendationId: string) {
    setBusyRecommendationId(recommendationId);
    try {
      const next = await api.skipRecommendation(recommendationId);
      setState(next);
    } catch (err) {
      setErrorMessage((err as ApiError).message || "Couldn't update that recommendation.");
      setPhase("error");
    } finally {
      setBusyRecommendationId(null);
    }
  }

  if (phase === "loading") return <LoadingState />;
  if (phase === "unauthorized") return <UnauthorizedState />;
  if (phase === "error") return <ErrorState message={errorMessage} onRetry={load} />;
  if (!state) return <LoadingState />;

  if (state.status === "NO_TARGET_ROLE" || manualRoleChange) {
    return <RoleSelect roles={roles} onSelect={handleSelectRole} submitting={submittingRole} />;
  }

  const capabilityOptions = state.gaps.map((g) => ({ capabilityId: g.capabilityId, capabilityName: g.capabilityName }));

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-5">
        <div>
          <h1 className="font-display text-2xl font-semibold">Readiness Radar</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Target role: <span className="font-medium text-ink">{state.targetRoleName}</span>
          </p>
        </div>
        <button
          onClick={() => setManualRoleChange(true)}
          className="text-xs font-medium text-ink-muted underline decoration-line underline-offset-4 hover:text-accent"
        >
          Change target role
        </button>
      </header>

      <main className="mt-6 space-y-8">
        {state.status === "INSUFFICIENT_DATA" ? (
          <EmptyState
            title="No analysis yet"
            body="Complete an assessment to generate a personalized readiness analysis for this role. In production this data flows in automatically from ACEAPT's assessments — use the form below to log one now."
            action={
              <LogAssessmentForm
                capabilities={capabilityOptions}
                submitting={submittingAssessment}
                onSubmit={handleLogAssessment}
              />
            }
          />
        ) : (
          <>
            <PriorityActions
              doFirst={state.recommendations.doFirst}
              doNext={state.recommendations.doNext}
              optional={state.recommendations.optional}
              busyId={busyRecommendationId}
              onComplete={handleComplete}
              onSkip={handleSkip}
            />

            <CapabilityGapsOverview gaps={state.gaps} />

            <section className="rounded-card border border-line bg-surface p-5">
              <h2 className="font-display text-base font-semibold">Log a new result</h2>
              <p className="mt-1 text-xs text-ink-muted">
                Stands in for ACEAPT's real assessment feed in this preview build.
              </p>
              <div className="mt-3">
                <LogAssessmentForm
                  capabilities={capabilityOptions}
                  submitting={submittingAssessment}
                  onSubmit={handleLogAssessment}
                  compact
                />
              </div>
            </section>

            {events.length > 0 && (
              <section aria-labelledby="activity-heading">
                <h2 id="activity-heading" className="font-display text-sm font-semibold text-ink-muted">
                  Recent activity
                </h2>
                <ul className="mt-2 space-y-1 text-xs text-ink-faint">
                  {events.slice(0, 6).map((e) => (
                    <li key={e.id} className="tabular">
                      {new Date(e.createdAt).toLocaleString()} — {e.type.replace(/_/g, " ").toLowerCase()}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>

      <footer className="mt-10 border-t border-line pt-4 text-xs text-ink-faint">
        Last analyzed {new Date(state.generatedAt).toLocaleString()}
      </footer>
    </div>
  );
}
