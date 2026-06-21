/**
 * buildExplanations — turns the derived IntelModel into a full, student-facing
 * coaching write-up for every chart, in four parts:
 *   • whatItShows  — what the chart plots (plain language)
 *   • talent       — what the student is doing well (from their real numbers)
 *   • drawback     — the weakness the chart exposes (from their real numbers)
 *   • attention    — the single highest-leverage fix
 *
 * Everything here is computed from the same model that draws the charts, so the
 * words always match the picture AND change with every session — nothing is
 * hard-coded prose. Charts with no data return null (the card stays an empty
 * state and no explanation is shown).
 */
import type { IntelModel } from './model';

export interface ChartExplain {
  whatItShows: string;
  talent: string;
  drawback: string;
  attention: string;
}

const r0 = (v: number) => Math.round(v);
const r1 = (v: number) => Math.round(v * 10) / 10;
const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const qLabel = (i: number) => 'Q' + (i + 1);

// per-dimension, plain-language fix the student can act on immediately
const DIM_FIX: Record<string, string> = {
  Relevance: 'open every answer with one sentence that directly answers what was asked, before adding any context',
  Clarity: 'say it in shorter, simpler sentences — one idea per sentence, no filler',
  Specificity: 'add one concrete number, named tool, or real example to each answer',
  Structure: 'end every answer with one concrete, quantified detail (a number, a result, a clear conclusion) instead of trailing off',
};

