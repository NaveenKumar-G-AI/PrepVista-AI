/**
 * Section 16: controlled mastery-state transitions.
 *
 * Each state's gate function calls the state below it first, so a skill
 * literally cannot be evaluated as e.g. RETAINED without independently
 * re-satisfying INDEPENDENT and STABLE's requirements from the *current*
 * evidence. This gives us "no arbitrary jumping" for free: reaching a high
 * state always means every gate under it is also currently true, and
 * feeding in a new (weaker) evidence snapshot can walk the state back down
 * just as easily as it walked up — that's what makes mastery regression
 * (section 17) fall out of the same function instead of needing special
 * casing.
 */

import { AnalysisResult } from './analysisEngine';
import { THRESHOLDS } from '../domain/constants';
import { GapFlag, MasteryState, SkillEvidence } from '../domain/types';

interface Gate {
  state: MasteryState;
  check: (ev: SkillEvidence, an: AnalysisResult) => boolean;
  blockedReason: (ev: SkillEvidence, an: AnalysisResult) => string;
}

const GATES: Gate[] = [
  {
    state: 'INTRODUCED',
    check: (ev) => ev.totalAttempts >= 1,
    blockedReason: () => 'No attempts recorded yet.',
  },
  {
    state: 'FAMILIAR',
    check: (ev) => ev.totalAttempts >= 3,
    blockedReason: () => 'Needs a few more attempts (with help is fine) before the system can say the student recognises this skill.',
  },
  {
    state: 'GUIDED',
    // Section 5 frames GUIDED as "has shown they can get it right with
    // support" — but a student who went straight to confident independent
    // attempts without ever needing a hint has *skipped past* this, not
    // failed it. Only a guided attempt with zero success, or no attempts
    // at all beyond the FAMILIAR bar, should hold someone here.
    check: (ev) => (ev.guidedAccuracy ?? 0) > 0 || ev.independentAttempts >= 1,
    blockedReason: () => 'Has attempted this with help but hasn\u2019t yet answered correctly, guided or otherwise.',
  },
  {
    state: 'PRACTICING',
    check: (ev) => ev.independentAttempts >= 1,
    blockedReason: () => 'Hasn\u2019t attempted this skill independently (without hints) yet.',
  },
  {
    state: 'INDEPENDENT',
    check: (ev, an) =>
      ev.independentDistinctQuestions >= THRESHOLDS.MIN_INDEPENDENT_DISTINCT_QUESTIONS &&
      (ev.independentAccuracy ?? 0) >= THRESHOLDS.INDEPENDENT_MASTERY_ACCURACY &&
      !an.flags.includes('INDEPENDENCE_GAP'),
    blockedReason: (ev, an) => {
      if (an.flags.includes('INDEPENDENCE_GAP')) {
        return `Guided accuracy (${pct(ev.guidedAccuracy)}) is well above independent accuracy (${pct(ev.independentAccuracy)}) — performance with help doesn\u2019t yet hold up unaided.`;
      }
      if (ev.independentDistinctQuestions < THRESHOLDS.MIN_INDEPENDENT_DISTINCT_QUESTIONS) {
        return `Only ${ev.independentDistinctQuestions} distinct question(s) solved independently — needs ${THRESHOLDS.MIN_INDEPENDENT_DISTINCT_QUESTIONS}+ before independent accuracy is trustworthy.`;
      }
      return `Independent accuracy (${pct(ev.independentAccuracy)}) is below the ${pct(THRESHOLDS.INDEPENDENT_MASTERY_ACCURACY)} bar for independent mastery.`;
    },
  },
  {
    state: 'STABLE',
    check: (ev, an) => an.stability === 'STABLE',
    blockedReason: (_ev, an) =>
      an.stability === 'INSUFFICIENT'
        ? 'Not enough consecutive independent attempts yet to judge consistency.'
        : 'Recent independent performance is inconsistent \u2014 accuracy swings between attempts rather than holding steady.',
  },
  {
    state: 'RETAINED',
    check: (ev, an) => ev.retention.delayedAttempts >= THRESHOLDS.MIN_DELAYED_ATTEMPTS && !an.flags.includes('RETENTION_GAP'),
    blockedReason: (ev, an) => {
      if (ev.retention.delayedAttempts < THRESHOLDS.MIN_DELAYED_ATTEMPTS) {
        return 'No delayed (multi-day-later) recall check on record yet \u2014 recent success alone doesn\u2019t confirm retention.';
      }
      return `Accuracy dropped from ${pct(ev.retention.immediateAccuracy)} immediately to ${pct(ev.retention.delayedAccuracy)} on the delayed check.`;
    },
  },
  {
    state: 'TRANSFERRED',
    check: (ev, an) => ev.novelIndependentAttempts >= THRESHOLDS.MIN_NOVEL_INDEPENDENT_ATTEMPTS && !an.flags.includes('TRANSFER_GAP'),
    blockedReason: (ev, an) => {
      if (ev.novelIndependentAttempts < THRESHOLDS.MIN_NOVEL_INDEPENDENT_ATTEMPTS) {
        return 'Not enough novel/unfamiliar-format independent attempts yet to confirm transfer.';
      }
      return `Familiar-question accuracy (${pct(ev.familiarAccuracy)}) is strong, but drops to ${pct(ev.novelAccuracy)} on novel questions covering the same concept.`;
    },
  },
  {
    state: 'ROBUST_MASTERY',
    check: (ev, an) => an.difficultyCeiling === 'hard' && !an.flags.includes('FORMAT_TRANSFER_GAP') && !an.flags.includes('CONTEXT_TRANSFER_GAP'),
    blockedReason: (ev, an) => {
      if (an.difficultyCeiling !== 'hard') return 'Hasn\u2019t yet shown reliable accuracy at hard difficulty.';
      if (an.flags.includes('FORMAT_TRANSFER_GAP')) return 'Accuracy varies too much across question formats (e.g. table vs. word problem) to call this fully robust.';
      return 'Accuracy varies too much across contexts (e.g. finance vs. population) to call this fully robust.';
    },
  },
];

