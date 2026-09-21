import type pg from "pg";
import { withTransaction } from "../db/client.js";
import {
  calculateAcceleration,
  calculateConfidence,
  calculateGrowth,
  calculateVelocity,
  detectMilestones,
  detectPlateau,
  detectRecovery,
  detectRegression,
  type EvidenceRef,
  type RegressionEvent,
  type SkillObservation,
  type TimePoint,
} from "../engine/index.js";

/** A submission counts as "successful" evidence at 60/100 or above. */
const SUCCESS_THRESHOLD = 60;

function toEvidenceRef(row: any, skillId: string): EvidenceRef {
  return {
    id: row.id,
    type: row.type,
    skillId,
    observedAt: new Date(row.observed_at).toISOString(),
    difficulty: row.difficulty ?? undefined,
    isTransfer: row.is_transfer ?? undefined,
    problemFamily: row.problem_family ?? undefined,
    dimension: row.dimension ?? undefined,
    demonstratesComplexityReasoning: row.demonstrates_complexity_reasoning ?? undefined,
    successful: row.score_raw != null ? Number(row.score_raw) >= SUCCESS_THRESHOLD : undefined,
  };
}

/**
 * Reconstructs the full observation history for a student+skill: one
 * SkillObservation per skill_signal row, each carrying every piece of
 * evidence observed at or before that signal's timestamp. This is what
 * lets milestone/comparability logic reason about "what was known when."
 */
async function loadObservationHistory(
  client: pg.PoolClient,
  studentId: string,
  skillId: string
): Promise<SkillObservation[]> {
  const signals = await client.query(
    `select id, value, calculation_version, assessment_type, source_type, role_relevance, observed_at
     from skill_signals where student_id = $1 and skill_id = $2 order by observed_at asc`,
    [studentId, skillId]
  );
  const evidenceAll = await client.query(
    `select id, type, difficulty, is_transfer, problem_family, dimension, demonstrates_complexity_reasoning, score_raw, observed_at
     from evidence_submissions
     where student_id = $1 and skill_id = $2 and invalidated = false
     order by observed_at asc`,
    [studentId, skillId]
  );

  return signals.rows.map((s) => {
    const cutoff = new Date(s.observed_at).getTime();
    const evidence = evidenceAll.rows
      .filter((e: any) => new Date(e.observed_at).getTime() <= cutoff)
      .map((e: any) => toEvidenceRef(e, skillId));
    return {
      skillId,
      value: Number(s.value),
      observedAt: new Date(s.observed_at).toISOString(),
      evidence,
      calculationVersion: s.calculation_version,
      assessmentType: s.assessment_type ?? undefined,
      sourceType: s.source_type,
      roleRelevance: s.role_relevance != null ? Number(s.role_relevance) : undefined,
    } satisfies SkillObservation;
  });
}

async function ensureBaseline(
  client: pg.PoolClient,
  studentId: string,
  skillId: string,
  history: SkillObservation[]
): Promise<void> {
  const version = history[history.length - 1]?.calculationVersion ?? "v1";
  const existing = await client.query(
    `select id from technical_baselines where student_id = $1 and skill_id = $2 and calculation_version = $3`,
    [studentId, skillId, version]
  );
  if ((existing.rowCount ?? 0) > 0) return;

  // Preference order per the baseline system: formal diagnostic, then
  // formal assessment, then the first sufficiently reliable evidence.
  // We deliberately do NOT fall back to "the very first submission" —
  // an unreliable first observation should not become the permanent
  // yardstick every future measurement is judged against.
  const diagnostic = history.find((o) => o.sourceType === "DIAGNOSTIC");
  const assessment = history.find((o) => o.sourceType === "ASSESSMENT");
  const reliable = history.find((o) => {
    const c = calculateConfidence(o);
    return c === "MODERATE" || c === "HIGH";
  });
  const chosen = diagnostic ?? assessment ?? reliable;
  const sourceEvidenceId = chosen?.evidence[chosen.evidence.length - 1]?.id;
  if (!chosen || !sourceEvidenceId) return; // not enough reliable evidence yet — no baseline forced

  await client.query(
    `insert into technical_baselines (student_id, skill_id, value, confidence, source_type, source_id, calculation_version)
     values ($1,$2,$3,$4,$5,$6,$7)
     on conflict (student_id, skill_id, calculation_version) do nothing`,
    [studentId, skillId, chosen.value, calculateConfidence(chosen), chosen.sourceType, sourceEvidenceId, version]
  );
}