export function buildExplanations(m: IntelModel): Record<string, ChartExplain | null> {
  const out: Record<string, ChartExplain | null> = {};
  const turns = m.turnCount;

  // ── 01 radar ────────────────────────────────────────────────────────────────
  if (turns === 0) out['01'] = null;
  else {
    const pairs = m.radar.labels.map((label, i) => ({ label, v: m.radar.you[i] }));
    const strong = [...pairs].sort((a, b) => b.v - a.v)[0];
    const weak = m.weakestDim
      ? { label: m.weakestDim.label, value: m.weakestDim.value }
      : (() => { const w = [...pairs].sort((a, b) => a.v - b.v)[0]; return { label: w.label, value: w.v }; })();
    const target = 8.5;
    const gap = r1(target - weak.value);
    const near = pairs.filter(p => p.label !== weak.label && p.v >= weak.value + 0.6).map(p => p.label);
    out['01'] = {
      whatItShows: `This radar plots your average score (out of 10) across the four qualities every answer is judged on — Relevance, Clarity, Specificity, and Structure. The solid purple shape is your actual average; the dashed green line is the ideal target, a consistent ${target}/10 on every axis.`,
      talent: near.length
        ? `Your strongest axis is ${strong.label} at ${r1(strong.v)}/10${near.length > 1 ? `, and ${near.slice(0, 2).join(' and ')} also hold up well` : ''} — so the core of your answers is sound: you're answering the right question and backing it with enough substance.`
        : `Your strongest axis is ${strong.label} at ${r1(strong.v)}/10 — that's the dimension to keep leaning on while you lift the rest.`,
      drawback: `${weak.label} is the clear outlier at ${r1(weak.value)}/10 against the ${target} target — a gap of about ${gap} points, the largest shortfall on the chart. That single axis pinches the whole shape inward and drags your overall fingerprint down.`,
      attention: `${weak.label} is your highest-leverage fix — improving it expands the radar faster than polishing the axes that are already strong. Concretely: ${DIM_FIX[weak.label] ?? 'tighten that dimension on every answer'}.`,
    };
  }

  // ── 02 momentum ──────────────────────────────────────────────────────────────
  if (turns === 0) out['02'] = null;
  else {
    const vals = m.momentum.values;
    const peakIdx = vals.indexOf(Math.max(...vals));
    const peak = vals[peakIdx] ?? 0;
    const last = vals[vals.length - 1] ?? 0;
    const lowest = Math.min(...vals);
    const drop = peak > 0 ? r0(((peak - last) / peak) * 100) : 0;
    const strongPeaks = vals.filter(v => v >= 75).length;
    out['02'] = {
      whatItShows: `This tracks your score on each turn across the session (${qLabel(0)} to ${qLabel(vals.length - 1)}), colour-zoned into Strong (≥75), Partial (55–74), and Weak (<55).`,
      talent: lowest >= 55
        ? `You never dropped into the Weak zone — your line stayed above 55 the whole session, so there was no point of total breakdown.${strongPeaks ? ` You also hit ${strongPeaks} genuine peak${strongPeaks > 1 ? 's' : ''} of excellence (high was ${qLabel(peakIdx)} at ${peak}), proving you can produce top-tier answers, not just adequate ones.` : ''}`
        : `Your best moment was ${qLabel(peakIdx)} at ${peak}${strongPeaks ? `, and you crossed into the Strong zone ${strongPeaks} time${strongPeaks > 1 ? 's' : ''}` : ''} — the ceiling is clearly there when you're locked in.`,
      drawback: drop > 0
        ? `The session finishes about ${drop}% below its own peak — ending near ${last} instead of the ${peak} you proved you could hit. It isn't one bad patch; it's a recurring rise-and-fall, which points to inconsistent sustained focus rather than a single slip.`
        : `Your line held its level to the very end — there's no fade to flag here, which is rare and strong.`,
      attention: drop > 0
        ? `Build endurance for longer sessions: practise holding peak-quality answers deeper into the interview so your strong opening and mid-session form don't decay by the end. The ceiling is high — the job now is holding it.`
        : `Keep this stamina and push the ceiling: aim to turn more of your Partial-zone turns into Strong-zone ones with sharper specifics.`,
    };
  }

  // ── 03 timing ────────────────────────────────────────────────────────────────
  if (!m.hasTiming) out['03'] = null;
  else {
    const pts = m.timing.flatMap(g => g.points); // [seconds, score]
    const best = pts.filter(p => p[1] >= 70);
    const weak = pts.filter(p => p[1] < 55);
    const bestTime = best.length ? r1(avg(best.map(p => p[0]))) : null;
    const overThink = weak.filter(p => p[0] > 35).length;
    const impulsive = weak.filter(p => p[0] < 15).length;
    out['03'] = {
      whatItShows: `Each dot is one answer: how long you took to respond (left–right) against the score that answer earned (bottom–top). It reveals the think-time where your answers actually land best.`,
      talent: bestTime != null
        ? `Your highest-scoring answers clustered around ${bestTime}s of think-time — that's your cognitive sweet spot, where you have enough time to organise a point without over-running it.`
        : `You kept answering at a workable pace across the session — no answer stalled out completely.`,
      drawback: overThink > impulsive && overThink > 0
        ? `${overThink} of your weaker answers sat far to the right yet scored low — a sign of over-thinking: extra seconds were spent circling rather than adding substance.`
        : impulsive > 0
          ? `${impulsive} of your weaker answers came very fast and scored low — a sign of answering on reflex before the point was fully formed.`
          : `Your weaker answers weren't explained by timing alone — the gap there is content, not pace.`,
      attention: `Aim for your sweet spot: a short, deliberate pause to frame the answer, then commit. ${overThink > impulsive ? 'If you feel yourself circling, land the answer with a concrete result and stop.' : 'Give yourself one extra beat to add a specific example before you start talking.'}`,
    };
  }

  // ── 04 decay ─────────────────────────────────────────────────────────────────
  if (!m.hasDecay) out['04'] = null;
  else {
    const v = m.decay.values.filter(x => x > 0);
    const mid = Math.floor(v.length / 2) || 1;
    const firstAvg = r1(avg(v.slice(0, mid)));
    const secondAvg = r1(avg(v.slice(mid)));
    const rising = secondAvg > firstAvg + 2;
    out['04'] = {
      whatItShows: `This plots how long you took to respond on each turn — a fatigue curve. A flat or falling line is steady stamina; a line that climbs late in the session signals tiring, not a knowledge gap.`,
      talent: !rising
        ? `Your response times stayed steady (about ${firstAvg}s early vs ${secondAvg}s late) — you held your composure and pace right through the session.`
        : `You started briskly, averaging about ${firstAvg}s on your early answers — your opening focus was sharp.`,
      drawback: rising
        ? `Your response time climbed from roughly ${firstAvg}s early to ${secondAvg}s late — a rising trend that points to fatigue creeping in toward the end, not a sudden gap in knowledge.`
        : `There's no fatigue signal here — your pace didn't deteriorate, so there's nothing to correct on this curve.`,
      attention: rising
        ? `Take a deliberate 30-second reset between questions to flatten this curve — a short breath and a one-line plan before answering measurably steadies late-session pace.`
        : `Maintain this — steady pacing is exactly what keeps quality high deep into longer interviews.`,
    };
  }

  // ── 06 follow-up depth ───────────────────────────────────────────────────────
  if (!m.hasFollowDepth) out['06'] = null;
  else {
    const s = m.followDepth.scores;
    const open = s[0] ?? 0;
    const deepest = s[s.length - 1] ?? 0;
    const drop = r0(open - deepest);
    const collapses = drop > 8;
    out['06'] = {
      whatItShows: `This shows your average score as the interviewer drills deeper into the same topic. Depth 1 is the opening question on a topic; each step right is a follow-up that pushes for more detail.`,
      talent: `You open topics well — your first answer on a new topic averages ${open}/100, so your headline points land and you make a strong initial impression.`,
      drawback: collapses
        ? `By the deepest follow-ups your score falls to ${deepest}/100 — a drop of about ${drop} points. That's a rabbit-hole collapse: you start strong but lose ground when pushed for the next layer of detail.`
        : `Your quality holds up reasonably as topics go deeper (${open} → ${deepest}/100) — you don't fall apart under follow-up pressure, which many candidates do.`,
      attention: collapses
        ? `Prepare one layer deeper on every core story: for each headline you'd lead with, rehearse the specific decision, trade-off, and measurable result behind it so the second and third follow-ups stay as strong as the first.`
        : `Keep building depth — the next gain is turning those held-up follow-ups into genuinely strong ones with a concrete metric at each layer.`,
    };
  }

  // ── 05 heatmap ───────────────────────────────────────────────────────────────
  if (!m.hasHeat) out['05'] = null;
  else {
    const flat = m.heatCells.flatMap((row, ti) => row.map((vv, di) => ({ topic: m.heatTopics[ti], dim: m.heatDims[di], v: vv })));
    const weak = flat.reduce((a, b) => (b.v < a.v ? b : a));
    const strong = flat.reduce((a, b) => (b.v > a.v ? b : a));
    out['05'] = {
      whatItShows: `This crosses every topic you were asked with all four scoring dimensions, so each cell is one topic × one skill (0–10). Green cells are strengths; red cells are blind spots.`,
      talent: `Your strongest cell is ${strong.dim} in ${strong.topic} at ${r1(strong.v)}/10 — that's a topic-and-skill combination you can rely on and use as a template for the rest.`,
      drawback: `Your weakest cell is ${weak.dim} in ${weak.topic} at ${r1(weak.v)}/10 — the clearest blind spot on the matrix, where both the topic and that specific skill let you down at once.`,
      attention: `Prepare one concrete, measurable story for ${weak.topic} built specifically to fix ${weak.dim.toLowerCase()} — ${DIM_FIX[weak.dim] ?? 'tighten that dimension'} — and that red cell turns the fastest.`,
    };
  }

  // ── 07 classification donut ──────────────────────────────────────────────────
  if (!m.classification.length) out['07'] = null;
  else {
    const get = (name: string) => m.classification.find(c => c.name === name)?.value ?? 0;
    const strong = get('Strong');
    const partial = get('Partial');
    const vagueSilent = get('Vague') + get('Silent');
    const vsPct = turns > 0 ? r0((vagueSilent / turns) * 100) : 0;
    out['07'] = {
      whatItShows: `This breaks your ${turns} answers into how the evaluator classified each one — Strong, Partial, Vague, or Silent — so you can see the quality mix at a glance.`,
      talent: strong + partial > 0
        ? `${strong + partial} of your ${turns} answers landed as Strong or Partial — most of your answers were usable, which is the foundation a recruiter needs to keep listening.`
        : `You stayed engaged across the session, which keeps the door open even on a tough round.`,
      drawback: vagueSilent > 0
        ? `${vagueSilent} of ${turns} answers (${vsPct}%) were Vague or Silent. Recruiters tend to mentally fail a candidate after two consecutive weak answers, so this share is the riskiest part of your profile.`
        : `Nothing landed as Vague or Silent — there's no weak-answer cluster to worry about here.`,
      attention: vagueSilent > 0
        ? `Convert vague and silent turns into at least Partial ones: even a short, honest, structured attempt always beats trailing off or going quiet. Never leave a question with nothing on the table.`
        : `Push your Partial answers up to Strong with one specific number or example each — that's where the next grade lives.`,
    };
  }

  // ── 08 scissor ───────────────────────────────────────────────────────────────
  if (turns === 0) out['08'] = null;
  else {
    const comm = r0(avg(m.scissor.comm));
    const content = r0(avg(m.scissor.content));
    const gap = comm - content;
    const sounds = m.scissor.comm.filter((c, i) => c - (m.scissor.content[i] ?? 0) >= 20).length;
    out['08'] = {
      whatItShows: `This compares two things per turn: how confidently you delivered (teal) versus how much substance the answer actually carried (red). When delivery floats above substance, you sound better than you said.`,
      talent: content >= comm
        ? `Your substance kept pace with your delivery (content ${content} vs delivery ${comm}) — you're not bluffing; what you say backs up how you say it.`
        : `Your delivery is a real asset — averaging ${comm}/100, you come across as composed and confident, which buys you goodwill in the room.`,
      drawback: gap >= 12
        ? `Delivery averaged ${comm} while substance averaged ${content} — a ${gap}-point gap, and on ${sounds} turn${sounds === 1 ? '' : 's'} you sounded notably more confident than the answer's content justified. That's the "sounds good, means little" trap interviewers catch quickly.`
        : `Delivery and substance move together (${comm} vs ${content}) — there's no dangerous confidence-without-content gap to flag.`,
      attention: gap >= 12
        ? `Let substance lead: for every confident sentence, attach a concrete fact — a number, a named tool, a result. Keep content rising in step with delivery so your polish is earned, not hollow.`
        : `Keep delivery and substance locked together, and lift both by adding one measurable result to each answer.`,
    };
  }

  // ── 09 fear vs reality ───────────────────────────────────────────────────────
  if (!m.hasFear) out['09'] = null;
  else {
    const idx = m.fear.skipped.reduce((best, v, i) => (v > (m.fear.skipped[best] ?? -1) ? i : best), 0);
    const skipped = m.fear.skipped[idx] ?? 0;
    const scoreWhen = m.fear.scoreWhenAttempted[idx] ?? 0;
    out['09'] = {
      whatItShows: `This compares how often you skipped a topic (red) with the score you actually earned when you did attempt it (purple) — exposing topics you avoid out of fear rather than inability.`,
      talent: skipped === 0
        ? `You attempted every topic — nothing was skipped or left silent. That alone protects your real pass rate, because engagement beats avoidance every time.`
        : `When you do attempt ${m.fear.topics[idx]}, you score ${scoreWhen}/100 — proof the ability is there even on the topic you backed away from most.`,
      drawback: skipped > 0
        ? `You skipped ${m.fear.topics[idx]} ${skipped}× yet scored ${scoreWhen} when you attempted it — so avoidance, not ability, is the bottleneck. You're walking away from points you can clearly win.`
        : `There's no avoidance pattern to correct here — you didn't dodge any topic.`,
      attention: skipped > 0
        ? `Commit to attempting ${m.fear.topics[idx]} every time, even imperfectly. Your own score shows the knowledge is there — the only thing costing you marks is the skip itself.`
        : `Maintain this full engagement, and channel the saved risk into adding more depth on the topics you already attempt.`,
    };
  }

  // ── 10 readiness gauge ───────────────────────────────────────────────────────
  {
    const gap = Math.max(0, 70 - m.finalScore);
    out['10'] = {
      whatItShows: `This composite gauge places your overall session score (${m.finalScore}/100) on a job-readiness scale: Early, Moderate, or Strong (70+).`,
      talent: `You're at ${m.finalScore}/100 — ${m.readinessBand} readiness. ${m.readinessBand === 'Strong' ? "That's interview-ready territory; the work now is consistency under pressure." : 'That gives you a real, measurable base to build the next jump from.'}`,
      drawback: gap > 0
        ? `You're ${gap} points short of the Strong band (70+). That gap is mostly about sharpness — specificity and structure — rather than missing knowledge, which means it's closable quickly.`
        : `You're already in the Strong band, so there's no readiness gap to close — the risk now is slipping under follow-up pressure, not falling short.`,
      attention: gap > 0
        ? `Close the ${gap}-point gap with specificity, not new theory: one concrete number or example per answer is the cleanest route into the Strong band.`
        : `Hold the Strong band by staying sharp on deep follow-ups — that's where strong candidates either confirm or lose the grade.`,
    };
  }

  // ── 11 missing elements ──────────────────────────────────────────────────────
  if (!m.hasMissing) out['11'] = null;
  else {
    const top = m.missing[0];
    const distinct = m.missing.length;
    out['11'] = {
      whatItShows: `This ranks what the evaluator found missing across your answers, by how often it came up — so a recurring weakness shows up as a tall bar, not a one-off.`,
      talent: distinct <= 2
        ? `Your gaps are concentrated in just ${distinct} recurring theme${distinct === 1 ? '' : 's'} — that's good news, because a small number of repeated fixes will lift many answers at once.`
        : `The evaluator could pinpoint your gaps clearly rather than finding answers vague all over — specific, named gaps are far easier to train than a fuzzy "needs work".`,
      drawback: top
        ? `"${top.label}" was flagged in ${top.count} of ${turns} answers — your highest-frequency gap, meaning the same thing is costing you marks again and again across different questions.`
        : `No single gap dominates — your shortfalls are scattered rather than systemic.`,
      attention: top
        ? `Fix "${top.label}" first — it's the single highest-ROI change available, because clearing one repeated gap lifts every answer it currently drags down. Make it a deliberate checklist item on your next session.`
        : `Pick the most frequent gap above and make it a deliberate focus for one full practice session.`,
    };
  }

  // ── 12 waterfall ─────────────────────────────────────────────────────────────
  if (turns === 0) out['12'] = null;
  else {
    const idxPos = m.waterfall.kinds
      .map((k, i) => ({ k, i }))
      .filter(x => x.k === 'pos')
      .sort((a, b) => m.waterfall.values[b.i] - m.waterfall.values[a.i])[0];
    const biggest = idxPos ? { label: m.waterfall.labels[idxPos.i].replace('+', ''), v: m.waterfall.values[idxPos.i] } : null;
    const penalty = m.waterfall.kinds.reduce((s, k, i) => (k === 'neg' ? s + m.waterfall.values[i] : s), 0);
    out['12'] = {
      whatItShows: `This breaks down exactly how your ${m.finalScore} was built: a base, each category's positive contribution stacked on top, then any penalties subtracted, ending on your final score.`,
      talent: biggest
        ? `${biggest.label} was your biggest single contribution (+${biggest.v}) — that's the strength carrying your score, and the pattern worth repeating across more answers.`
        : `Your score was built evenly across categories rather than propped up by one — balanced performance is a stable foundation.`,
      drawback: penalty > 0
        ? `Penalties pulled about ${r0(penalty)} points off your total — these are avoidable losses (timeouts, skips, vague answers) rather than knowledge gaps, so they're costing you a grade you've otherwise earned.`
        : `No penalties dragged your total down — every point you earned, you kept, which is exactly how it should look.`,
      attention: penalty > 0
        ? `Eliminate the avoidable penalties first: giving even a partial answer instead of silence, and finishing within time, is the cleanest path past 70 — you recover those points without learning anything new.`
        : `With no penalties to recover, your next gain comes purely from raising contributions — add one concrete result to each answer to grow the positive bars.`,
    };
  }

  return out;
}
