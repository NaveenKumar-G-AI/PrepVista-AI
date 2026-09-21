import type { ProofApiConfig } from '../api/proofApi.js';
import { useProof } from '../hooks/useProof.js';
import { ReadinessHero } from './ReadinessHero.js';
import { EvidenceBreakdown } from './EvidenceBreakdown.js';
import { ProofHistoryTimeline } from './ProofHistoryTimeline.js';
import { PreSimulationScreen } from './PreSimulationScreen.js';
import { VerificationResultScreen } from './VerificationResultScreen.js';
import { DefaultSimulationRunner, type SimulationRunnerProps } from './DefaultSimulationRunner.js';

// Note: this module does NOT import '../theme/tokens.css' itself. A leaf
// component silently pulling in a global stylesheet is surprising for
// whatever imports it (including this file's own SSR tests, which run
// under plain Node ESM rather than a bundler that understands CSS
// imports). Import src/theme/tokens.css once, wherever the host app already
// sets up its global styles — see README.md.

export interface ProofDashboardProps {
  api: ProofApiConfig;
  targetId: string;
  /** Section 47 — reuse the host app's existing assessment-taking UI
   *  instead of PROOF reinventing question rendering/navigation/timers.
   *  Defaults to a clearly-labeled placeholder runner if omitted. */
  SimulationRunner?: (props: SimulationRunnerProps) => JSX.Element;
  /** Section 35 — routes a not-verified result into the existing adaptive
   *  intervention UI (Feature 26 / Adapt), which this feature does not own. */
  onFixTheGap?: (interventionId: string | null) => void;
}

/** Section 25 hierarchy: header (implicit, via the host page) → readiness
 *  status → evidence summary → key strengths/gaps → proof history → next
 *  action. Every screen shown here reflects real backend state; nothing is
 *  computed client-side beyond simple formatting. */
export function ProofDashboard({ api, targetId, SimulationRunner = DefaultSimulationRunner, onFixTheGap }: ProofDashboardProps) {
  const proof = useProof({ api, targetId });

  if (proof.error) {
    return (
      <div className="proof-root" style={{ padding: 24, color: 'var(--proof-gap)' }}>
        Something went wrong loading your PROOF status: {proof.error}
      </div>
    );
  }

  if (!proof.status) {
    return (
      <div className="proof-root" style={{ padding: 24, color: 'var(--proof-ink-soft)' }}>
        Analyzing your evidence…
      </div>
    );
  }

  if (proof.view === 'pre-simulation' && proof.plan) {
    return (
      <PreSimulationScreen
        plan={proof.plan}
        onStart={proof.beginSimulation}
        onCancel={proof.backToHero}
        busy={proof.loading}
      />
    );
  }

  if (proof.view === 'simulation' && proof.plan && proof.sessionId) {
    return (
      <SimulationRunner
        plan={proof.plan}
        onSubmitResponse={(response) => proof.recordResponse({ sessionId: proof.sessionId!, ...response })}
        onComplete={proof.finishSimulation}
      />
    );
  }

  if (proof.view === 'result' && proof.outcome) {
    return (
      <VerificationResultScreen
        outcome={proof.outcome}
        onViewEvidence={proof.backToHero}
        onFixTheGap={() => onFixTheGap?.(proof.outcome!.adaptResponse?.interventionId ?? null)}
        onProveAgain={() => {
          proof.backToHero();
          proof.proveReadiness();
        }}
      />
    );
  }

  return (
    <div className="proof-root">
      <ReadinessHero status={proof.status} onProveReadiness={proof.proveReadiness} busy={proof.loading} />
      {proof.status.hasResult && proof.status.result && (
        <EvidenceBreakdown factors={proof.status.result.factors} />
      )}
      <ProofHistoryTimeline history={proof.history} />
    </div>
  );
}
