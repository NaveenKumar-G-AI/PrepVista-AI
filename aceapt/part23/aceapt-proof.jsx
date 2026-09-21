import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ChevronRight, ChevronDown, ArrowRight, RotateCcw, Sparkles, Timer, Info, X, Check,
  ShieldCheck, ListChecks, History as HistoryIcon, AlertTriangle,
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, ReferenceLine, Tooltip, CartesianGrid,
} from 'recharts';

/* ==================================================================
 * ACEAPT PROOF — Adaptive Readiness & Real-World Performance
 * Certification Engine (Feature 23)
 *
 * WHAT'S REAL IN THIS BUILD
 *  - The readiness engine (evaluateGate / evaluateReadiness), blocker
 *    ranking, next-proof selection and the Pathfinder signal are all
 *    genuinely computed from the evidence records below — nothing is
 *    a hardcoded outcome. Take the "timed" proof and answer badly on
 *    purpose: readiness will NOT flip to Ready, because the engine
 *    doesn't know this is a demo.
 *  - The 6-question timed proof is real, verified aptitude content,
 *    scored against real answer keys.
 *
 * WHAT'S MOCKED (no existing ACEAPT/PrepVista codebase was available
 * to audit in this environment, per the brief's own instructions —
 * see buildSeedEvidenceStore / buildSeedSnapshots below)
 *  - "Existing student evidence" is seeded, not pulled from a real
 *    assessment history.
 *  - Only the Timed Performance gate has an interactive proof wired
 *    up end-to-end (the Startupthon vertical slice). Other gates show
 *    real, live-computed status but their proof flows are stubbed —
 *    see the `proof.gate !== 'timed'` note in DashboardView.
 *  - Feature 22 Pathfinder is represented as the structured signal
 *    + recommended-action text this engine would hand off to it.
 *
 * WHERE TO PLUG IN REAL SERVICES LATER — see CONFIG below.
 * ================================================================== */

const CONFIG = {
  API_BASE_URL: "",            // real evidence / assessment backend
  AI_EXPLANATION_API_KEY: "",  // optional LLM pass over "Why" copy —
                                // the DECISION itself must stay
                                // deterministic (see explainBlocker)
  PATHFINDER_WEBHOOK_URL: "",  // Feature 22 signal delivery
};

/* ------------------------------------------------------------------
 * Domain configuration
 * ------------------------------------------------------------------ */
const GATE_ORDER = ['mastery', 'transfer', 'retention', 'timed', 'simulation'];
const GATE_LABELS = {
  mastery: 'Mastery', transfer: 'Transfer', retention: 'Retention',
  timed: 'Timed Performance', simulation: 'Simulation',
};
const GATE_SHORT = { mastery: 'MST', transfer: 'XFR', retention: 'RTN', timed: 'TMD', simulation: 'SIM' };

const TARGETS = {
  placement: {
    id: 'placement', name: 'Campus Placement Aptitude', skills: ['Quant', 'Logical', 'Verbal'],
    thresholds: { mastery: .78, transfer: .72, retention: .70, timed: .70, simulation: .72 },
    minEvidence: { mastery: 4, transfer: 4, retention: 3, timed: 3, simulation: 2 },
  },
  techScreen: {
    id: 'techScreen', name: 'Tech Company Screening', skills: ['Quant', 'Logical'],
    thresholds: { mastery: .82, transfer: .78, retention: .75, timed: .75, simulation: .78 },
    minEvidence: { mastery: 4, transfer: 4, retention: 3, timed: 3, simulation: 2 },
  },
};

const STATE_LABEL = {
  INSUFFICIENT_EVIDENCE: 'Not Enough Evidence Yet',
  DEVELOPING: 'Developing',
  NEAR_READY: 'Almost Ready',
  READY: 'Ready',
  HIGH_CONFIDENCE_READY: 'Ready',
  AT_RISK: 'Readiness at Risk',
};

const GATE_STATUS_LABEL = {
  INSUFFICIENT_EVIDENCE: 'Not tested yet',
  UNSTABLE: 'Inconsistent',
  NEEDS_WORK: 'Needs work',
  DEVELOPING: 'Developing',
  PASS: 'Proven',
};

const STATUS_COLOR = {
  PASS: 'var(--proven)',
  DEVELOPING: 'var(--developing)',
  NEEDS_WORK: 'var(--needs)',
  UNSTABLE: 'var(--needs)',
  INSUFFICIENT_EVIDENCE: 'var(--untested)',
};

const PROOF_CATALOG = {
  timed: { label: 'Timed mixed assessment', itemCount: 6, seconds: 150, source: 'timed_drill' },
  transfer: { label: 'Novel-context transfer set', itemCount: 6, seconds: 480, source: 'transfer_task' },
  retention: { label: 'Retention check', itemCount: 6, seconds: 360, source: 'retention_check' },
  mastery: { label: 'Focused skill drill', itemCount: 8, seconds: 420, source: 'practice' },
  simulation: { label: 'Full mixed simulation', itemCount: 30, seconds: 2100, source: 'simulation' },
};

const STORAGE_KEY = 'aceapt-proof-state-v1';

/* ------------------------------------------------------------------
 * Seed evidence — stands in for "existing student evidence" until
 * this is wired to a real assessment/evidence backend.
 * ------------------------------------------------------------------ */