function pct(v: number | null): string {
  return v == null ? 'n/a' : `${Math.round(v * 100)}%`;
}

export interface StateResult {
  state: MasteryState;
  reason: string;
}

export function deriveState(evidence: SkillEvidence, analysis: AnalysisResult): StateResult {
  if (evidence.totalAttempts === 0) {
    return { state: 'UNSEEN', reason: 'Not yet attempted.' };
  }

  let achieved: MasteryState = 'UNSEEN';
  let reason = 'Not yet attempted.';

  for (const gate of GATES) {
    if (gate.check(evidence, analysis)) {
      achieved = gate.state;
      reason = `Meets the bar for ${gate.state.replace('_', ' ')}.`;
    } else {
      reason = gate.blockedReason(evidence, analysis);
      break;
    }
  }

  return { state: achieved, reason };
}

export interface ConfidenceResult {
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
}

/**
 * Section 14: mastery state and confidence are separate axes. A skill can
 * be assessed as INDEPENDENT with LOW confidence if that assessment rests
 * on thin evidence, or STABLE with HIGH confidence if the evidence is rich.
 */
export function deriveConfidence(evidence: SkillEvidence, analysis: AnalysisResult): ConfidenceResult {
  if (analysis.sufficiency === 'INSUFFICIENT') {
    return { confidence: 'LOW', reason: 'Too few attempts so far to draw a reliable conclusion.' };
  }

  const dimensions: Array<[string, boolean]> = [
    ['independent attempts', evidence.independentDistinctQuestions >= THRESHOLDS.MIN_INDEPENDENT_DISTINCT_QUESTIONS],
    ['hard-difficulty attempts', evidence.byDifficulty.hard.attempts >= THRESHOLDS.MIN_ATTEMPTS_PER_DIFFICULTY],
    ['multiple question formats', Object.values(evidence.byFormat).filter((b) => b.attempts >= THRESHOLDS.MIN_ATTEMPTS_PER_FORMAT).length >= 2],
    ['novel/unfamiliar attempts', evidence.novelIndependentAttempts >= THRESHOLDS.MIN_NOVEL_INDEPENDENT_ATTEMPTS],
    ['delayed retention checks', evidence.retention.delayedAttempts >= THRESHOLDS.MIN_DELAYED_ATTEMPTS],
  ];
  const covered = dimensions.filter(([, ok]) => ok).map(([name]) => name);
  const missing = dimensions.filter(([, ok]) => !ok).map(([name]) => name);

  if (covered.length >= 4 && analysis.stability !== 'INSUFFICIENT') {
    return {
      confidence: 'HIGH',
      reason: `Evidence spans ${covered.join(', ')}.${missing.length ? ` Still limited: ${missing.join(', ')}.` : ''}`,
    };
  }
  if (covered.length >= 2) {
    return {
      confidence: 'MEDIUM',
      reason: `Evidence exists across ${covered.join(', ')}, but ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} still limited.`,
    };
  }
  return {
    confidence: 'LOW',
    reason: `Evidence so far is narrow (mainly ${covered.length ? covered.join(', ') : 'basic practice attempts'}) \u2014 not enough spread to be confident yet.`,
  };
}

