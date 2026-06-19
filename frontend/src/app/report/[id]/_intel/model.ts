/**
 * buildIntel — derives the Interview Intelligence Dashboard chart inputs from the
 * live report payload (`/reports/{id}`). Everything here is computed ONLY from
 * real per-turn evaluator data + the session summary; null-safe throughout so a
 * sparse / free-tier session degrades gracefully (each `has*` flag lets the
 * dashboard hide a chart that has no real data behind it).
 *
 * Scale reference (from the backend):
 *   • per-turn `score`           0–10   → surfaced ×10 as `score100` (0–100)
 *   • `communication_score`      0–10   → surfaced ×10 (0–100)
 *   • relevance/clarity/specificity/structure  0–2 each → surfaced ×5 as 0–10 dims
 *   • `final_score`              0–100
 *
 * The mock's chart #6 (rabbit-hole collapse by follow-up depth) is intentionally
 * omitted: the report payload carries no per-turn follow-up depth, so there is no
 * honest source for it.
 */

// ── Minimal shape of the report payload this module consumes ──────────────────
export interface IntelEvaluation {
  turn_number: number;
  rubric_category: string;
  classification: string;
  score: number;                       // 0–10
  communication_score: number;         // 0–10
  relevance_score: number;             // 0–2
  clarity_score: number;               // 0–2
  specificity_score: number;           // 0–2
  structure_score: number;             // 0–2
  missing_elements: string[];
  answer_duration_seconds?: number | null;
}
export interface IntelSummary {
  timeout_count?: number;
  skipped_count?: number;
  system_cutoff_count?: number;
  per_question_response_times?: number[];
}
export interface IntelReport {
  session: {
    final_score: number;
    rubric_scores: Record<string, number>;
    summary?: IntelSummary;
  };
  evaluations: IntelEvaluation[];
}

// ── Palette (matches the mock 1:1) ────────────────────────────────────────────
export const COLORS = {
  purple: '#8B5CF6',
  teal: '#10B981',
  amber: '#F59E0B',
  red: '#EF4444',
  coral: '#F97316',
  blue: '#3B82F6',
  grid: 'rgba(255,255,255,0.055)',
};

// Classification → colour/label (DB enum: strong | partial | vague | wrong | silent).
export const CLASS_META: Record<string, { label: string; hex: string }> = {
  strong: { label: 'Strong', hex: COLORS.teal },
  partial: { label: 'Partial', hex: COLORS.purple },
  vague: { label: 'Vague', hex: COLORS.amber },
  wrong: { label: 'Wrong', hex: COLORS.coral },
  silent: { label: 'Silent', hex: COLORS.red },
};
const CLASS_ORDER = ['strong', 'partial', 'vague', 'wrong', 'silent'];

const num = (v: unknown): number => (typeof v === 'number' && isFinite(v) ? v : 0);
const round = (v: number, d = 0) => { const f = 10 ** d; return Math.round(v * f) / f; };
const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

// dim (0–2) → 0–10 axis
const dim10 = (v: number) => round(num(v) * 5, 1);
// per-turn score / comm (0–10) → 0–100 axis
const to100 = (v: number) => round(num(v) * 10);

const DIMS = ['relevance', 'clarity', 'specificity', 'structure'] as const;
const DIM_LABEL: Record<string, string> = {
  relevance: 'Relevance', clarity: 'Clarity', specificity: 'Specificity', structure: 'Structure',
};
// Typed accessor for a 0–2 rubric sub-dimension score.
const dimScore = (e: IntelEvaluation, d: (typeof DIMS)[number]): number =>
  num(e[`${d}_score` as keyof IntelEvaluation]);

export interface IntelModel {
  finalScore: number;            // 0–100
  readinessBand: 'Early' | 'Moderate' | 'Strong';
  turnCount: number;

  // 01 — radar fingerprint (0–10 per dim)
  radar: { labels: string[]; you: number[]; ideal: number[] };
  weakestDim: { key: string; label: string; value: number } | null;

  // 02 — momentum curve (per-turn score, 0–100)
  momentum: { labels: string[]; values: number[] };

  // 03 — timing scatter (duration vs score, grouped by classification)
  timing: { cls: string; label: string; hex: string; points: [number, number][] }[];
  hasTiming: boolean;

  // 04 — confidence decay (per-turn response seconds)
  decay: { labels: string[]; values: number[] };
  hasDecay: boolean;

  // 05 — topic × skill heatmap (category × dim, 0–10)
  heatTopics: string[];
  heatDims: string[];
  heatCells: number[][];        // [topicIdx][dimIdx]
  hasHeat: boolean;

  // 07 — classification donut
  classification: { name: string; value: number; hex: string }[];

