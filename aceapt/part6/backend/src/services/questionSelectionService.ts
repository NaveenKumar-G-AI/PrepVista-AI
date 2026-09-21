import { getDb, fromJson } from '../db/db';
import { AssessmentBlueprint, Difficulty, Domain, ExposureStatus, Question, Topic } from '../domain/types';
import { DIFFICULTY_ORDER } from '../config/difficultyNorms';

interface CandidateRow {
  id: string;
  domain: Domain;
  topic: Topic;
  difficulty: Difficulty;
  times_seen: number;
  times_correct: number;
  times_incorrect: number;
  last_seen_at: string | null;
  statuses_json: string | null;
}

export interface SelectionResult {
  questionIds: string[];
  warnings: string[];
}

/** Proportionally splits `total` across weighted buckets, reconciling rounding onto the largest bucket. */
function splitByWeight<K extends string>(weights: Record<K, number>, total: number): Record<K, number> {
  const keys = Object.keys(weights) as K[];
  const raw = keys.map((k) => ({ k, v: weights[k] * total }));
  const counts = Object.fromEntries(raw.map(({ k, v }) => [k, Math.round(v)])) as Record<K, number>;
  let drift = total - keys.reduce((s, k) => s + counts[k], 0);
  // Distribute rounding drift one unit at a time onto whichever bucket has the largest weight.
  const order = [...keys].sort((a, b) => weights[b] - weights[a]);
  let i = 0;
  while (drift !== 0 && order.length > 0) {
    const k = order[i % order.length];
    if (drift > 0) {
      counts[k] += 1;
      drift -= 1;
    } else if (counts[k] > 0) {
      counts[k] -= 1;
      drift += 1;
    }
    i += 1;
    if (i > 10000) break; // safety valve
  }
  return counts;
}

function priorityScore(row: CandidateRow): number {
  // Lower = pick first. Unseen questions are always preferred (protects against
  // familiarity inflating readiness - section 12). Among seen questions, ones
  // the student previously got WRONG are reasonable to re-serve (checks real
  // improvement); ones repeatedly answered correctly are de-prioritized.
  if (row.times_seen === 0) return 0;
  const statuses = fromJson<ExposureStatus[]>(row.statuses_json, []);
  if (statuses.includes('REPEATEDLY_SUCCESSFUL')) return 3;
  if (row.times_incorrect > row.times_correct) return 1;
  return 2;
}

function pickCandidates(
  studentId: string,
  topic: Topic,
  difficulty: Difficulty,
  count: number,
  excludeIds: Set<string>
): string[] {
  if (count <= 0) return [];
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT q.id, q.domain, q.topic, q.difficulty,
              COALESCE(e.times_seen, 0) as times_seen,
              COALESCE(e.times_correct, 0) as times_correct,
              COALESCE(e.times_incorrect, 0) as times_incorrect,
              e.last_seen_at, e.statuses_json
       FROM questions q
       LEFT JOIN question_exposure e ON e.question_id = q.id AND e.student_id = ?
       WHERE q.topic = ? AND q.difficulty = ? AND q.health = 'HEALTHY'`
    )
    .all(studentId, topic, difficulty) as CandidateRow[];

  const available = rows.filter((r) => !excludeIds.has(r.id));
  available.sort((a, b) => {
    const p = priorityScore(a) - priorityScore(b);
    if (p !== 0) return p;
    const at = a.last_seen_at ? Date.parse(a.last_seen_at) : 0;
    const bt = b.last_seen_at ? Date.parse(b.last_seen_at) : 0;
    return at - bt; // older exposure (or never) first
  });

  return available.slice(0, count).map((r) => r.id);
}

function pickAnyHealthyInDomain(studentId: string, domain: Domain, count: number, excludeIds: Set<string>): string[] {
  if (count <= 0) return [];
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT q.id, q.domain, q.topic, q.difficulty,
              COALESCE(e.times_seen, 0) as times_seen,
              COALESCE(e.times_correct, 0) as times_correct,
              COALESCE(e.times_incorrect, 0) as times_incorrect,
              e.last_seen_at, e.statuses_json
       FROM questions q
       LEFT JOIN question_exposure e ON e.question_id = q.id AND e.student_id = ?
       WHERE q.domain = ? AND q.health = 'HEALTHY'`
    )
    .all(studentId, domain) as CandidateRow[];
  const available = rows.filter((r) => !excludeIds.has(r.id));
  available.sort((a, b) => priorityScore(a) - priorityScore(b));
  return available.slice(0, count).map((r) => r.id);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Selects a concrete, ordered list of question ids for a new assessment.
 * Never simply "SELECT ... ORDER BY RANDOM()" (section 11) - every pick is
 * blueprint-weighted and exposure-aware, with graceful, logged backfill if
 * the pool is thin for a given topic/difficulty cell (section 58: prefer
 * degrading gracefully over failing assessment creation outright).
 */
