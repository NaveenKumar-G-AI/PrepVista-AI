import { pool } from '../db/pool';
import { postgresEvidenceSource } from '../integrations/evidenceSource';
import { noopForecastSource } from '../integrations/forecastAdapter';
import { getAllTargetProfiles, getTargetProfile } from '../db/targetProfileRepository';
import { buildCapabilityDna } from '../engine/capabilityDna';
import { calculateAlignmentForAllTargets, calculateAlignment } from '../engine/alignmentEngine';
import { buildTargetPriorityShortlist } from '../engine/priorityShortlist';
import { runWhatIf } from '../engine/whatIfSimulator';
import { saveAlignmentResult, saveAlignmentSnapshot, saveAlignmentScenario, getStoredAlignmentResults, getAlignmentHistory, recordStudentTarget } from '../db/alignmentRepository';
import { sendGapToAdapt } from '../integrations/adaptAdapter';
import { sendTargetToProof } from '../integrations/proofAdapter';
import { AlignmentResult, CapabilityLevel, WhatIfResult } from '../domain/types';

/**
 * Recomputes alignment for every active target and persists both the
 * current cached result (spec §57) and a history snapshot (spec §33).
 * This is the operation event-driven recalculation (spec §58) should
 * eventually call in response to AssessmentCompleted / ProofCompleted /
 * CapabilityUpdated — for now the API layer calls it directly on GET
 * /align and POST /align/recalculate.
 */
export async function recalculateAlignment(studentId: string): Promise<AlignmentResult[]> {
  const [evidenceByCapability, targets] = await Promise.all([
    postgresEvidenceSource.getEvidenceForStudent(studentId),
    getAllTargetProfiles(true),
  ]);

  const dna = buildCapabilityDna(studentId, evidenceByCapability);

  const results: AlignmentResult[] = [];
  for (const target of targets) {
    const forecastSignals = await noopForecastSource.getForecastSignals(studentId, target.targetId);
    const result = calculateAlignment(dna, target, forecastSignals);
    results.push(result);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.actor_role', 'service', true)");
    for (const result of results) {
      await saveAlignmentResult(client, result);
      await saveAlignmentSnapshot(client, result);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  return results;
}

export async function getAlignmentDashboard(studentId: string) {
  let results = await getStoredAlignmentResults(studentId);
  if (results.length === 0) {
    // First visit / nothing cached yet — compute once rather than showing
    // an empty dashboard for a student who already has evidence.
    results = await recalculateAlignment(studentId);
  }

  const targets = await getAllTargetProfiles(true);
  const prepWeeks = Object.fromEntries(targets.map((t) => [t.targetId, t.typicalPreparationWeeks]));
  const { shortlist, awaitingEvidence } = buildTargetPriorityShortlist(results, prepWeeks);

  return { results, shortlist, awaitingEvidence };
}

export async function getTargetDetail(studentId: string, targetId: string): Promise<AlignmentResult | null> {
  const results = await getStoredAlignmentResults(studentId);
  const existing = results.find((r) => r.targetId === targetId);
  if (existing) return existing;

  // Not cached yet for this target specifically — compute it on demand.
  const target = await getTargetProfile(targetId);
  if (!target) return null;
  const evidenceByCapability = await postgresEvidenceSource.getEvidenceForStudent(studentId);
  const dna = buildCapabilityDna(studentId, evidenceByCapability);
  const forecastSignals = await noopForecastSource.getForecastSignals(studentId, targetId);
  const result = calculateAlignment(dna, target, forecastSignals);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.actor_role', 'service', true)");
    await saveAlignmentResult(client, result);
    await saveAlignmentSnapshot(client, result);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  return result;
}

export async function getHistory(studentId: string, targetId: string) {
  return getAlignmentHistory(studentId, targetId);
}

export async function runWhatIfForStudent(
  studentId: string,
  targetId: string,
  capabilityId: string,
  projectedLevel: CapabilityLevel,
): Promise<WhatIfResult | null> {
  const target = await getTargetProfile(targetId);
  if (!target) return null;
  const evidenceByCapability = await postgresEvidenceSource.getEvidenceForStudent(studentId);
  const dna = buildCapabilityDna(studentId, evidenceByCapability);
  const forecastSignals = await noopForecastSource.getForecastSignals(studentId, targetId);
  const result = runWhatIf(dna, target, { capabilityId, projectedLevel }, forecastSignals);
  await saveAlignmentScenario(result);
  return result;
}

/** spec §40: user clicks "Improve this gap" -> publish to Feature 26. */
export async function improveGap(studentId: string, targetId: string, capabilityId: string): Promise<boolean> {
  const result = await getTargetDetail(studentId, targetId);
  if (!result) return false;
  const gap = [...result.criticalGaps, ...result.supportingGaps].find((g) => g.capabilityId === capabilityId);
  if (!gap) return false;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.actor_role', 'service', true)");
    await sendGapToAdapt(client, studentId, gap, targetId, result.targetName, result.nextBestAction?.priorityScore ?? null);
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** spec §41: user clicks "Prove this target" -> publish to Feature 28. */
export async function proveTarget(studentId: string, targetId: string): Promise<boolean> {
  const target = await getTargetProfile(targetId);
  if (!target) return false;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.actor_role', 'service', true)");
    await sendTargetToProof(client, studentId, target);
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** spec §34: target drift — record a new selection without criticizing the change. */
export async function selectTarget(
  studentId: string,
  targetId: string,
  previousTargetId: string | null,
  reason: string | null,
): Promise<void> {
  await recordStudentTarget({
    studentId,
    targetId,
    selectedAt: new Date().toISOString(),
    previousTargetId,
    reason,
  });
}
