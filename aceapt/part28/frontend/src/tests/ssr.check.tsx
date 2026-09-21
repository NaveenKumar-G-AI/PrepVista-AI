// Real React server-side rendering, executed — not a description of what
// would happen. Renders every component across every meaningful branch and
// fails loudly (non-zero exit) if any of them throws or omits expected
// content. Run with: npx tsx src/tests/ssr.check.tsx

import React from 'react';
import { renderToString } from 'react-dom/server';
import { EvidenceStackVisual } from '../components/EvidenceStackVisual.js';
import { ReadinessHero } from '../components/ReadinessHero.js';
import { EvidenceBreakdown } from '../components/EvidenceBreakdown.js';
import { PreSimulationScreen } from '../components/PreSimulationScreen.js';
import { VerificationResultScreen } from '../components/VerificationResultScreen.js';
import { ProofHistoryTimeline } from '../components/ProofHistoryTimeline.js';
import { DefaultSimulationRunner } from '../components/DefaultSimulationRunner.js';
import { ProofDashboard } from '../components/ProofDashboard.js';
import type {
  VerificationFactor, ProofStatus, TargetedVerificationPlan, CompleteVerificationResponse, ProofSnapshot,
} from '../api/types.js';

let failures = 0;
let checks = 0;

function check(name: string, render: () => string, expectSubstrings: string[]) {
  checks += 1;
  try {
    const html = render();
    for (const substring of expectSubstrings) {
      if (!html.includes(substring)) {
        failures += 1;
        console.error(`FAIL  ${name} — missing expected content: "${substring}"`);
        return;
      }
    }
    console.log(`PASS  ${name}`);
  } catch (err) {
    failures += 1;
    console.error(`FAIL  ${name} — threw: ${(err as Error).message}`);
  }
}

const strongFactors: VerificationFactor[] = [
  { name: 'Target Capability', score: 0.92, weight: 0.3, threshold: 0.8, meetsRequirement: true, explanation: 'Strong.' },
  { name: 'Novel Performance', score: 0.9, weight: 0.2, threshold: 0.8, meetsRequirement: true, explanation: 'Strong.' },
  { name: 'Timed Performance', score: 0.88, weight: 0.2, threshold: 0.7, meetsRequirement: true, explanation: 'Strong.' },
  { name: 'Consistency', score: 0.95, weight: 0.2, threshold: 0.7, meetsRequirement: true, explanation: 'Strong.' },
  { name: 'Critical Risk', score: 0.85, weight: 0.1, threshold: 0.7, meetsRequirement: true, explanation: 'No risk.' },
];

const weakFactors: VerificationFactor[] = [
  { name: 'Target Capability', score: 0.6, weight: 0.3, threshold: 0.8, meetsRequirement: false, explanation: 'Below target.' },
  { name: 'Novel Performance', score: 0.4, weight: 0.2, threshold: 0.8, meetsRequirement: false, explanation: 'Below target.' },
  { name: 'Timed Performance', score: 0.7, weight: 0.2, threshold: 0.7, meetsRequirement: true, explanation: 'Meets bar.' },
  { name: 'Consistency', score: 0.65, weight: 0.2, threshold: 0.7, meetsRequirement: false, explanation: 'Too variable.' },
  { name: 'Critical Risk', score: 0.85, weight: 0.1, threshold: 0.7, meetsRequirement: true, explanation: 'No risk.' },
];

// --- EvidenceStackVisual ---
check('EvidenceStackVisual (sealed)', () => renderToString(<EvidenceStackVisual factors={strongFactors} sealed />), ['Target Capability', 'svg']);
check('EvidenceStackVisual (not sealed)', () => renderToString(<EvidenceStackVisual factors={weakFactors} sealed={false} />), ['Novel Performance']);

// --- ReadinessHero ---
const noResultStatus: ProofStatus = { hasResult: false, message: 'No verification attempted yet for this target.' };
const verifiedStatus: ProofStatus = {
  hasResult: true,
  agingState: 'VERIFIED',
  result: {
    id: 'r1', status: 'VERIFIED', confidence: 'HIGH', factors: strongFactors,
    evidenceSummary: { byType: {}, totalCount: 10, overallQuality: 0.9 }, failureSignatures: [],
    explanation: 'Meets criteria.', createdAt: new Date().toISOString(),
  },
};
const conditionalStatus: ProofStatus = {
  hasResult: true,
  agingState: 'RECHECK_RECOMMENDED',
  result: {
    id: 'r2', status: 'CONDITIONALLY_VERIFIED', confidence: 'MEDIUM', factors: weakFactors,
    evidenceSummary: { byType: {}, totalCount: 6, overallQuality: 0.6 }, failureSignatures: [],
    explanation: 'Not yet.', createdAt: new Date().toISOString(),
  },
};
const agingVerifiedStatus: ProofStatus = { ...verifiedStatus, agingState: 'AGING' };

