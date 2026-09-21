/**
 * Populates data/db.json with one demo student whose attempt history is
 * hand-authored (not randomly generated) to walk through the section 48
 * demo narrative for Probability, plus a spread of other skills so the
 * mastery map isn't a wall of one repeated example:
 *
 *   percentage         -> healthy chain, rich evidence -> Robust Mastery
 *   profit_loss        -> depends on percentage, decent evidence -> Stable
 *   discount           -> depends on profit_loss, barely started -> Developing
 *                          (deliberately left thin so you can trigger a
 *                          live mastery check on it from the UI)
 *   ratios              -> weak independent accuracy -> Developing
 *   ratio_proportion    -> depends on (weak) ratios -> Developing + root-cause gap
 *   probability         -> the section 48 walkthrough: practice, first
 *                          mastery check exposes transfer + difficulty
 *                          gaps, intervention, second check, retention check
 *   permutations        -> was Stable, a later retention check shows decay
 *   data_interpretation -> composite of percentage+ratios, almost no
 *                          attempts on record -> insufficient evidence
 *
 * All numbers below are the actual numbers the engine computes from —
 * nothing is hard-coded downstream. Run `npm run seed` to regenerate.
 */

import { AttemptEvent, AttemptSource } from './domain/types';
import { QUESTIONS, SKILLS } from './data/seedData';
import { db } from './data/store';

const STUDENT_ID = 'demo-student';
const STUDENT_NAME = 'Aisha Verma';

const questionsById = new Map(QUESTIONS.map((q) => [q.id, q]));

function daysAgo(n: number, hourOffset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(9 + hourOffset, 0, 0, 0);
  return d.toISOString();
}

let counter = 0;
function ev(
  questionId: string,
  correct: boolean,
  daysAgoVal: number,
  opts: Partial<Pick<AttemptEvent, 'independent' | 'hintUsed' | 'retries' | 'source' | 'masteryCheckId'>> & { hourOffset?: number } = {}
): AttemptEvent {
  counter += 1;
  const q = questionsById.get(questionId);
  if (!q) throw new Error(`Seed error: unknown question ${questionId}`);
  return {
    id: `evt_${String(counter).padStart(4, '0')}`,
    studentId: STUDENT_ID,
    skillId: q.skillId,
    questionId,
    correct,
    independent: opts.independent ?? true,
    hintUsed: opts.hintUsed ?? false,
    solutionViewed: false,
    retries: opts.retries ?? 0,
    responseTimeMs: 25000 + Math.round(Math.random() * 20000),
    timestamp: daysAgo(daysAgoVal, opts.hourOffset ?? 0),
    source: (opts.source ?? 'practice') as AttemptSource,
    masteryCheckId: opts.masteryCheckId,
  };
}

const attempts: AttemptEvent[] = [];

// --------------------------------------------------------------- percentage
// Rich, consistent evidence across difficulty, format, context and novelty,
// plus a delayed retention check -> should resolve to Robust Mastery.
attempts.push(
  ev('p1', true, 62, { independent: false, hintUsed: true }),
  ev('p2', true, 62, { independent: false, hintUsed: true }),
  ev('p1', true, 60), ev('p2', true, 60), ev('p3', true, 60),
  ev('p4', true, 45), ev('p5', true, 45), ev('p6', true, 45), ev('p10', true, 45),
  ev('p7', true, 30), ev('p8', true, 30), ev('p9', true, 30),
  ev('p1', true, 5, { source: 'retention_check' }),
  ev('p4', true, 5, { source: 'retention_check' }),
  ev('p7', true, 5, { source: 'retention_check' }),
  ev('p9', true, 5, { source: 'retention_check' })
);

// -------------------------------------------------------------- profit_loss
// Solid independent performance, no delayed check yet -> Stable, with a
// visible (and honestly reported) format/context spread gap.
attempts.push(
  ev('pl1', true, 24), ev('pl2', true, 24), ev('pl3', true, 24), ev('pl4', true, 24),
  ev('pl5', true, 24), ev('pl6', false, 24), ev('pl7', true, 24), ev('pl8', true, 24)
);

// ---------------------------------------------------------------- discount
// Barely started on purpose -> "Developing" with low confidence. Use the
// "Start a mastery check" flow in the UI to generate fresh, live evidence.
attempts.push(
  ev('d1', true, 3, { independent: false, hintUsed: true }),
  ev('d2', true, 3, { independent: false, hintUsed: true }),
  ev('d1', true, 3)
);