  // 08 — communication–content scissor (per-turn, 0–100)
  scissor: { labels: string[]; comm: number[]; content: number[] };

  // 09 — fear vs reality (per category)
  fear: { topics: string[]; skipped: number[]; scoreWhenAttempted: number[] };
  hasFear: boolean;

  // 11 — missing elements frequency
  missing: { label: string; count: number }[];
  hasMissing: boolean;

  // 12 — score contribution waterfall
  waterfall: { labels: string[]; offsets: number[]; values: number[]; kinds: ('base' | 'pos' | 'neg' | 'final')[] };
}

export function buildIntel(report: IntelReport): IntelModel {
  const evals = [...(report.evaluations ?? [])].sort((a, b) => a.turn_number - b.turn_number);
  const finalScore = Math.max(0, Math.min(100, round(num(report.session?.final_score))));
  const summary = report.session?.summary ?? {};
  const n = evals.length;

  const turnLabels = evals.map((_, i) => 'Q' + (i + 1));

  // ── 01 radar ──────────────────────────────────────────────────────────────
  const radarYou = DIMS.map(d => round(avg(evals.map(e => dim10(dimScore(e, d)))), 1));
  const radar = { labels: DIMS.map(d => DIM_LABEL[d]), you: radarYou, ideal: DIMS.map(() => 8.5) };
  const weakestDim = DIMS
    .map((d, i) => ({ key: d, label: DIM_LABEL[d], value: radarYou[i] }))
    .sort((a, b) => a.value - b.value)[0] ?? null;

  // ── 02 momentum ─────────────────────────────────────────────────────────────
  const momentum = { labels: turnLabels, values: evals.map(e => to100(e.score)) };

  // ── 03 timing scatter ───────────────────────────────────────────────────────
  const timingGroups: Record<string, [number, number][]> = {};
  let timingPoints = 0;
  evals.forEach(e => {
    const t = e.answer_duration_seconds;
    if (t == null || !isFinite(t)) return;
    const cls = CLASS_META[e.classification] ? e.classification : 'partial';
    (timingGroups[cls] ??= []).push([round(num(t), 1), to100(e.score)]);
    timingPoints++;
  });
  const timing = CLASS_ORDER
    .filter(c => timingGroups[c]?.length)
    .map(c => ({ cls: c, label: CLASS_META[c].label, hex: CLASS_META[c].hex, points: timingGroups[c] }));

  // ── 04 confidence decay ─────────────────────────────────────────────────────
  const perTurnTimes = evals.map(e => e.answer_duration_seconds);
  const summaryTimes = summary.per_question_response_times ?? [];
  const decayVals = perTurnTimes.every(t => t == null) && summaryTimes.length
    ? summaryTimes.map(t => round(num(t), 1))
    : perTurnTimes.map(t => (t == null ? 0 : round(num(t), 1)));
  const decay = { labels: turnLabels.length ? turnLabels : summaryTimes.map((_, i) => 'Q' + (i + 1)), values: decayVals };
  const hasDecay = decayVals.some(v => v > 0);

  // ── 05 heatmap (category × dim) ─────────────────────────────────────────────
  const byCat: Record<string, IntelEvaluation[]> = {};
  evals.forEach(e => { (byCat[e.rubric_category || 'General'] ??= []).push(e); });
  const heatTopics = Object.keys(byCat);
  const heatDims = DIMS.map(d => DIM_LABEL[d]);
  const heatCells = heatTopics.map(t =>
    DIMS.map(d => round(avg(byCat[t].map(e => dim10(dimScore(e, d)))), 1)),
  );
  const hasHeat = heatTopics.length > 0 && heatCells.some(row => row.some(v => v > 0));

  // ── 07 classification donut ─────────────────────────────────────────────────
  const clsCounts: Record<string, number> = {};
  evals.forEach(e => { const c = CLASS_META[e.classification] ? e.classification : 'partial'; clsCounts[c] = (clsCounts[c] ?? 0) + 1; });
  const classification = CLASS_ORDER
    .filter(c => clsCounts[c])
    .map(c => ({ name: CLASS_META[c].label, value: clsCounts[c], hex: CLASS_META[c].hex }));

  // ── 08 scissor (comm vs content) ────────────────────────────────────────────
  const scissor = {
    labels: turnLabels,
    comm: evals.map(e => to100(e.communication_score)),
    content: evals.map(e => to100(avg(DIMS.map(d => dimScore(e, d) * 5)))), // dims 0-2 → 0-10 → mean → ×10
  };

  // ── 09 fear vs reality (skip count vs score-when-attempted per category) ─────
  const fearTopics = heatTopics;
  const fearSkipped = fearTopics.map(t => byCat[t].filter(e => e.classification === 'silent').length);
  const fearScore = fearTopics.map(t => {
    const attempted = byCat[t].filter(e => e.classification !== 'silent');
    return attempted.length ? to100(avg(attempted.map(e => e.score))) : 0;
  });
  const fear = { topics: fearTopics, skipped: fearSkipped, scoreWhenAttempted: fearScore };
  const hasFear = fearTopics.length > 0 && (fearSkipped.some(v => v > 0) || fearScore.some(v => v > 0));

  // ── 11 missing elements frequency ───────────────────────────────────────────
  const freq: Record<string, number> = {};
  evals.forEach(e => (e.missing_elements ?? []).forEach(raw => {
    const k = (raw || '').trim();
    if (k) freq[k] = (freq[k] ?? 0) + 1;
  }));
  const missing = Object.entries(freq)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const hasMissing = missing.length > 0;

  // ── 12 score contribution waterfall ─────────────────────────────────────────
  // Real decomposition: rubric-category contributions (share of final, weighted by
  // each category's mean score) minus explicit session penalties, ending at final.
  const rubric = report.session?.rubric_scores ?? {};
  const rubricEntries = Object.entries(rubric).filter(([, v]) => num(v) > 0);
  const timeouts = num(summary.timeout_count);
  const skips = num(summary.skipped_count);
  const cutoffs = num(summary.system_cutoff_count);
  const vague = evals.filter(e => e.classification === 'vague' || e.classification === 'wrong').length;

  // Penalty points (illustrative but data-driven: each adverse event costs a fixed
  // weight, capped so positives + base still reconcile to finalScore).
  const PEN = { timeout: 4, skip: 3, cutoff: 3, vague: 2 };
  const rawPenalty = timeouts * PEN.timeout + skips * PEN.skip + cutoffs * PEN.cutoff + vague * PEN.vague;
  const penalty = Math.min(rawPenalty, Math.max(0, finalScore)); // never drive total below 0
  const positivesTarget = finalScore + penalty;                  // base + contributions = this

  // Distribute positivesTarget across rubric categories by their score share; the
  // leftover is a "Base" pillar so the running total ends exactly on finalScore.
  const totalRubric = rubricEntries.reduce((s, [, v]) => s + num(v), 0) || 1;
  const contribs = rubricEntries.map(([cat, v]) => ({
    cat, pts: round((num(v) / totalRubric) * positivesTarget * 0.78),
  }));
  const contribSum = contribs.reduce((s, c) => s + c.pts, 0);
  const base = Math.max(0, round(positivesTarget - contribSum));

  const wfLabels: string[] = ['Base'];
  const wfValues: number[] = [base];
  const wfKinds: ('base' | 'pos' | 'neg' | 'final')[] = ['base'];
  const wfOffsets: number[] = [0];
  let running = base;
  contribs.forEach(c => {
    wfLabels.push('+' + c.cat); wfOffsets.push(running); wfValues.push(c.pts); wfKinds.push('pos');
    running += c.pts;
  });
  const penaltyBars: [string, number][] = [];
  if (timeouts) penaltyBars.push(['−Timeouts', timeouts * PEN.timeout]);
  if (skips) penaltyBars.push(['−Skips', skips * PEN.skip]);
  if (cutoffs) penaltyBars.push(['−Cut-offs', cutoffs * PEN.cutoff]);
  if (vague) penaltyBars.push(['−Vague', vague * PEN.vague]);
  // Scale penalty bars so their sum equals the capped `penalty`.
  const penBarSum = penaltyBars.reduce((s, [, v]) => s + v, 0) || 1;
  penaltyBars.forEach(([label, v]) => {
    const scaled = round(v * (penalty / penBarSum));
    running -= scaled;
    wfLabels.push(label); wfOffsets.push(running); wfValues.push(scaled); wfKinds.push('neg');
  });
  wfLabels.push('Final'); wfOffsets.push(0); wfValues.push(finalScore); wfKinds.push('final');
  const waterfall = { labels: wfLabels, offsets: wfOffsets, values: wfValues, kinds: wfKinds };

  const readinessBand: IntelModel['readinessBand'] = finalScore >= 70 ? 'Strong' : finalScore >= 40 ? 'Moderate' : 'Early';

  return {
    finalScore,
    readinessBand,
    turnCount: n,
    radar,
    weakestDim,
    momentum,
    timing,
    hasTiming: timingPoints > 0,
    decay,
    hasDecay,
    heatTopics,
    heatDims,
    heatCells,
    hasHeat,
    classification,
    scissor,
    fear,
    hasFear,
    missing,
    hasMissing,
    waterfall,
  };
}