check('ReadinessHero (never attempted)', () => renderToString(<ReadinessHero status={noResultStatus} onProveReadiness={() => {}} />), ['Prove my readiness']);
check('ReadinessHero (verified)', () => renderToString(<ReadinessHero status={verifiedStatus} onProveReadiness={() => {}} />), ['Readiness verified']);
check('ReadinessHero (conditionally verified)', () => renderToString(<ReadinessHero status={conditionalStatus} onProveReadiness={() => {}} />), ['Not yet verified']);
check('ReadinessHero (aging)', () => renderToString(<ReadinessHero status={agingVerifiedStatus} onProveReadiness={() => {}} />), ['aging']);
check('ReadinessHero (busy)', () => renderToString(<ReadinessHero status={noResultStatus} onProveReadiness={() => {}} busy />), ['Analyzing your evidence']);

// --- EvidenceBreakdown ---
check('EvidenceBreakdown', () => renderToString(<EvidenceBreakdown factors={weakFactors} />), ['Target Capability', 'Consistency']);

// --- PreSimulationScreen ---
const plan: TargetedVerificationPlan = {
  capability: 'arrays_and_strings', condition: 'TIME_PRESSURE', novelty: 'NOVEL', durationMinutes: 15,
  reason: 'Your strongest evidence is in practice, but timed performance needs verification.',
  evidenceSufficient: false, simulationProfile: { mode: 'QUICK_VERIFICATION', questionCount: 8 },
};
check('PreSimulationScreen', () => renderToString(<PreSimulationScreen plan={plan} onStart={() => {}} onCancel={() => {}} />), ['Time pressure', '15 minutes', '8']);

// --- VerificationResultScreen ---
const verifiedOutcome: CompleteVerificationResponse = {
  result: verifiedStatus.result!, narrative: 'You met the bar.', snapshot: null, adaptResponse: null, alreadyCompleted: false,
};
const failedOutcome: CompleteVerificationResponse = {
  result: {
    ...conditionalStatus.result!,
    failureSignatures: [{ type: 'SPEED_GAP', evidenceRefs: [], explanation: 'Timed performance falls short.' }],
  },
  narrative: 'Not yet verified — timed performance is the main blocker.', snapshot: null, adaptResponse: { interventionId: 'i1', accepted: true }, alreadyCompleted: false,
};
check('VerificationResultScreen (verified)', () => renderToString(<VerificationResultScreen outcome={verifiedOutcome} onViewEvidence={() => {}} onFixTheGap={() => {}} onProveAgain={() => {}} />), ['READINESS VERIFIED']);
check('VerificationResultScreen (not verified)', () => renderToString(<VerificationResultScreen outcome={failedOutcome} onViewEvidence={() => {}} onFixTheGap={() => {}} onProveAgain={() => {}} />), ['Fix the gap', 'Main limitation']);

// --- ProofHistoryTimeline ---
const history: ProofSnapshot[] = [
  { id: 's1', status: 'EMERGING_EVIDENCE', confidence: 'LOW', verifiedAt: null, agingState: 'RECHECK_RECOMMENDED', createdAt: new Date(Date.now() - 86400000 * 3).toISOString() },
  { id: 's2', status: 'VERIFIED', confidence: 'HIGH', verifiedAt: new Date().toISOString(), agingState: 'VERIFIED', createdAt: new Date().toISOString() },
];
check('ProofHistoryTimeline (with entries)', () => renderToString(<ProofHistoryTimeline history={history} />), ['Verified', 'Emerging evidence']);
check('ProofHistoryTimeline (empty renders nothing, no throw)', () => renderToString(<ProofHistoryTimeline history={[]} />) || 'ok', ['ok']);

// --- DefaultSimulationRunner ---
check('DefaultSimulationRunner (initial render)', () => renderToString(<DefaultSimulationRunner plan={plan} onSubmitResponse={async () => {}} onComplete={async () => {}} />), ['Question 1 of 8']);

// --- ProofDashboard (top-level export) ---
// useEffect does not run during SSR, so this only exercises the initial
// (pre-fetch) loading render — the real fetch-driven branches are already
// covered by ReadinessHero/EvidenceBreakdown/etc. above, which is what
// ProofDashboard renders once data arrives.
check(
  'ProofDashboard (initial loading render, no throw with no live backend)',
  () => renderToString(<ProofDashboard api={{ baseUrl: 'http://example.invalid', getAuthHeader: () => 'Dev x:STUDENT' }} targetId="t1" />),
  ['Analyzing your evidence'],
);

console.log(`\n${checks - failures}/${checks} SSR render-branch checks passed.`);
if (failures > 0) {
  process.exit(1);
}