// ------------------------------------------------------------------ ratios
// Weak independent accuracy -> stays in Developing, and is weak enough
// (below the root-cause floor) to explain a downstream gap.
attempts.push(
  ev('r1', true, 40), ev('r2', true, 40), ev('r3', false, 40),
  ev('r4', false, 40), ev('r5', false, 40), ev('r6', true, 40)
);

// ------------------------------------------------------------ ratio_proportion
// Also weak — and because its prerequisite (ratios) is independently weak
// with enough evidence of its own, the root-cause engine should point here.
attempts.push(
  ev('rp1', true, 38), ev('rp2', false, 38), ev('rp3', false, 38),
  ev('rp4', false, 38), ev('rp5', true, 38)
);

// -------------------------------------------------------------- probability
// The section 48 walkthrough.
// Phase 1 — practice: mostly easy/medium, mostly familiar.
attempts.push(
  ev('pr1', true, 35, { independent: false, hintUsed: true }),
  ev('pr2', true, 35, { independent: false, hintUsed: true }),
  ev('pr1', true, 35), ev('pr2', true, 35), ev('pr3', true, 35),
  ev('pr4', true, 35), ev('pr5', true, 35), ev('pr6', false, 35)
);
// Phase 2 — first mastery check: familiar questions hold up, novel/hard
// questions expose the gap.
attempts.push(
  ev('pr10', true, 20, { source: 'mastery_check', masteryCheckId: 'mc-prob-1' }),
  ev('pr3', true, 20, { source: 'mastery_check', masteryCheckId: 'mc-prob-1' }),
  ev('pr5', true, 20, { source: 'mastery_check', masteryCheckId: 'mc-prob-1' }),
  ev('pr7', false, 20, { source: 'mastery_check', masteryCheckId: 'mc-prob-1' }),
  ev('pr8', false, 20, { source: 'mastery_check', masteryCheckId: 'mc-prob-1' }),
  ev('pr9', false, 20, { source: 'mastery_check', masteryCheckId: 'mc-prob-1' })
);
// Phase 3 — Feature 12 intervention happens here (not simulated as
// attempts; see /api/students/:id/skills/:skillId/intervene).
// Phase 4 — second mastery check, post-intervention: novel/hard performance
// improves, though not perfectly — this is one round of improvement, not a
// finished story.
attempts.push(
  ev('pr7', true, 9, { source: 'mastery_check', masteryCheckId: 'mc-prob-2' }),
  ev('pr8', true, 9, { source: 'mastery_check', masteryCheckId: 'mc-prob-2' }),
  ev('pr9', false, 9, { source: 'mastery_check', masteryCheckId: 'mc-prob-2' }),
  ev('pr11', true, 9, { source: 'mastery_check', masteryCheckId: 'mc-prob-2' }),
  ev('pr4', true, 9, { source: 'mastery_check', masteryCheckId: 'mc-prob-2' })
);
// Phase 5 — later retention check.
attempts.push(
  ev('pr1', true, 2, { source: 'retention_check' }),
  ev('pr7', true, 2, { source: 'retention_check' })
);

// ----------------------------------------------------------------- permutations
// Looked Stable a while ago; a recent retention check shows decay.
attempts.push(
  ev('pm1', true, 50), ev('pm2', true, 50), ev('pm3', true, 50), ev('pm4', true, 50),
  ev('pm1', true, 50, { hourOffset: 2 }), ev('pm2', true, 50, { hourOffset: 2 }),
  ev('pm5', true, 6, { source: 'retention_check' }),
  ev('pm6', false, 6, { source: 'retention_check' })
);

// ------------------------------------------------------------ data_interpretation
// Deliberately almost untouched -> insufficient evidence, not a guess.
attempts.push(
  ev('di1', true, 4, { independent: false, hintUsed: true }),
  ev('di1', true, 4)
);

function run() {
  const store = db.get();
  store.students.set(STUDENT_ID, { id: STUDENT_ID, name: STUDENT_NAME });
  for (const skill of SKILLS) store.skills.set(skill.id, skill);
  for (const q of QUESTIONS) store.questions.set(q.id, q);
  store.attempts = attempts;
  store.masteryChecks.clear();
  store.transitions = [];
  store.snapshots = [];
  db.flush();

  console.log(`Seeded ${attempts.length} attempt events for ${STUDENT_NAME} (${STUDENT_ID}) across ${SKILLS.length} skills.`);
  console.log(`Data written to backend/data/db.json`);
}

run();
