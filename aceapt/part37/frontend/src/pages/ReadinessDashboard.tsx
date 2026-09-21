import { useCallback, useEffect, useState } from 'react';
import { ApiError, readinessClient } from '../api/readinessClient';
import { CapabilityMap } from '../components/CapabilityMap';
import { NextProofCard } from '../components/NextProofCard';
import { OpportunityReadinessCard } from '../components/OpportunityReadinessCard';
import { ReadinessGapPanel } from '../components/ReadinessGapPanel';
import { ReadinessHero } from '../components/ReadinessHero';
import { ReadinessJourneyTimeline } from '../components/ReadinessJourneyTimeline';
import { EmptyState } from '../components/shared';
import type { NextProofRecommendation, ReadinessDTO, TargetRole } from '../types';

function PageSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading readiness">
      {[220, 140, 260, 160].map((h, i) => (
        <div key={i} className="animate-pulse rounded-card border border-paper-line bg-paper-dim" style={{ height: h }} />
      ))}
    </div>
  );
}

function FailureState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <EmptyState
      title="Readiness analysis is temporarily unavailable"
      description={message}
      action={
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 rounded-full border border-ink px-4 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-ink hover:text-paper"
        >
          Try again
        </button>
      }
    />
  );
}

/**
 * Mobile-priority order per the brief (section 47): target role + readiness
 * + why (all in the Hero) → top gap → next proof → deeper evidence (the
 * capability map) → journey. Desktop gets the same order; it just has more
 * room, so nothing needs re-flowing between breakpoints.
 */
export function ReadinessDashboard({ studentId }: { studentId: string }) {
  const [roles, setRoles] = useState<TargetRole[] | null>(null);
  const [rolesError, setRolesError] = useState<string | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);

  const [readiness, setReadiness] = useState<ReadinessDTO | null>(null);
  const [readinessError, setReadinessError] = useState<string | null>(null);
  const [loadToken, setLoadToken] = useState(0);

  const loadRoles = useCallback(() => {
    setRolesError(null);
    setRoles(null);
    readinessClient
      .listTargetRoles(studentId)
      .then((res) => {
        setRoles(res.roles);
        setSelectedRoleId((current) => current ?? res.roles.find((r) => r.isPrimary)?.roleId ?? res.roles[0]?.roleId ?? null);
      })
      .catch(() => setRolesError('Could not load your target roles right now.'));
  }, [studentId]);

  useEffect(loadRoles, [loadRoles]);

  useEffect(() => {
    if (!selectedRoleId) return;
    setReadiness(null);
    setReadinessError(null);
    readinessClient
      .getRoleReadiness(studentId, selectedRoleId)
      .then(setReadiness)
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 404) {
          setReadinessError('This target role could not be found.');
        } else {
          setReadinessError('Please try again in a moment.');
        }
      });
  }, [studentId, selectedRoleId, loadToken]);

  const retryReadiness = () => setLoadToken((t) => t + 1);

  const handleStartProof = (proof: NextProofRecommendation) => {
    // Placeholder: in a real integration this is where Feature 36 takes over
    // (launching the actual simulation/coding test/project flow named by
    // proof.actionRef). Left as a callback so the host app can wire it up
    // without touching this component.
    // eslint-disable-next-line no-console
    console.info('[feature-37] start validation requested', proof);
  };

  if (rolesError) {
    return <FailureState message={rolesError} onRetry={loadRoles} />;
  }

  if (roles === null) {
    return <PageSkeleton />;
  }

  if (roles.length === 0) {
    return (
      <EmptyState
        title="Your readiness profile is still forming."
        description="Once a target role is set, ACEAPT starts mapping your evidence against what that role actually requires."
      />
    );
  }

  return (
    <div className="space-y-5">
      {roles.length > 1 && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Target roles">
          {roles.map((r) => (
            <button
              key={r.roleId}
              type="button"
              role="tab"
              aria-selected={r.roleId === selectedRoleId}
              onClick={() => setSelectedRoleId(r.roleId)}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                r.roleId === selectedRoleId ? 'border-ink bg-ink text-paper' : 'border-paper-line bg-white/60 text-ink/70 hover:bg-paper-dim/50'
              }`}
            >
              {r.roleName}
            </button>
          ))}
        </div>
      )}

      {readinessError && <FailureState message={readinessError} onRetry={retryReadiness} />}

      {!readinessError && readiness === null && <PageSkeleton />}

      {!readinessError && readiness && (
        <>
          <ReadinessHero data={readiness} />
          <ReadinessGapPanel gaps={readiness.gaps} />
          <NextProofCard nextProof={readiness.nextProof} onStart={handleStartProof} />
          <CapabilityMap studentId={studentId} roleId={readiness.roleId} statuses={readiness.capabilityStatuses} />
          <ReadinessJourneyTimeline studentId={studentId} roleId={readiness.roleId} />
          {/* opportunityIds intentionally empty by default — see OpportunityReadinessCard. */}
          <OpportunityReadinessCard studentId={studentId} opportunityIds={[]} />
        </>
      )}
    </div>
  );
}