/**
 * Section 25/27/28: the map/detail UI shows a human label, not the raw
 * enum. Isolated gaps on an otherwise-solid skill get called out by name;
 * an early-stage skill is simply "Developing" regardless of which specific
 * dimension is behind, because at that stage several dimensions are
 * usually still behind at once and naming just one would be misleading.
 */
export function toDisplayLabel(state: MasteryState, flags: GapFlag[]): string {
  if (flags.includes('INSUFFICIENT_EVIDENCE')) return 'Not enough data yet';
  if (state === 'UNSEEN') return 'Not started';
  if (state === 'INTRODUCED' || state === 'FAMILIAR') return 'Familiar';
  if (state === 'GUIDED' || state === 'PRACTICING' || state === 'INDEPENDENT') return 'Developing';

  // state is STABLE or higher: a solid core with one isolated gap is called
  // out specifically; otherwise show the state itself.
  if (flags.includes('TRANSFER_GAP')) return 'Transfer gap';
  if (flags.includes('RETENTION_GAP')) return 'Retention gap';
  if (flags.includes('DIFFICULTY_GAP')) return 'Difficulty gap';
  if (state === 'ROBUST_MASTERY') return 'Robust mastery';
  if (state === 'TRANSFERRED') return 'Transferred';
  if (state === 'RETAINED') return 'Retained';
  return 'Stable';
}

export function nextActionFor(state: MasteryState, flags: GapFlag[], skillName: string): string {
  if (flags.includes('INSUFFICIENT_EVIDENCE')) {
    return `Complete a few more ${skillName} practice questions so there's enough evidence to evaluate.`;
  }
  if (state === 'ROBUST_MASTERY' && flags.length === 0) {
    return `Maintain ${skillName} through periodic spaced review \u2014 no active gaps right now.`;
  }
  if (flags.includes('TRANSFER_GAP')) {
    return `Targeted transfer practice: apply ${skillName} to unfamiliar, differently-worded problems.`;
  }
  if (flags.includes('RETENTION_GAP')) {
    return `A short retention refresher on ${skillName} to re-confirm recall after time away.`;
  }
  if (flags.includes('DIFFICULTY_GAP')) {
    return `Push into harder ${skillName} questions to close the gap with easier ones.`;
  }
  if (flags.includes('INDEPENDENCE_GAP')) {
    return `Attempt ${skillName} fully unaided (no hints) to confirm the method is truly internalised.`;
  }
  if (flags.includes('FORMAT_TRANSFER_GAP') || flags.includes('CONTEXT_TRANSFER_GAP')) {
    return `Practice ${skillName} in the specific formats/contexts where accuracy is currently weaker.`;
  }
  if (state === 'UNSEEN' || state === 'INTRODUCED' || state === 'FAMILIAR') {
    return `Start guided practice on ${skillName}.`;
  }
  return `Continue independent practice on ${skillName} to build toward a mastery check.`;
}