export interface IngestResult {
  status: "PROCESSED" | "ALREADY_PROCESSED";
  snapshotId?: string;
  newMilestones?: string[];
}

/**
 * The single entry point that turns "the Skill Signal system produced a new
 * value" into everything Growth Tracking owns: a snapshot, a growth
 * measurement (if a comparable baseline exists), milestone checks, and
 * trend/regression/recovery detection. Safe to call more than once for the
 * same skill_signal id — a Postgres advisory lock serializes concurrent
 * calls for the same signal, and the first one to commit "wins"; every
 * later call for the same id returns ALREADY_PROCESSED without writing
 * anything twice.
 */
export async function ingestSkillSignalUpdate(skillSignalId: string): Promise<IngestResult> {
  return withTransaction(async (client) => {
    const idempotencyKey = `skill_signal:${skillSignalId}`;

    // Serialize concurrent processing of the same signal so two workers
    // racing on the same evidence can't both "win".
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [idempotencyKey]);

    const already = await client.query(
      "select id from technical_growth_events where idempotency_key = $1",
      [idempotencyKey]
    );
    if ((already.rowCount ?? 0) > 0) {
      return { status: "ALREADY_PROCESSED" };
    }

    const signalRes = await client.query(
      `select id, student_id, skill_id, value, calculation_version, observed_at
       from skill_signals where id = $1`,
      [skillSignalId]
    );
    if (signalRes.rowCount === 0) throw new Error(`skill_signal ${skillSignalId} not found`);
    const signal = signalRes.rows[0];

    const history = await loadObservationHistory(client, signal.student_id, signal.skill_id);
    const latest = history[history.length - 1];
    if (!latest) throw new Error("observation history unexpectedly empty after signal insert");

    const distinctEvidenceTypes = new Set(latest.evidence.map((e) => e.type)).size;

    const snapshotRes = await client.query(
      `insert into technical_growth_snapshots
         (student_id, skill_id, value, confidence, evidence_count, evidence_diversity, calculation_version, observed_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       returning id`,
      [
        signal.student_id,
        signal.skill_id,
        latest.value,
        calculateConfidence(latest),
        latest.evidence.length,
        distinctEvidenceTypes,
        latest.calculationVersion,
        latest.observedAt,
      ]
    );
    const snapshotId = snapshotRes.rows[0].id as string;

    await ensureBaseline(client, signal.student_id, signal.skill_id, history);

    // Growth measurement: baseline vs. latest, only written if genuinely comparable.
    const baselineRow = await client.query(
      `select value, source_type, calculation_version, source_id
       from technical_baselines where student_id = $1 and skill_id = $2 and calculation_version = $3`,
      [signal.student_id, signal.skill_id, latest.calculationVersion]
    );
    if ((baselineRow.rowCount ?? 0) > 0 && history.length > 1) {
      const b = baselineRow.rows[0];
      const baselineObs: SkillObservation = {
        skillId: signal.skill_id,
        value: Number(b.value),
        observedAt: history[0]!.observedAt,
        evidence: history[0]!.evidence,
        calculationVersion: b.calculation_version,
        sourceType: b.source_type,
      };
      const growth = calculateGrowth(baselineObs, latest);
      if (!growth.unavailable) {
        // Find (or lazily accept re-pointing to) the snapshot row nearest the baseline observation.
        const baselineSnapshot = await client.query(
          `select id from technical_growth_snapshots
           where student_id = $1 and skill_id = $2 order by observed_at asc limit 1`,
          [signal.student_id, signal.skill_id]
        );
        const baselineSnapshotId = baselineSnapshot.rows[0]?.id ?? snapshotId;
        await client.query(
          `insert into skill_growth_measurements
             (student_id, skill_id, baseline_snapshot_id, current_snapshot_id, absolute_change, relative_change, confidence, evidence_count, calculation_version)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            signal.student_id,
            signal.skill_id,
            baselineSnapshotId,
            snapshotId,
            growth.absoluteChange,
            growth.relativeChange,
            growth.confidence,
            growth.evidenceCount,
            latest.calculationVersion,
          ]
        );
      }
    }

    // Milestones — insert-or-ignore, so re-detection across runs never duplicates.
    const milestones = detectMilestones(signal.skill_id, history);
    const newMilestones: string[] = [];
    for (const m of milestones) {
      const res = await client.query(
        `insert into growth_milestones (student_id, skill_id, type, achieved_at, evidence_ids, description)
         values ($1,$2,$3,$4,$5,$6)
         on conflict (student_id, skill_id, type) do nothing
         returning id`,
        [signal.student_id, signal.skill_id, m.type, m.achievedAt, JSON.stringify(m.evidenceIds), m.description]
      );
      if ((res.rowCount ?? 0) > 0) {
        newMilestones.push(m.type);
        await client.query(
          `insert into technical_growth_events (student_id, skill_id, event_type, payload, idempotency_key)
           values ($1,$2,'MILESTONE_ACHIEVED',$3,$4)
           on conflict (idempotency_key) do nothing`,
          [
            signal.student_id,
            signal.skill_id,
            JSON.stringify(m),
            `milestone:${signal.student_id}:${signal.skill_id}:${m.type}`,
          ]
        );
      }
    }

    // Trend detection over the full snapshot series for this skill.
    const seriesRes = await client.query(
      `select value, observed_at from technical_growth_snapshots
       where student_id = $1 and skill_id = $2 order by observed_at asc`,
      [signal.student_id, signal.skill_id]
    );
    const points: TimePoint[] = seriesRes.rows.map((r) => ({
      value: Number(r.value),
      observedAt: new Date(r.observed_at).toISOString(),
    }));

    const velocity = calculateVelocity(points);
    const acceleration = calculateAcceleration(points);
    const plateau = detectPlateau(points);
    const regression = detectRegression(points);

    // A NEW regression is confirmed the moment the series' current tail
    // shows a sustained decline. Idempotency key includes troughObservedAt,
    // so re-detecting the same episode on later calls is a safe no-op.
    if (regression.status === "REGRESSION_DETECTED" && regression.event) {
      const key = `regression:${signal.student_id}:${signal.skill_id}:${regression.event.troughObservedAt}`;
      await client.query(
        `insert into technical_growth_events (student_id, skill_id, event_type, payload, idempotency_key)
         values ($1,$2,'REGRESSION_DETECTED',$3,$4)
         on conflict (idempotency_key) do nothing`,
        [signal.student_id, signal.skill_id, JSON.stringify(regression.event), key]
      );
    }

    // Recovery is checked independently of the current call's tail trend:
    // by the time a student has recovered, the series is trending UP, so
    // detectRegression(points) on the full history no longer reports
    // REGRESSION_DETECTED at all. Recovery has to be evaluated against
    // every regression episode that hasn't been closed out yet, using the
    // points observed after THAT episode's own trough — not the latest
    // slope, which is exactly what "still declining" would test instead.
    const openRegressions = await client.query(
      `select payload from technical_growth_events
       where student_id = $1 and skill_id = $2 and event_type = 'REGRESSION_DETECTED'`,
      [signal.student_id, signal.skill_id]
    );
    const resolvedRes = await client.query(
      `select payload ->> 'troughObservedAt' as trough from technical_growth_events
       where student_id = $1 and skill_id = $2 and event_type = 'RECOVERY_DETECTED'`,
      [signal.student_id, signal.skill_id]
    );
    const resolvedTroughs = new Set(resolvedRes.rows.map((r) => r.trough));

    for (const row of openRegressions.rows) {
      const episode = row.payload as RegressionEvent;
      if (resolvedTroughs.has(episode.troughObservedAt)) continue;

      const after = points.filter(
        (p) => new Date(p.observedAt).getTime() > new Date(episode.troughObservedAt).getTime()
      );
      if (after.length === 0) continue;

      const recovery = detectRecovery(episode, after);
      if (recovery.status === "RECOVERED") {
        const recKey = `recovery:${signal.student_id}:${signal.skill_id}:${episode.troughObservedAt}`;
        await client.query(
          `insert into technical_growth_events (student_id, skill_id, event_type, payload, idempotency_key)
           values ($1,$2,'RECOVERY_DETECTED',$3,$4)
           on conflict (idempotency_key) do nothing`,
          [
            signal.student_id,
            signal.skill_id,
            JSON.stringify({ ...recovery, troughObservedAt: episode.troughObservedAt }),
            recKey,
          ]
        );
      }
    }

    // The row that makes this whole operation idempotent — written last,
    // once everything above has succeeded within this transaction.
    await client.query(
      `insert into technical_growth_events (student_id, skill_id, event_type, payload, idempotency_key)
       values ($1,$2,'SNAPSHOT_CREATED',$3,$4)`,
      [
        signal.student_id,
        signal.skill_id,
        JSON.stringify({ snapshotId, value: latest.value, velocity, acceleration, plateau }),
        idempotencyKey,
      ]
    );

    return { status: "PROCESSED", snapshotId, newMilestones };
  });
}