function buildSeedEvidenceStore() {
  const now = new Date();
  const d = (n) => { const x = new Date(now); x.setDate(x.getDate() - n); return x.toISOString(); };
  let idc = 1;
  const rec = (o) => ({ id: 'ev' + (idc++), ...o });
  return {
    placement: {
      mastery: [
        rec({ source: 'practice', timestamp: d(40), skill: 'Quant', difficulty: 'medium', novelty: 'familiar', timed: false, itemCount: 12, score: .82 }),
        rec({ source: 'practice', timestamp: d(33), skill: 'Logical', difficulty: 'medium', novelty: 'familiar', timed: false, itemCount: 10, score: .85 }),
        rec({ source: 'assessment', timestamp: d(26), skill: 'Verbal', difficulty: 'medium', novelty: 'varied', timed: false, itemCount: 15, score: .88 }),
        rec({ source: 'practice', timestamp: d(19), skill: 'Quant', difficulty: 'hard', novelty: 'varied', timed: false, itemCount: 10, score: .84 }),
        rec({ source: 'assessment', timestamp: d(12), skill: 'Logical', difficulty: 'hard', novelty: 'varied', timed: false, itemCount: 12, score: .90 }),
      ],
      transfer: [
        rec({ source: 'transfer_task', timestamp: d(35), skill: 'Quant', difficulty: 'medium', novelty: 'novel', timed: false, itemCount: 8, score: .75 }),
        rec({ source: 'transfer_task', timestamp: d(28), skill: 'Logical', difficulty: 'medium', novelty: 'novel', timed: false, itemCount: 8, score: .79 }),
        rec({ source: 'transfer_task', timestamp: d(21), skill: 'Verbal', difficulty: 'hard', novelty: 'novel', timed: false, itemCount: 6, score: .81 }),
        rec({ source: 'mixed_practice', timestamp: d(14), skill: 'Quant', difficulty: 'hard', novelty: 'novel', timed: false, itemCount: 8, score: .77 }),
        rec({ source: 'transfer_task', timestamp: d(7), skill: 'Logical', difficulty: 'hard', novelty: 'novel', timed: false, itemCount: 8, score: .80 }),
      ],
      retention: [
        rec({ source: 'retention_check', timestamp: d(30), skill: 'Quant', difficulty: 'medium', novelty: 'varied', timed: false, itemCount: 10, score: .74 }),
        rec({ source: 'retention_check', timestamp: d(16), skill: 'Logical', difficulty: 'medium', novelty: 'varied', timed: false, itemCount: 10, score: .71 }),
        rec({ source: 'retention_check', timestamp: d(5), skill: 'Verbal', difficulty: 'medium', novelty: 'varied', timed: false, itemCount: 10, score: .76 }),
      ],
      simulation: [
        rec({ source: 'simulation', timestamp: d(20), skill: 'Quant', difficulty: 'hard', novelty: 'varied', timed: true, itemCount: 30, score: .80 }),
        rec({ source: 'simulation', timestamp: d(6), skill: 'Logical', difficulty: 'hard', novelty: 'varied', timed: true, itemCount: 30, score: .85 }),
      ],
      timed: [
        rec({ source: 'timed_drill', timestamp: d(25), skill: 'Quant', difficulty: 'medium', novelty: 'varied', timed: true, itemCount: 8, score: .60 }),
        rec({ source: 'timed_drill', timestamp: d(18), skill: 'Logical', difficulty: 'medium', novelty: 'varied', timed: true, itemCount: 8, score: .58 }),
        rec({ source: 'timed_drill', timestamp: d(10), skill: 'Quant', difficulty: 'hard', novelty: 'varied', timed: true, itemCount: 8, score: .65 }),
      ],
    },
    techScreen: {
      mastery: [
        rec({ source: 'practice', timestamp: d(20), skill: 'Quant', difficulty: 'hard', novelty: 'varied', timed: false, itemCount: 10, score: .80 }),
        rec({ source: 'practice', timestamp: d(12), skill: 'Logical', difficulty: 'hard', novelty: 'varied', timed: false, itemCount: 10, score: .78 }),
      ],
      transfer: [], retention: [], simulation: [], timed: [],
    },
  };
}

function buildSeedSnapshots() {
  const now = new Date();
  const d = (n) => { const x = new Date(now); x.setDate(x.getDate() - n); return x.toISOString(); };
  return [
    { id: 'sn1', target: 'placement', timestamp: d(42), state: 'DEVELOPING', primaryBlocker: 'mastery', reason: 'Conceptual mastery was below target across Quant and Logical. Not enough transfer or timed evidence existed yet to score those gates.' },
    { id: 'sn2', target: 'placement', timestamp: d(21), state: 'DEVELOPING', primaryBlocker: 'timed', reason: 'Mastery, Transfer and Retention cleared their bars. Timed Performance became the open gap.' },
    { id: 'sn3', target: 'placement', timestamp: d(6), state: 'NEAR_READY', primaryBlocker: 'timed', reason: 'Every gate but Timed Performance was proven. Timed accuracy was still well below target.' },
  ];
}

/* ------------------------------------------------------------------
 * Deterministic readiness engine
 * (thresholds, aggregation, gates, transitions — no LLM in this path)
 * ------------------------------------------------------------------ */
function mean(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }
function stdDev(arr) { const m = mean(arr); return Math.sqrt(mean(arr.map((x) => (x - m) ** 2))); }
function recencyWeight(timestamp, now) {
  const days = (now - new Date(timestamp)) / 86400000;
  return Math.max(0.08, Math.pow(0.5, days / 7));
}

function evaluateGate(records, threshold, minEvidence, now) {
  if (records.length === 0) {
    return { status: 'INSUFFICIENT_EVIDENCE', confidence: 'LOW', score: null, n: 0, sd: null, highConfidencePass: false };
  }
  const weights = records.map((r) => recencyWeight(r.timestamp, now));
  const scores = records.map((r) => r.score);
  const wsum = weights.reduce((a, b) => a + b, 0);
  const weightedScore = scores.reduce((s, x, i) => s + x * weights[i], 0) / wsum;
  const sd = stdDev(scores);
  const n = records.length;

  if (n < minEvidence) {
    return { status: 'INSUFFICIENT_EVIDENCE', confidence: 'LOW', score: weightedScore, n, sd, highConfidencePass: false };
  }

  let confidence;
  if (n >= 5 && sd <= 0.07) confidence = 'HIGH';
  else if (n >= 3 && sd <= 0.15) confidence = 'MEDIUM';
  else confidence = 'LOW';

  let status;
  if (sd > 0.18) status = 'UNSTABLE';
  else if (weightedScore >= threshold) status = 'PASS';
  else if (weightedScore >= threshold - 0.15) status = 'DEVELOPING';
  else status = 'NEEDS_WORK';

  return { status, confidence, score: weightedScore, n, sd, highConfidencePass: status === 'PASS' && confidence === 'HIGH' };
}

function evaluateReadiness(target, evidenceByGate, now, priorState) {
  const cfg = TARGETS[target];
  const gates = {};
  for (const g of GATE_ORDER) gates[g] = evaluateGate(evidenceByGate[g] || [], cfg.thresholds[g], cfg.minEvidence[g], now);

  const statuses = GATE_ORDER.map((g) => gates[g].status);
  const passCount = statuses.filter((s) => s === 'PASS').length;
  const insufficientCount = statuses.filter((s) => s === 'INSUFFICIENT_EVIDENCE').length;
  const allHighConfPass = GATE_ORDER.every((g) => gates[g].highConfidencePass);

  let state;
  if (passCount === GATE_ORDER.length) state = allHighConfPass ? 'HIGH_CONFIDENCE_READY' : 'READY';
  else if (passCount === GATE_ORDER.length - 1 && insufficientCount === 0) state = 'NEAR_READY';
  else if (insufficientCount >= Math.ceil(GATE_ORDER.length / 2)) state = 'INSUFFICIENT_EVIDENCE';
  else state = 'DEVELOPING';

  const rank = { INSUFFICIENT_EVIDENCE: 0, DEVELOPING: 1, AT_RISK: 1.5, NEAR_READY: 2, READY: 3, HIGH_CONFIDENCE_READY: 4 };
  if (priorState && rank[priorState] >= rank.READY && rank[state] < rank.READY) state = 'AT_RISK';

  return { target, state, gates, evaluatedAt: now.toISOString() };
}