export function selectQuestions(studentId: string, blueprint: AssessmentBlueprint): SelectionResult {
  const warnings: string[] = [];
  const picked: string[] = [];
  const pickedSet = new Set<string>();

  const topicWeightMap = Object.fromEntries(
    blueprint.topicWeights.map((w) => [w.topic, w.weightPct / 100])
  ) as Record<Topic, number>;
  const topicCounts = splitByWeight(topicWeightMap, blueprint.questionCount);

  const domainByTopic = Object.fromEntries(blueprint.topicWeights.map((w) => [w.topic, w.domain])) as Record<
    Topic,
    Domain
  >;

  for (const topic of Object.keys(topicCounts) as Topic[]) {
    const topicTotal = topicCounts[topic];
    if (topicTotal <= 0) continue;

    const diffCounts = splitByWeight(blueprint.difficultyDistribution as unknown as Record<Difficulty, number>, topicTotal);

    for (const difficulty of DIFFICULTY_ORDER) {
      const need = diffCounts[difficulty] ?? 0;
      if (need <= 0) continue;

      let found = pickCandidates(studentId, topic, difficulty, need, pickedSet);
      found.forEach((id) => pickedSet.add(id));
      picked.push(...found);

      let deficit = need - found.length;
      if (deficit > 0) {
        // Backfill 1: adjacent difficulty tiers within the SAME topic.
        const idx = DIFFICULTY_ORDER.indexOf(difficulty);
        const adjacentOrder = [idx - 1, idx + 1, idx - 2, idx + 2]
          .filter((i) => i >= 0 && i < DIFFICULTY_ORDER.length)
          .map((i) => DIFFICULTY_ORDER[i]);
        for (const altDiff of adjacentOrder) {
          if (deficit <= 0) break;
          const more = pickCandidates(studentId, topic, altDiff, deficit, pickedSet);
          more.forEach((id) => pickedSet.add(id));
          picked.push(...more);
          deficit -= more.length;
        }
      }
      if (deficit > 0) {
        // Backfill 2: any healthy question in the same domain.
        const domain = domainByTopic[topic];
        const more = pickAnyHealthyInDomain(studentId, domain, deficit, pickedSet);
        more.forEach((id) => pickedSet.add(id));
        picked.push(...more);
        deficit -= more.length;
      }
      if (deficit > 0) {
        warnings.push(
          `Could not fill ${need - (need - deficit)} of ${need} slots for ${topic}/${difficulty} - question pool exhausted for this student's exposure state.`
        );
      }
    }
  }

  const ordered = orderForDelivery(picked, blueprint);
  return { questionIds: ordered, warnings };
}

/** Groups by section/domain order when the blueprint defines sections (full mock style exams); otherwise fully shuffles. */
function orderForDelivery(questionIds: string[], blueprint: AssessmentBlueprint): string[] {
  if (!blueprint.sections || blueprint.sections.length === 0) {
    return shuffle(questionIds);
  }
  const db = getDb();
  if (questionIds.length === 0) return [];
  const placeholders = questionIds.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT id, domain FROM questions WHERE id IN (${placeholders})`)
    .all(...questionIds) as { id: string; domain: Domain }[];
  const domainOf = new Map(rows.map((r) => [r.id, r.domain]));

  const ordered: string[] = [];
  for (const section of blueprint.sections) {
    const inSection = questionIds.filter((id) => section.domains.includes(domainOf.get(id) as Domain));
    ordered.push(...shuffle(inSection));
  }
  // Anything not captured by a defined section (shouldn't normally happen) goes at the end.
  const remaining = questionIds.filter((id) => !ordered.includes(id));
  return [...ordered, ...shuffle(remaining)];
}

export function getQuestionsByIds(ids: string[]): Question[] {
  if (ids.length === 0) return [];
  const db = getDb();
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(`SELECT * FROM questions WHERE id IN (${placeholders})`).all(...ids) as any[];
  const byId = new Map(rows.map((r) => [r.id, rowToQuestion(r)]));
  return ids.map((id) => byId.get(id)).filter(Boolean) as Question[];
}

export function rowToQuestion(r: any): Question {
  return {
    id: r.id,
    domain: r.domain,
    topic: r.topic,
    skill: r.skill,
    difficulty: r.difficulty,
    prompt: r.prompt,
    context: r.context ?? undefined,
    options: fromJson(r.options_json, []),
    correctOptionId: r.correct_option_id,
    explanation: r.explanation,
    expectedTimeSeconds: r.expected_time_seconds,
    health: r.health,
    tags: fromJson(r.tags_json, []),
    createdAt: r.created_at,
  };
}
