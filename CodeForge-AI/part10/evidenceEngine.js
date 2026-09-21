/**
 * Evidence Engine (Phase 32/33/35) — turns a project evaluation into
 * structured evidence records for your EXISTING mastery/readiness engine
 * to interpret. This module does not compute mastery, proficiency levels,
 * or skill levels itself, and it does not decide pass/fail thresholds —
 * that judgment belongs to whatever already turns evidence into a
 * technical_baseline / readiness score elsewhere in CodeForge/PrepVista.
 *
 * It only ever emits evidence for categories that were actually assessed —
 * see rubricEngine's renormalization. If AI was unavailable and
 * architecture/code_quality/documentation were never scored, no evidence
 * is emitted for them. No assessment, no evidence — never a fabricated one.
 *
 * @typedef {import('../types').CategoryScoreBreakdown} CategoryScoreBreakdown
 * @typedef {import('../types').EvidenceRecord} EvidenceRecord
 */

/**
 * @param {{ sessionId: string, studentId: string, submissionId: string }} ctx
 * @param {CategoryScoreBreakdown[]} breakdown - from evaluateSubmission's result
 * @param {string[]} projectSkills - skill tags declared on the project definition
 * @returns {EvidenceRecord[]}
 */
export function deriveEvidence(ctx, breakdown, projectSkills) {
  const now = new Date().toISOString();
  const records = [];

  for (const entry of breakdown) {
    // strengthSignal is a normalized 0-1 signal for this category's outcome,
    // deliberately not called a "score" or "mastery level" — the mastery
    // engine decides how to weigh it against other evidence over time,
    // including evidence from CodeForge's own diagnostic and PrepVista's
    // readiness engine.
    records.push({
      sessionId: ctx.sessionId,
      studentId: ctx.studentId,
      skillTag: entry.key,
      evidenceType: 'project_rubric_category',
      strengthSignal: Number((entry.rawScore / 100).toFixed(3)),
      source: 'project',
      sourceRef: ctx.submissionId,
      createdAt: now,
    });
  }

  for (const skill of projectSkills) {
    records.push({
      sessionId: ctx.sessionId,
      studentId: ctx.studentId,
      skillTag: skill,
      evidenceType: 'project_completion',
      strengthSignal: null, // presence-only signal — let the mastery engine weigh it by outcome
      source: 'project',
      sourceRef: ctx.submissionId,
      createdAt: now,
    });
  }

  return records;
}