function identifyBlockers(readiness) {
  const cfg = TARGETS[readiness.target];
  return GATE_ORDER
    .filter((g) => readiness.gates[g].status !== 'PASS')
    .map((g) => {
      const gate = readiness.gates[g];
      const threshold = cfg.thresholds[g];
      const gap = gate.score == null ? null : +(threshold - gate.score).toFixed(4);
      const severity = gate.status === 'INSUFFICIENT_EVIDENCE' ? 3
        : gate.status === 'UNSTABLE' ? 2.5
        : gate.status === 'NEEDS_WORK' ? 2 : 1;
      return { gate: g, ...gate, threshold, gap, severity };
    })
    .sort((a, b) => b.severity - a.severity || (b.gap ?? 0) - (a.gap ?? 0) || GATE_ORDER.indexOf(a.gate) - GATE_ORDER.indexOf(b.gate));
}

function nextBestProof(blocker) {
  if (!blocker) return null;
  return { gate: blocker.gate, ...PROOF_CATALOG[blocker.gate] };
}

function pct(x) { return x == null ? '—' : Math.round(x * 100) + '%'; }

function comparableUntimed(evidenceForTarget) {
  const pool = [...(evidenceForTarget.mastery || []), ...(evidenceForTarget.transfer || [])];
  if (!pool.length) return null;
  return pool.reduce((s, r) => s + r.score, 0) / pool.length;
}

function explainBlocker(blocker, evidenceForTarget, target) {
  if (!blocker) return 'Every gate is proven for this target. No open blocker right now.';
  const label = GATE_LABELS[blocker.gate];
  if (blocker.status === 'INSUFFICIENT_EVIDENCE') {
    return `There isn't enough ${label.toLowerCase()} evidence yet for ${TARGETS[target].name} — ${blocker.n} recorded attempt${blocker.n === 1 ? '' : 's'} so far. A few varied attempts are needed before this gate can be scored.`;
  }
  if (blocker.gate === 'timed') {
    const cu = comparableUntimed(evidenceForTarget);
    if (cu != null) {
      return `Untimed accuracy on comparable topics is ${pct(cu)}, but timed accuracy is ${pct(blocker.score)}. That gap points at execution under pressure, not concept knowledge — the concepts are already there.`;
    }
  }
  if (blocker.status === 'UNSTABLE') {
    return `${label} performance is swinging too widely (roughly ${Math.round(blocker.sd * 100)} points of spread) to call it proven or not yet. More evidence should settle which side it lands on.`;
  }
  return `Recent ${label.toLowerCase()} evidence sits at ${pct(blocker.score)}, below the ${pct(blocker.threshold)} bar ${TARGETS[target].name} requires.`;
}

function confidenceNote(blocker) {
  if (!blocker) return null;
  if (blocker.confidence === 'HIGH') return `High confidence — consistent across ${blocker.n} attempts.`;
  if (blocker.confidence === 'MEDIUM') return `Medium confidence — evidence is limited (${blocker.n} attempt${blocker.n === 1 ? '' : 's'} so far).`;
  return `Low confidence — too little or too inconsistent evidence to be sure yet.`;
}

function recommendedActionText(readiness, primary, proof) {
  if (!primary) return 'Move to maintenance: one full mixed simulation every two weeks to hold this steady.';
  if (readiness.state === 'NEAR_READY') return `Focus block: ${proof.label} (${proof.itemCount} items) to close the ${GATE_LABELS[primary.gate]} gap.`;
  if (readiness.state === 'AT_RISK') return `Priority: revisit ${GATE_LABELS[primary.gate]} before anything else — this gate regressed.`;
  return `Foundational focus: build up ${GATE_LABELS[primary.gate]} evidence before attempting a full timed set.`;
}

function pathfinderSignal(readiness, blockers) {
  const primary = blockers[0] || null;
  const proof = nextBestProof(primary);
  return {
    target: readiness.target,
    status: readiness.state,
    confidence: primary ? primary.confidence : 'HIGH',
    primaryBlocker: primary ? primary.gate.toUpperCase() : null,
    nextProof: proof ? proof.source.toUpperCase() : 'MAINTENANCE_CHECK',
    recommendedAction: recommendedActionText(readiness, primary, proof),
  };
}

/* ------------------------------------------------------------------
 * The one fully interactive proof: a real, verified 6-item timed
 * mixed aptitude set (Quant + Logical). Scored against real keys —
 * nothing about the outcome is scripted.
 * ------------------------------------------------------------------ */
const TIMED_PROOF_QUESTIONS = [
  {
    id: 'q1', skill: 'Quant', type: 'Profit & Loss',
    prompt: 'A shopkeeper marks an item 40% above cost price, then offers a 25% discount on the marked price. What is his overall profit percentage?',
    options: ['5%', '10%', '15%', '20%'], correct: 0,
  },
  {
    id: 'q2', skill: 'Quant', type: 'Time & Work',
    prompt: 'A can finish a task alone in 12 days, B alone in 18 days. They work together for 4 days, then A leaves. How many more days does B need to finish the rest?',
    options: ['6 days', '7 days', '8 days', '9 days'], correct: 2,
  },
  {
    id: 'q3', skill: 'Logical', type: 'Number Series',
    prompt: 'Find the next number: 3, 8, 15, 24, 35, ?',
    options: ['46', '47', '48', '50'], correct: 2,
  },
  {
    id: 'q4', skill: 'Logical', type: 'Blood Relations',
    prompt: `Pointing to a photograph, a man says, "She is the daughter of my grandfather's only son." How is she related to him?`,
    options: ['Daughter', 'Sister', 'Niece', 'Cousin'], correct: 1,
  },
  {
    id: 'q5', skill: 'Quant', type: 'Probability',
    prompt: 'A bag has 4 red and 6 blue balls. Two balls are drawn at random without replacement. What is the probability both are red?',
    options: ['2/15', '1/5', '4/15', '1/3'], correct: 0,
  },
  {
    id: 'q6', skill: 'Logical', type: 'Syllogism',
    prompt: 'All engineers are punctual. Some punctual people are managers. Conclusion I: Some engineers are managers. Conclusion II: Some managers are punctual. Which conclusion(s) follow?',
    options: ['Only I follows', 'Only II follows', 'Both follow', 'Neither follows'], correct: 1,
  },
];

/* ------------------------------------------------------------------
 * Styling — dark evidence-ledger surface, brass "proof/seal" accent,
 * teal analytical accent. Space Grotesk (display) + Newsreader (body
 * prose) + IBM Plex Mono (scores, timers, evidence metadata).
 * ------------------------------------------------------------------ */
const STYLE_BLOCK = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Newsreader:ital,wght@0,400;0,500;1,400&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

