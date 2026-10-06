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
 * Chart #6 (rabbit-hole collapse by follow-up depth) derives "follow-up depth"
 * from runs of consecutive same-topic turns (see below) — an honest signal built
 * from the per-turn rubric_category + score already in the payload.
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
    final_score: number | null;
    readiness_eligible?: boolean;
    score_contributions?: Record<string, number>;
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

  // 06 — rabbit-hole collapse by follow-up depth (avg score per depth, 0–100)
  followDepth: { depths: string[]; scores: number[]; counts: number[] };
  hasFollowDepth: boolean;

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

export function buildIntel(report: IntelReport): IntelModel | null {
  const supplied = report.evaluations ?? [];
  const measured = (value: unknown) => typeof value === "number" && Number.isFinite(value);
  if (!measured(report.session?.final_score) || report.session?.readiness_eligible === false || !supplied.length
      || supplied.some(e => ![e.score, e.communication_score, e.relevance_score, e.clarity_score, e.specificity_score, e.structure_score].every(measured))) return null;
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
  const timingRows = perTurnTimes.every(t => t == null) && summaryTimes.length
    ? summaryTimes.map((t, i) => ({ label: 'Q' + (i + 1), value: t })).filter(row => measured(row.value))
    : evals.map(e => ({ label: 'Q' + e.turn_number, value: e.answer_duration_seconds })).filter(row => measured(row.value));
  const decay = { labels: timingRows.map(row => row.label), values: timingRows.map(row => round(Number(row.value), 1)) };
  const hasDecay = timingRows.length > 0;

  // ── 05 heatmap (category × dim) ─────────────────────────────────────────────
  const byCat: Record<string, IntelEvaluation[]> = {};
  evals.forEach(e => { (byCat[e.rubric_category || 'General'] ??= []).push(e); });
  const heatTopics = Object.keys(byCat);
  const heatDims = DIMS.map(d => DIM_LABEL[d]);
  const heatCells = heatTopics.map(t =>
    DIMS.map(d => round(avg(byCat[t].map(e => dim10(dimScore(e, d)))), 1)),
  );
  const hasHeat = heatTopics.length > 0 && heatCells.some(row => row.some(v => v > 0));

  // ── 06 rabbit-hole collapse by follow-up depth ──────────────────────────────
  // "Follow-up depth" = position within a run of consecutive turns on the SAME
  // topic (rubric_category): depth 1 is the opening question on a topic, depth 2
  // its first follow-up, and so on. Averaging the answer score at each depth
  // reveals whether quality collapses as the interviewer drills deeper. Derived
  // purely from real per-turn data already in the payload — no new source needed.
  const depthScores: Record<number, number[]> = {};
  let runDepth = 0;
  let prevCat: string | null = null;
  evals.forEach(e => {
    const cat = e.rubric_category || 'General';
    runDepth = cat === prevCat ? runDepth + 1 : 1;
    prevCat = cat;
    (depthScores[runDepth] ??= []).push(to100(e.score));
  });
  const depthKeys = Object.keys(depthScores).map(Number).sort((a, b) => a - b);
  const followDepth = {
    depths: depthKeys.map(d => 'Depth ' + d),
    scores: depthKeys.map(d => round(avg(depthScores[d]))),
    counts: depthKeys.map(d => depthScores[d].length),
  };
  // Honest only when at least one topic was actually drilled to depth ≥ 2.
  const hasFollowDepth = depthKeys.some(d => d >= 2);

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
  const fearTopics = heatTopics.filter(t => byCat[t].some(e => e.classification !== 'silent'));
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
  // Backend weighted contributions only. No illustrative penalties/base.
  const contributions = Object.entries(report.session?.score_contributions ?? {}).filter(([,value]) => Number.isFinite(value));
  let running = 0;
  const wfOffsets = contributions.map(([,value]) => { const previous = running; running += value; return previous; });
  const waterfall: IntelModel['waterfall'] = {
    labels: contributions.length ? [...contributions.map(([key]) => key), 'Final'] : [],
    offsets: contributions.length ? [...wfOffsets, 0] : [],
    values: contributions.length ? [...contributions.map(([,value]) => value), finalScore] : [],
    kinds: contributions.length ? [...contributions.map(() => 'pos' as const), 'final'] : [],
  };

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
    followDepth,
    hasFollowDepth,
    classification,
    scissor,
    fear,
    hasFear,
    missing,
    hasMissing,
    waterfall,
  };
}