.aceapt-root {
  --ink: #12151b;
  --panel: #1a1f28;
  --panel-hi: #212733;
  --line: #2b323e;
  --bone: #ece7dd;
  --mist: #8891a1;
  --brass: #d3a63f;
  --teal: #4fa6a0;
  --proven: #5cb47b;
  --developing: #d9a441;
  --needs: #c56a5b;
  --untested: #5b6472;
  background: var(--ink);
  color: var(--bone);
  font-family: 'Newsreader', Georgia, serif;
  border-radius: 20px;
}
.aceapt-root .font-display { font-family: 'Space Grotesk', sans-serif; }
.aceapt-root .font-mono { font-family: 'IBM Plex Mono', monospace; }
.aceapt-root .aceapt-card { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; }
.aceapt-root button { font-family: inherit; cursor: pointer; transition: opacity 150ms ease, transform 150ms ease; }
.aceapt-root button:hover:not(:disabled) { opacity: 0.88; }
.aceapt-root button:active:not(:disabled) { transform: translateY(1px); }
.aceapt-root button:disabled { cursor: default; }
.aceapt-root button:focus-visible, .aceapt-root [tabindex]:focus-visible {
  outline: 2px solid var(--teal); outline-offset: 2px;
}
.aceapt-root .rise { animation: aceaptRise 380ms ease-out; }
@keyframes aceaptRise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
.aceapt-root .seal-animate { animation: aceaptSeal 520ms cubic-bezier(.24,.86,.32,1.15); }
@keyframes aceaptSeal { 0% { transform: scale(2) rotate(-16deg); opacity: 0; } 55% { transform: scale(0.92) rotate(5deg); opacity: 1; } 100% { transform: scale(1) rotate(0); opacity: 1; } }
.aceapt-root .countPulse { animation: aceaptPulse 1s ease-in-out infinite; }
@keyframes aceaptPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
@media (prefers-reduced-motion: reduce) {
  .aceapt-root .rise, .aceapt-root .seal-animate, .aceapt-root .countPulse { animation: none; }
  .aceapt-root button { transition: none; }
}
`;

/* ------------------------------------------------------------------
 * Subcomponents
 * ------------------------------------------------------------------ */
function GateRail({ gates, justPassedGate }) {
  return (
    <div className="relative flex items-center justify-between w-full py-2">
      <div className="absolute left-0 right-0 top-1/2" style={{ height: 1, background: 'var(--line)', transform: 'translateY(-50%)', zIndex: 0 }} />
      {GATE_ORDER.map((g) => {
        const gate = gates[g];
        const passed = gate.status === 'PASS';
        const color = STATUS_COLOR[gate.status];
        return (
          <div key={g} className="relative flex flex-col items-center gap-2" style={{ flex: '1 1 0', zIndex: 1 }}>
            <div
              role="img"
              aria-label={`${GATE_LABELS[g]}: ${GATE_STATUS_LABEL[gate.status]}`}
              className={`flex items-center justify-center rounded-full font-mono ${g === justPassedGate ? 'seal-animate' : ''}`}
              style={{
                width: 34, height: 34, fontSize: 10,
                background: passed ? color : 'var(--panel)',
                border: `2px solid ${color}`,
                color: passed ? 'var(--ink)' : color,
              }}
            >
              {passed ? <Check size={16} strokeWidth={3} aria-hidden="true" /> : <span aria-hidden="true">{GATE_SHORT[g]}</span>}
            </div>
            <span className="font-mono uppercase text-center" style={{ color: 'var(--mist)', fontSize: 10, letterSpacing: '0.06em', lineHeight: 1.2 }}>
              {GATE_LABELS[g]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function GateDetailRow({ gateKey, gate, threshold, expanded, onToggle, records }) {
  const color = STATUS_COLOR[gate.status];
  return (
    <div className="aceapt-card" style={{ borderColor: expanded ? color : 'var(--line)' }}>
      <button onClick={onToggle} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left" aria-expanded={expanded}>
        <div className="flex items-center gap-3">
          <span className="rounded-full" style={{ width: 8, height: 8, background: color, display: 'inline-block' }} />
          <span className="font-display font-medium">{GATE_LABELS[gateKey]}</span>
        </div>
        <div className="flex items-center gap-3 font-mono text-sm" style={{ color: 'var(--mist)' }}>
          <span>{pct(gate.score)}</span>
          <span style={{ color }}>{GATE_STATUS_LABEL[gate.status]}</span>
          {expanded ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-4 rise">
          <div className="text-sm mb-2" style={{ color: 'var(--mist)' }}>
            Target bar: {pct(threshold)} · {records.length} attempt{records.length === 1 ? '' : 's'} on record · confidence {gate.confidence.toLowerCase()}
          </div>
          <div>
            {records.length === 0 && <div className="text-sm italic" style={{ color: 'var(--mist)' }}>No evidence recorded yet.</div>}
            {records.slice().reverse().map((r) => (
              <div key={r.id} className="flex items-center justify-between font-mono py-1.5" style={{ fontSize: 12, borderTop: '1px solid var(--line)' }}>
                <span style={{ color: 'var(--mist)' }}>{new Date(r.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {r.source} · {r.skill}</span>
                <span style={{ color: 'var(--bone)' }}>{pct(r.score)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TrendChart({ records, threshold, gateLabel }) {
  const data = records
    .slice()
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .map((r) => ({ date: new Date(r.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), score: Math.round(r.score * 100) }));
  if (data.length < 2) {
    return <div className="text-sm italic" style={{ color: 'var(--mist)' }}>Not enough attempts yet to chart a trend.</div>;
  }
  return (
    <div style={{ width: '100%', height: 180 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
          <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: 'var(--mist)', fontSize: 11 }} axisLine={{ stroke: 'var(--line)' }} tickLine={false} />
          <YAxis domain={[0, 100]} tick={{ fill: 'var(--mist)', fontSize: 11 }} axisLine={false} tickLine={false} width={34} />
          <ReferenceLine y={Math.round(threshold * 100)} stroke="var(--brass)" strokeDasharray="4 4" label={{ value: 'bar', fill: 'var(--brass)', fontSize: 10, position: 'right' }} />
          <Tooltip contentStyle={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }} labelStyle={{ color: 'var(--bone)' }} formatter={(v) => [v + '%', gateLabel]} />
          <Line type="monotone" dataKey="score" stroke="var(--teal)" strokeWidth={2} dot={{ r: 3, fill: 'var(--teal)' }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function bucketize(evidenceForTarget, key) {
  const pool = GATE_ORDER.flatMap((g) => evidenceForTarget[g] || []);
  const buckets = {};
  for (const r of pool) {
    const k = r[key];
    if (!buckets[k]) buckets[k] = [];
    buckets[k].push(r.score);
  }
  return buckets;
}

function ResilienceRow({ label, scores }) {
  if (!scores || !scores.length) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <span className="w-20 shrink-0 capitalize font-mono" style={{ color: 'var(--mist)' }}>{label}</span>
        <span className="text-xs italic" style={{ color: 'var(--mist)' }}>no evidence</span>
      </div>
    );
  }
  const m = scores.reduce((a, b) => a + b, 0) / scores.length;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-20 shrink-0 capitalize font-mono" style={{ color: 'var(--mist)' }}>{label}</span>
      <div className="flex-1 rounded-full overflow-hidden" style={{ background: 'var(--panel-hi)', height: 8 }}>
        <div style={{ width: `${Math.round(m * 100)}%`, height: '100%', background: 'var(--teal)' }} />
      </div>
      <span className="font-mono w-10 text-right" style={{ color: 'var(--bone)' }}>{pct(m)}</span>
    </div>
  );
}

function ResilienceBars({ evidenceForTarget }) {
  const diff = bucketize(evidenceForTarget, 'difficulty');
  const nov = bucketize(evidenceForTarget, 'novelty');
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <div className="font-mono uppercase" style={{ color: 'var(--mist)', fontSize: 11, letterSpacing: '0.05em' }}>Difficulty resilience</div>
        {['easy', 'medium', 'hard'].map((k) => <ResilienceRow key={k} label={k} scores={diff[k]} />)}
      </div>
      <div className="space-y-2">
        <div className="font-mono uppercase" style={{ color: 'var(--mist)', fontSize: 11, letterSpacing: '0.05em' }}>Novelty resilience</div>
        {['familiar', 'varied', 'novel'].map((k) => <ResilienceRow key={k} label={k} scores={nov[k]} />)}
      </div>
    </div>
  );
}

function PathfinderCard({ signal }) {
  return (
    <div className="aceapt-card p-5" style={{ borderColor: 'var(--teal)' }}>
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={15} style={{ color: 'var(--teal)' }} aria-hidden="true" />
        <div className="font-mono uppercase" style={{ color: 'var(--teal)', fontSize: 11, letterSpacing: '0.05em' }}>Pathfinder signal · Feature 22</div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono mb-3" style={{ fontSize: 12, color: 'var(--mist)' }}>
        <div><div className="uppercase" style={{ fontSize: 10 }}>target</div><div style={{ color: 'var(--bone)' }}>{signal.target}</div></div>
        <div><div className="uppercase" style={{ fontSize: 10 }}>status</div><div style={{ color: 'var(--bone)' }}>{signal.status}</div></div>
        <div><div className="uppercase" style={{ fontSize: 10 }}>confidence</div><div style={{ color: 'var(--bone)' }}>{signal.confidence}</div></div>
        <div><div className="uppercase" style={{ fontSize: 10 }}>next proof</div><div style={{ color: 'var(--bone)' }}>{signal.nextProof}</div></div>
      </div>
      <p className="text-sm" style={{ color: 'var(--bone)' }}>{signal.recommendedAction}</p>
    </div>
  );
}

function DashboardView({ target, setTarget, readiness, cfg, primaryBlocker, proof, signal, evidenceStore, expandedGate, setExpandedGate, onStartProof, justPassedGate, disabled }) {
  const stateLabel = STATE_LABEL[readiness.state];
  const evidenceForTarget = evidenceStore[target];
  const overallConfidence = primaryBlocker ? primaryBlocker.confidence : (readiness.state.includes('HIGH') ? 'HIGH' : 'MEDIUM');
  const trendGate = primaryBlocker ? primaryBlocker.gate : 'timed';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {Object.values(TARGETS).map((t) => (
          <button key={t.id} onClick={() => setTarget(t.id)} disabled={disabled}
            className="font-mono uppercase px-3 py-1.5 rounded-full"
            style={{
              fontSize: 11, letterSpacing: '0.04em',
              border: `1px solid ${target === t.id ? 'var(--brass)' : 'var(--line)'}`,
              color: target === t.id ? 'var(--brass)' : 'var(--mist)',
              background: target === t.id ? 'rgba(211,166,63,0.08)' : 'transparent',
            }}>
            {t.name}
          </button>
        ))}
      </div>

      <div className="aceapt-card p-6 rise">
        <div className="font-mono uppercase mb-1" style={{ color: 'var(--mist)', fontSize: 11, letterSpacing: '0.06em' }}>
          Evidence ledger · {cfg.name}
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-semibold flex items-center gap-2" style={{ color: readiness.state === 'AT_RISK' ? 'var(--needs)' : 'var(--bone)' }}>
              {readiness.state === 'AT_RISK' && <AlertTriangle size={28} aria-hidden="true" />}
              {stateLabel}
            </h1>
            <p className="mt-2 max-w-xl" style={{ color: 'var(--mist)' }}>
              {explainBlocker(primaryBlocker, evidenceForTarget, target)}
            </p>
          </div>
          <div className="text-right shrink-0">
            <div className="font-mono uppercase" style={{ color: 'var(--mist)', fontSize: 11, letterSpacing: '0.05em' }}>Confidence</div>
            <div className="font-display text-xl" style={{ color: 'var(--brass)' }}>{overallConfidence}</div>
          </div>
        </div>
        <div className="mt-6">
          <GateRail gates={readiness.gates} justPassedGate={justPassedGate} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="aceapt-card p-5">
          <div className="font-mono uppercase mb-2" style={{ color: 'var(--mist)', fontSize: 11, letterSpacing: '0.05em' }}>Biggest blocker</div>
          {primaryBlocker ? (
            <>
              <div className="font-display text-xl mb-1">{GATE_LABELS[primaryBlocker.gate]}</div>
              <div className="font-mono text-sm mb-3">
                <span style={{ color: 'var(--needs)' }}>{pct(primaryBlocker.score)}</span>
                <span style={{ color: 'var(--mist)' }}> · needs {pct(primaryBlocker.threshold)}</span>
              </div>
              <p className="text-sm" style={{ color: 'var(--mist)' }}>{confidenceNote(primaryBlocker)}</p>
            </>
          ) : (
            <div className="flex items-center gap-2" style={{ color: 'var(--proven)' }}>
              <ShieldCheck size={20} aria-hidden="true" /><span className="font-display text-lg">No open blockers</span>
            </div>
          )}
        </div>

        <div className="aceapt-card p-5">
          <div className="font-mono uppercase mb-2" style={{ color: 'var(--mist)', fontSize: 11, letterSpacing: '0.05em' }}>Next proof</div>
          {proof ? (
            <>
              <div className="font-display text-xl mb-1">{proof.label}</div>
              <div className="text-sm mb-4" style={{ color: 'var(--mist)' }}>
                {proof.itemCount} items · {Math.round(proof.seconds / 60)} min, timed
              </div>
              <button onClick={onStartProof} disabled={disabled || proof.gate !== 'timed'}
                className="inline-flex items-center gap-2 font-mono text-sm px-4 py-2 rounded-full"
                style={{ background: 'var(--brass)', color: 'var(--ink)', opacity: proof.gate !== 'timed' ? 0.5 : 1 }}>
                Start proof <ArrowRight size={15} aria-hidden="true" />
              </button>
              {proof.gate !== 'timed' && (
                <p className="text-xs mt-3 italic" style={{ color: 'var(--mist)' }}>
                  This gate's proof isn't wired into the interactive prototype yet — the live demo covers the Timed Performance proof end to end.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm" style={{ color: 'var(--mist)' }}>
              You're in maintenance range for this target. A periodic check-in keeps this current — nothing urgent to prove right now.
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="aceapt-card p-5">
          <div className="font-mono uppercase mb-2" style={{ color: 'var(--mist)', fontSize: 11, letterSpacing: '0.05em' }}>
            {GATE_LABELS[trendGate]} trend
          </div>
          <TrendChart records={evidenceForTarget[trendGate] || []} threshold={cfg.thresholds[trendGate]} gateLabel={GATE_LABELS[trendGate]} />
        </div>
        <div className="aceapt-card p-5">
          <ResilienceBars evidenceForTarget={evidenceForTarget} />
        </div>
      </div>

      <div>
        <div className="font-mono uppercase mb-2" style={{ color: 'var(--mist)', fontSize: 11, letterSpacing: '0.05em' }}>Evidence by gate</div>
        <div className="space-y-2">
          {GATE_ORDER.map((g) => (
            <GateDetailRow key={g} gateKey={g} gate={readiness.gates[g]} threshold={cfg.thresholds[g]}
              expanded={expandedGate === g} onToggle={() => setExpandedGate(expandedGate === g ? null : g)}
              records={evidenceForTarget[g] || []} />
          ))}
        </div>
      </div>

      <PathfinderCard signal={signal} />
    </div>
  );
}

function ProofIntroView({ proof, primaryBlocker, onBegin, onCancel }) {
  return (
    <div className="aceapt-card p-6 max-w-xl mx-auto rise">
      <div className="font-mono uppercase mb-2" style={{ color: 'var(--mist)', fontSize: 11, letterSpacing: '0.05em' }}>You're about to prove</div>
      <h2 className="font-display text-2xl mb-3">{GATE_LABELS[primaryBlocker.gate]}</h2>
      <p className="text-sm mb-4" style={{ color: 'var(--mist)' }}>
        {proof.itemCount} questions, mixed Quant and Logical, under a {Math.round(proof.seconds / 60)}-minute clock.
        Once the timer starts it doesn't pause — that time pressure is the whole point of this gate.
      </p>
      <ul className="text-sm space-y-1.5 mb-6" style={{ color: 'var(--bone)' }}>
        <li>• Answer as many as you can before time runs out.</li>
        <li>• Unanswered questions at time-up count as incorrect.</li>
        <li>• Your result becomes new evidence for this gate immediately.</li>
      </ul>
      <div className="flex gap-3">
        <button onClick={onBegin} className="font-mono text-sm px-4 py-2 rounded-full" style={{ background: 'var(--brass)', color: 'var(--ink)' }}>
          Begin timed proof
        </button>
        <button onClick={onCancel} className="font-mono text-sm px-4 py-2 rounded-full" style={{ border: '1px solid var(--line)', color: 'var(--mist)' }}>
          Not now
        </button>
      </div>
    </div>
  );
}

function ProofActiveView({ questions, session, onAnswer, onJump, onSubmit }) {
  const q = questions[session.currentIndex];
  const minutes = Math.floor(session.secondsLeft / 60);
  const seconds = String(session.secondsLeft % 60).padStart(2, '0');
  const low = session.secondsLeft <= 20;
  return (
    <div className="max-w-xl mx-auto rise">
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1.5">
          {questions.map((qq, i) => (
            <button key={qq.id} onClick={() => onJump(i)} aria-label={`Question ${i + 1}${session.answers[qq.id] != null ? ', answered' : ', not answered'}`}
              className="rounded-full font-mono flex items-center justify-center"
              style={{
                width: 26, height: 26, fontSize: 11,
                background: session.answers[qq.id] != null ? 'var(--teal)' : 'var(--panel-hi)',
                color: session.answers[qq.id] != null ? 'var(--ink)' : 'var(--mist)',
                border: i === session.currentIndex ? '2px solid var(--brass)' : '1px solid var(--line)',
              }}>
              {i + 1}
            </button>
          ))}
        </div>
        <div aria-label={`Time remaining ${minutes} minutes ${seconds} seconds`} className={`flex items-center gap-1.5 font-mono text-lg ${low ? 'countPulse' : ''}`} style={{ color: low ? 'var(--needs)' : 'var(--bone)' }}>
          <Timer size={17} aria-hidden="true" />{minutes}:{seconds}
        </div>
      </div>

      <div className="aceapt-card p-6">
        <div className="font-mono uppercase mb-3" style={{ color: 'var(--mist)', fontSize: 11, letterSpacing: '0.05em' }}>
          {q.skill} · {q.type}
        </div>
        <p className="font-display text-lg mb-5" style={{ color: 'var(--bone)' }}>{q.prompt}</p>
        <div className="space-y-2">
          {q.options.map((opt, i) => (
            <button key={i} onClick={() => onAnswer(q.id, i)}
              className="w-full text-left px-4 py-3 rounded-lg text-sm"
              style={{
                border: `1px solid ${session.answers[q.id] === i ? 'var(--brass)' : 'var(--line)'}`,
                background: session.answers[q.id] === i ? 'rgba(211,166,63,0.10)' : 'var(--panel-hi)',
                color: 'var(--bone)',
              }}>
              {opt}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between mt-4">
        <button disabled={session.currentIndex === 0} onClick={() => onJump(session.currentIndex - 1)}
          className="font-mono text-xs px-3 py-2 rounded-full disabled:opacity-30" style={{ border: '1px solid var(--line)', color: 'var(--mist)' }}>
          Back
        </button>
        {session.currentIndex < questions.length - 1 ? (
          <button onClick={() => onJump(session.currentIndex + 1)} className="font-mono text-xs px-3 py-2 rounded-full" style={{ border: '1px solid var(--line)', color: 'var(--mist)' }}>
            Next
          </button>
        ) : (
          <button onClick={onSubmit} className="font-mono text-xs px-4 py-2 rounded-full" style={{ background: 'var(--brass)', color: 'var(--ink)' }}>
            Submit proof
          </button>
        )}
      </div>
    </div>
  );
}

function ProofResultView({ result, onDone }) {
  const { before, after, overallBefore, overallAfter, questions, answers } = result;
  const improved = after.score > before.score;
  const overallChanged = overallBefore !== overallAfter;

  return (
    <div className="max-w-xl mx-auto space-y-6 rise">
      <div className="aceapt-card p-6 text-center">
        <div className="font-mono uppercase mb-4" style={{ color: 'var(--mist)', fontSize: 11, letterSpacing: '0.05em' }}>New evidence recorded</div>
        <div className="flex items-center justify-center gap-6">
          <div>
            <div className="font-mono uppercase" style={{ color: 'var(--mist)', fontSize: 11 }}>Before</div>
            <div className="font-display text-3xl" style={{ color: 'var(--mist)' }}>{pct(before.score)}</div>
            <div className="font-mono" style={{ fontSize: 11, color: STATUS_COLOR[before.status] }}>{GATE_STATUS_LABEL[before.status]}</div>
          </div>
          <ArrowRight style={{ color: 'var(--brass)' }} aria-hidden="true" />
          <div>
            <div className="font-mono uppercase" style={{ color: 'var(--mist)', fontSize: 11 }}>After</div>
            <div className="font-display text-3xl" style={{ color: improved ? 'var(--proven)' : 'var(--needs)' }}>{pct(after.score)}</div>
            <div className="font-mono" style={{ fontSize: 11, color: STATUS_COLOR[after.status] }}>{GATE_STATUS_LABEL[after.status]}</div>
          </div>
        </div>

        {overallChanged && (
          <div className="mt-6 pt-6 rise" style={{ borderTop: '1px solid var(--line)' }}>
            <div className="font-mono uppercase mb-1" style={{ color: 'var(--mist)', fontSize: 11, letterSpacing: '0.05em' }}>Readiness updated</div>
            <div className="font-display text-2xl">
              <span style={{ color: 'var(--mist)' }}>{STATE_LABEL[overallBefore]}</span>
              {' '}<ArrowRight size={18} style={{ display: 'inline', color: 'var(--brass)' }} aria-hidden="true" />{' '}
              <span style={{ color: overallAfter === 'AT_RISK' ? 'var(--needs)' : 'var(--proven)' }}>{STATE_LABEL[overallAfter]}</span>
            </div>
          </div>
        )}
      </div>

      <div className="aceapt-card p-5">
        <div className="font-mono uppercase mb-3" style={{ color: 'var(--mist)', fontSize: 11, letterSpacing: '0.05em' }}>How you did</div>
        <div className="space-y-2">
          {questions.map((q) => {
            const a = answers[q.id];
            const correct = a === q.correct;
            return (
              <div key={q.id} className="flex items-start gap-2 text-sm">
                {correct ? <Check size={15} style={{ color: 'var(--proven)', marginTop: 2 }} aria-hidden="true" /> : <X size={15} style={{ color: 'var(--needs)', marginTop: 2 }} aria-hidden="true" />}
                <div>
                  <span style={{ color: 'var(--bone)' }}>{q.type}</span>
                  {!correct && (
                    <span style={{ color: 'var(--mist)' }}> — {a == null ? 'not answered' : 'answered ' + q.options[a]}, correct: {q.options[q.correct]}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <button onClick={onDone} className="w-full font-mono text-sm px-4 py-3 rounded-full" style={{ background: 'var(--brass)', color: 'var(--ink)' }}>
        Back to dashboard
      </button>
    </div>
  );
}

function HistoryView({ snapshots, target, cfg }) {
  const list = snapshots.filter((s) => s.target === target).slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return (
    <div className="max-w-xl mx-auto space-y-3 rise">
      <div className="font-mono uppercase mb-1" style={{ color: 'var(--mist)', fontSize: 11, letterSpacing: '0.05em' }}>
        Readiness history · {cfg.name}
      </div>
      {list.length === 0 && (
        <div className="aceapt-card p-5 text-sm" style={{ color: 'var(--mist)' }}>No checkpoints recorded yet for this target.</div>
      )}
      {list.map((s) => (
        <div key={s.id} className="aceapt-card p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="font-display" style={{ color: s.state === 'AT_RISK' ? 'var(--needs)' : 'var(--bone)' }}>{STATE_LABEL[s.state]}</span>
            <span className="font-mono" style={{ fontSize: 11, color: 'var(--mist)' }}>{new Date(s.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          </div>
          {s.primaryBlocker && (
            <div className="font-mono mb-1" style={{ fontSize: 11, color: 'var(--brass)' }}>Blocker: {GATE_LABELS[s.primaryBlocker]}</div>
          )}
          <p className="text-sm" style={{ color: 'var(--mist)' }}>{s.reason}</p>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------
 * Root
 * ------------------------------------------------------------------ */
export default function AceaptProof() {
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [evidenceStore, setEvidenceStore] = useState(null);
  const [snapshots, setSnapshots] = useState([]);
  const [target, setTarget] = useState('placement');
  const [tab, setTab] = useState('dashboard');
  const [view, setView] = useState('dashboard');
  const [expandedGate, setExpandedGate] = useState(null);
  const [proofSession, setProofSession] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [justPassedGate, setJustPassedGate] = useState(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const submittedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let store, snaps;
      try {
        const res = await window.storage.get(STORAGE_KEY, false);
        const parsed = JSON.parse(res.value);
        store = parsed.evidenceStore;
        snaps = parsed.snapshots;
      } catch (e) {
        store = buildSeedEvidenceStore();
        snaps = buildSeedSnapshots();
        try { await window.storage.set(STORAGE_KEY, JSON.stringify({ evidenceStore: store, snapshots: snaps }), false); } catch (e2) { /* non-fatal */ }
      }
      if (!cancelled) { setEvidenceStore(store); setSnapshots(snaps); setLoaded(true); }
    })();
    return () => { cancelled = true; };
  }, []);

  const persist = useCallback(async (store, snaps) => {
    try {
      await window.storage.set(STORAGE_KEY, JSON.stringify({ evidenceStore: store, snapshots: snaps }), false);
    } catch (e) {
      setLoadError('Progress is up to date on screen but could not be saved for next time.');
    }
  }, []);

  const cfg = TARGETS[target];
  const readiness = useMemo(() => {
    if (!evidenceStore) return null;
    const priorSnap = snapshots.filter((s) => s.target === target).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
    return evaluateReadiness(target, evidenceStore[target], new Date(), priorSnap ? priorSnap.state : null);
  }, [evidenceStore, target, snapshots]);

  const blockers = useMemo(() => (readiness ? identifyBlockers(readiness) : []), [readiness]);
  const primaryBlocker = blockers[0] || null;
  const proof = useMemo(() => (primaryBlocker ? nextBestProof(primaryBlocker) : null), [primaryBlocker]);
  const signal = useMemo(() => (readiness ? pathfinderSignal(readiness, blockers) : null), [readiness, blockers]);

  const inProofFlow = view !== 'dashboard';

  const startProof = () => { if (proof && proof.gate === 'timed') setView('proof-intro'); };
  const beginTimer = () => {
    submittedRef.current = false;
    setProofSession({ answers: {}, currentIndex: 0, secondsLeft: PROOF_CATALOG.timed.seconds });
    setView('proof-active');
  };

  useEffect(() => {
    if (view !== 'proof-active' || !proofSession) return;
    if (proofSession.secondsLeft <= 0) { submitProof(); return; }
    const t = setTimeout(() => setProofSession((s) => (s ? { ...s, secondsLeft: s.secondsLeft - 1 } : s)), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, proofSession]);

  const answerQuestion = (qId, idx) => setProofSession((s) => ({ ...s, answers: { ...s.answers, [qId]: idx } }));
  const jumpTo = (i) => setProofSession((s) => ({ ...s, currentIndex: Math.max(0, Math.min(TIMED_PROOF_QUESTIONS.length - 1, i)) }));

  function submitProof() {
    if (!proofSession || submittedRef.current) return;
    submittedRef.current = true;
    const s = proofSession;
    const correct = TIMED_PROOF_QUESTIONS.filter((q) => s.answers[q.id] === q.correct).length;
    const score = correct / TIMED_PROOF_QUESTIONS.length;

    const before = readiness.gates.timed;
    const overallBefore = readiness.state;

    const newRecord = {
      id: 'ev_live_' + Date.now(), source: 'timed_drill', timestamp: new Date().toISOString(),
      skill: 'Mixed', difficulty: 'medium', novelty: 'varied', timed: true,
      itemCount: TIMED_PROOF_QUESTIONS.length, score,
    };
    const newStore = { ...evidenceStore, [target]: { ...evidenceStore[target], timed: [...evidenceStore[target].timed, newRecord] } };
    const newReadiness = evaluateReadiness(target, newStore[target], new Date(), overallBefore);
    const after = newReadiness.gates.timed;

    const newSnap = {
      id: 'sn_live_' + Date.now(), target, timestamp: new Date().toISOString(), state: newReadiness.state,
      primaryBlocker: identifyBlockers(newReadiness)[0]?.gate || null,
      reason: `Timed Performance moved from ${pct(before.score)} to ${pct(after.score)} after a ${TIMED_PROOF_QUESTIONS.length}-item timed proof (${correct}/${TIMED_PROOF_QUESTIONS.length} correct).`,
    };
    const newSnaps = [...snapshots, newSnap];

    setEvidenceStore(newStore);
    setSnapshots(newSnaps);
    persist(newStore, newSnaps);

    if (before.status !== 'PASS' && after.status === 'PASS') setJustPassedGate('timed');

    setLastResult({ before, after, overallBefore, overallAfter: newReadiness.state, questions: TIMED_PROOF_QUESTIONS, answers: s.answers });
    setView('proof-result');
  }

  const finishResult = () => {
    setLastResult(null);
    setView('dashboard');
    setTimeout(() => setJustPassedGate(null), 900);
  };

  const doReset = async () => {
    const store = buildSeedEvidenceStore();
    const snaps = buildSeedSnapshots();
    setEvidenceStore(store);
    setSnapshots(snaps);
    setView('dashboard');
    setConfirmingReset(false);
    try { await window.storage.set(STORAGE_KEY, JSON.stringify({ evidenceStore: store, snapshots: snaps }), false); } catch (e) { /* non-fatal */ }
  };

  if (!loaded || !readiness) {
    return (
      <div className="aceapt-root flex items-center justify-center" style={{ minHeight: 400 }}>
        <style>{STYLE_BLOCK}</style>
        <div className="font-mono text-sm" style={{ color: 'var(--mist)' }}>Loading readiness evidence…</div>
      </div>
    );
  }

  return (
    <div className="aceapt-root">
      <style>{STYLE_BLOCK}</style>
      <div className="max-w-3xl mx-auto px-4 py-6 sm:px-6">
        <header className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <div className="font-display text-lg font-semibold tracking-tight">ACEAPT <span style={{ color: 'var(--brass)' }}>Proof</span></div>
            <div className="font-mono" style={{ color: 'var(--mist)', fontSize: 11 }}>Evidence-based readiness · PrepVista</div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setTab('dashboard')} disabled={inProofFlow}
              className="font-mono text-xs px-3 py-1.5 rounded-full disabled:opacity-30"
              style={{ border: '1px solid var(--line)', color: tab === 'dashboard' ? 'var(--bone)' : 'var(--mist)', background: tab === 'dashboard' ? 'var(--panel-hi)' : 'transparent' }}>
              <ListChecks size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: -2 }} aria-hidden="true" />Dashboard
            </button>
            <button onClick={() => setTab('history')} disabled={inProofFlow}
              className="font-mono text-xs px-3 py-1.5 rounded-full disabled:opacity-30"
              style={{ border: '1px solid var(--line)', color: tab === 'history' ? 'var(--bone)' : 'var(--mist)', background: tab === 'history' ? 'var(--panel-hi)' : 'transparent' }}>
              <HistoryIcon size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: -2 }} aria-hidden="true" />History
            </button>
            {!confirmingReset ? (
              <button onClick={() => setConfirmingReset(true)} disabled={inProofFlow} aria-label="Reset demo data"
                className="font-mono text-xs px-3 py-1.5 rounded-full disabled:opacity-30" style={{ border: '1px solid var(--line)', color: 'var(--mist)' }}>
                <RotateCcw size={13} aria-hidden="true" />
              </button>
            ) : (
              <span className="font-mono text-xs flex items-center gap-2">
                <button onClick={doReset} style={{ color: 'var(--needs)' }}>Reset?</button>
                <button onClick={() => setConfirmingReset(false)} style={{ color: 'var(--mist)' }}>cancel</button>
              </span>
            )}
          </div>
        </header>

        {loadError && (
          <div className="mb-4 px-4 py-2 rounded-lg font-mono flex items-center gap-2" style={{ fontSize: 12, border: '1px solid var(--needs)', color: 'var(--needs)' }}>
            <Info size={14} aria-hidden="true" /> {loadError}
          </div>
        )}

        {tab === 'history' ? (
          <HistoryView snapshots={snapshots} target={target} cfg={cfg} />
        ) : (
          <>
            {view === 'dashboard' && (
              <DashboardView
                target={target} setTarget={setTarget} readiness={readiness} cfg={cfg}
                primaryBlocker={primaryBlocker} proof={proof} signal={signal}
                evidenceStore={evidenceStore} expandedGate={expandedGate} setExpandedGate={setExpandedGate}
                onStartProof={startProof} justPassedGate={justPassedGate} disabled={inProofFlow}
              />
            )}
            {view === 'proof-intro' && (
              <ProofIntroView proof={proof} primaryBlocker={primaryBlocker} onBegin={beginTimer} onCancel={() => setView('dashboard')} />
            )}
            {view === 'proof-active' && proofSession && (
              <ProofActiveView questions={TIMED_PROOF_QUESTIONS} session={proofSession} onAnswer={answerQuestion} onJump={jumpTo} onSubmit={submitProof} />
            )}
            {view === 'proof-result' && lastResult && (
              <ProofResultView result={lastResult} onDone={finishResult} />
            )}
          </>
        )}

        <footer className="mt-10 pt-4 text-center font-mono" style={{ borderTop: '1px solid var(--line)', color: 'var(--mist)', fontSize: 11 }}>
          Adaptive Readiness &amp; Real-World Performance Certification Engine — deterministic core, explainable by design.
        </footer>
      </div>
    </div>
  );
}
