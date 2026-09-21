const express = require('express');
const db = require('../db');
const { id, fromJSON, toJSON } = require('../utils');
const { requireStudent } = require('../middleware/auth');
const { APPLICATION_STAGES } = require('../constants');
const { serializeOpportunitySummary } = require('../services/serializers');
const { buildPositioning, selectBestProject, rankResumes, buildEmphasis, buildDeEmphasis } = require('../services/positioningService');
const { draftAnswer, draftRecruiterMessage, QUESTION_TYPES } = require('../services/applicationContentService');
const { computeResponsivenessState } = require('../services/followUpEngine');

const router = express.Router();
router.use(requireStudent);

const OUTCOME_TO_STAGE = { OFFER: 'OFFER', REJECTED: 'REJECTED', WITHDRAWN: 'WITHDRAWN', CLOSED: 'CLOSED' };

function logEvent(studentId, eventType, payload) {
  db.prepare('INSERT INTO events (id, student_id, event_type, payload_json) VALUES (?,?,?,?)').run(id('evt'), studentId, eventType, toJSON(payload || {}));
}

function loadContext(applicationId, req) {
  const application = db.prepare('SELECT * FROM applications WHERE id = ?').get(applicationId);
  if (!application || application.student_id !== req.student.id) return null;
  const opportunity = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(application.opportunity_id);
  return { application, opportunity };
}

function serializeApplication(application, opportunity) {
  return {
    id: application.id,
    stage: application.stage,
    resume_id: application.resume_id,
    positioning_statement: application.positioning_statement,
    applied_date: application.applied_date,
    outcome: application.outcome,
    outcome_notes: application.outcome_notes,
    responsiveness_state: computeResponsivenessState(application),
    created_at: application.created_at,
    updated_at: application.updated_at,
    opportunity: opportunity ? serializeOpportunitySummary(opportunity) : null,
  };
}

function latestAnalysisRow(opportunityId) {
  return db.prepare('SELECT * FROM opportunity_analysis WHERE opportunity_id = ? AND stale = 0 ORDER BY analyzed_at DESC LIMIT 1').get(opportunityId);
}

router.get('/', (req, res) => {
  let rows = db.prepare('SELECT * FROM applications WHERE student_id = ? ORDER BY updated_at DESC').all(req.student.id);
  if (req.query.stage) rows = rows.filter((a) => a.stage === req.query.stage);
  const withOpp = rows.map((a) => serializeApplication(a, db.prepare('SELECT * FROM opportunities WHERE id = ?').get(a.opportunity_id)));
  res.json({ applications: withOpp });
});

// Creates (or returns) the tracked application for an opportunity and
// generates its initial Application Strategy snapshot. This is the "Prepare
// Application" moment (spec section 28) -- it does NOT submit anything
// anywhere. Stage starts at PREPARING; moving to APPLIED is a separate,
// explicit student action (see PATCH /:id/stage).
router.post('/', async (req, res) => {
  const { opportunity_id } = req.body;
  const opportunity = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(opportunity_id);
  if (!opportunity || opportunity.student_id !== req.student.id) return res.status(404).json({ error: 'Opportunity not found.' });

  const existing = db.prepare('SELECT * FROM applications WHERE opportunity_id = ? AND student_id = ?').get(opportunity_id, req.student.id);
  if (existing) return res.status(200).json({ application: serializeApplication(existing, opportunity), already_existed: true });

  const requirements = db.prepare('SELECT * FROM opportunity_requirements WHERE opportunity_id = ?').all(opportunity_id);
  const evidenceList = db.prepare('SELECT * FROM evidence WHERE student_id = ?').all(req.student.id);
  const resumes = db.prepare('SELECT * FROM resumes WHERE student_id = ?').all(req.student.id);
  const positioningProfile = db.prepare('SELECT * FROM positioning_profiles WHERE student_id = ? AND is_active = 1').get(req.student.id);
  const analysisRow = latestAnalysisRow(opportunity_id);
  const matches = analysisRow ? fromJSON(analysisRow.matches_json, []) : [];

  const positioning = await buildPositioning({ student: req.student, positioningProfile, requirements, matches, evidenceList, opportunity });
  const ranked = rankResumes(resumes, requirements);

  const appId = id('app');
  db.prepare(`INSERT INTO applications (id, opportunity_id, student_id, stage, resume_id, positioning_statement)
    VALUES (?,?,?, 'PREPARING', ?, ?)`).run(appId, opportunity_id, req.student.id, ranked[0]?.resume_id || null, positioning.statement);
  db.prepare('INSERT INTO application_stage_history (id, application_id, stage, note) VALUES (?,?,?,?)')
    .run(id('hist'), appId, 'PREPARING', 'Application preparation started.');

  if (opportunity.status !== 'SHORTLISTED') {
    db.prepare("UPDATE opportunities SET status = 'SHORTLISTED', updated_at = datetime('now') WHERE id = ?").run(opportunity_id);
  }

  logEvent(req.student.id, 'application_started', { application_id: appId, opportunity_id });

  const created = db.prepare('SELECT * FROM applications WHERE id = ?').get(appId);
  res.status(201).json({ application: serializeApplication(created, opportunity) });
});

router.get('/:id', (req, res) => {
  const ctx = loadContext(req.params.id, req);
  if (!ctx) return res.status(404).json({ error: 'Not found.' });

  const documents = db.prepare('SELECT * FROM application_documents WHERE application_id = ? ORDER BY created_at DESC').all(ctx.application.id)
    .map((d) => ({ ...d, flagged_claims: fromJSON(d.flagged_claims_json, []) }));
  const stageHistory = db.prepare('SELECT * FROM application_stage_history WHERE application_id = ? ORDER BY changed_at ASC').all(ctx.application.id);
  const followups = db.prepare('SELECT * FROM followups WHERE application_id = ? ORDER BY created_at DESC').all(ctx.application.id);

  res.json({ ...serializeApplication(ctx.application, ctx.opportunity), documents, stage_history: stageHistory, followups });
});

router.patch('/:id', (req, res) => {
  const ctx = loadContext(req.params.id, req);
  if (!ctx) return res.status(404).json({ error: 'Not found.' });
  const { resume_id, followup_interval_days } = req.body;
  const setClauses = [];
  const params = { id: ctx.application.id };
  if (resume_id !== undefined) { setClauses.push('resume_id = @resume_id'); params.resume_id = resume_id; }
  if (followup_interval_days !== undefined) { setClauses.push('followup_interval_days = @followup_interval_days'); params.followup_interval_days = followup_interval_days; }
  if (setClauses.length === 0) return res.status(400).json({ error: 'No updatable fields provided.' });

  db.prepare(`UPDATE applications SET ${setClauses.join(', ')}, updated_at = datetime('now') WHERE id = @id`).run(params);
  const updated = db.prepare('SELECT * FROM applications WHERE id = ?').get(ctx.application.id);
  res.json(serializeApplication(updated, ctx.opportunity));
});

// The only place a stage becomes APPLIED -- always an explicit student
// action, never automatic (spec section 70, human approval before submission).
router.patch('/:id/stage', (req, res) => {
  const ctx = loadContext(req.params.id, req);
  if (!ctx) return res.status(404).json({ error: 'Not found.' });
  const { stage, note } = req.body;
  if (!APPLICATION_STAGES.includes(stage)) return res.status(400).json({ error: 'Unknown stage.' });

  const setNewAppliedDate = stage === 'APPLIED' && !ctx.application.applied_date;
  db.prepare(`UPDATE applications SET stage = @stage, updated_at = datetime('now')${setNewAppliedDate ? ", applied_date = datetime('now')" : ''} WHERE id = @id`)
    .run({ id: ctx.application.id, stage });
  db.prepare('INSERT INTO application_stage_history (id, application_id, stage, note) VALUES (?,?,?,?)')
    .run(id('hist'), ctx.application.id, stage, note || null);

  logEvent(req.student.id, 'application_stage_changed', { application_id: ctx.application.id, stage });
  if (stage === 'APPLIED') logEvent(req.student.id, 'application_submitted', { application_id: ctx.application.id });

  const updated = db.prepare('SELECT * FROM applications WHERE id = ?').get(ctx.application.id);
  res.json(serializeApplication(updated, ctx.opportunity));
});

router.post('/:id/outcome', (req, res) => {
  const ctx = loadContext(req.params.id, req);
  if (!ctx) return res.status(404).json({ error: 'Not found.' });
  const { outcome, notes } = req.body;
  if (!OUTCOME_TO_STAGE[outcome]) return res.status(400).json({ error: 'outcome must be one of OFFER, REJECTED, WITHDRAWN, CLOSED.' });

  const newStage = OUTCOME_TO_STAGE[outcome];
  db.prepare("UPDATE applications SET outcome = @outcome, outcome_notes = @notes, stage = @stage, updated_at = datetime('now') WHERE id = @id")
    .run({ outcome, notes: notes || null, stage: newStage, id: ctx.application.id });
  db.prepare('INSERT INTO application_stage_history (id, application_id, stage, note) VALUES (?,?,?,?)')
    .run(id('hist'), ctx.application.id, newStage, notes || null);

  logEvent(req.student.id, 'outcome_recorded', { application_id: ctx.application.id, outcome });

  const updated = db.prepare('SELECT * FROM applications WHERE id = ?').get(ctx.application.id);
  res.json(serializeApplication(updated, ctx.opportunity));
});

// The Application Pack (spec section 28): positioning, best project,
// resume ranking, emphasize/de-emphasize, drafted documents, follow-up state.
router.get('/:id/strategy', (req, res) => {
  const ctx = loadContext(req.params.id, req);
  if (!ctx) return res.status(404).json({ error: 'Not found.' });

  const requirements = db.prepare('SELECT * FROM opportunity_requirements WHERE opportunity_id = ?').all(ctx.opportunity.id);
  const evidenceList = db.prepare('SELECT * FROM evidence WHERE student_id = ?').all(req.student.id);
  const projects = db.prepare('SELECT * FROM projects WHERE student_id = ?').all(req.student.id);
  const resumes = db.prepare('SELECT * FROM resumes WHERE student_id = ?').all(req.student.id);
  const analysisRow = latestAnalysisRow(ctx.opportunity.id);
  const matches = analysisRow ? fromJSON(analysisRow.matches_json, []) : [];

  const emphasize = buildEmphasis(requirements, matches);
  const deEmphasize = buildDeEmphasis(evidenceList, emphasize);
  const { best, secondary } = selectBestProject(projects, requirements);
  const rankedResumes = rankResumes(resumes, requirements);
  const documents = db.prepare('SELECT * FROM application_documents WHERE application_id = ? ORDER BY created_at DESC').all(ctx.application.id)
    .map((d) => ({ ...d, flagged_claims: fromJSON(d.flagged_claims_json, []) }));
  const followups = db.prepare('SELECT * FROM followups WHERE application_id = ? ORDER BY created_at DESC').all(ctx.application.id);

  res.json({
    stage: ctx.application.stage,
    positioning_statement: ctx.application.positioning_statement,
    emphasize,
    de_emphasize: deEmphasize,
    best_project: best,
    secondary_projects: secondary,
    recommended_resumes: rankedResumes,
    selected_resume_id: ctx.application.resume_id,
    question_types: QUESTION_TYPES,
    documents,
    followups,
    responsiveness_state: computeResponsivenessState(ctx.application),
  });
});

router.post('/:id/documents', async (req, res) => {
  const ctx = loadContext(req.params.id, req);
  if (!ctx) return res.status(404).json({ error: 'Not found.' });
  const { doc_type, question_type } = req.body;
  if (!['ANSWER', 'RECRUITER_MESSAGE'].includes(doc_type)) return res.status(400).json({ error: 'doc_type must be ANSWER or RECRUITER_MESSAGE.' });
  if (doc_type === 'ANSWER' && !QUESTION_TYPES.some((q) => q.key === question_type)) {
    return res.status(400).json({ error: 'Unknown question_type.' });
  }

  const evidenceList = db.prepare('SELECT * FROM evidence WHERE student_id = ?').all(req.student.id);
  const requirements = db.prepare('SELECT * FROM opportunity_requirements WHERE opportunity_id = ?').all(ctx.opportunity.id);
  const analysisRow = latestAnalysisRow(ctx.opportunity.id);
  const matches = analysisRow ? fromJSON(analysisRow.matches_json, []) : [];
  const bestProject = analysisRow?.best_project_id ? db.prepare('SELECT * FROM projects WHERE id = ?').get(analysisRow.best_project_id) : null;

  const draftCtx = {
    company: ctx.opportunity.company,
    role: ctx.opportunity.role,
    industry: ctx.opportunity.industry,
    targetRole: req.student.target_role,
    careerDirection: req.student.career_direction,
    emphasize: buildEmphasis(requirements, matches),
    bestProjectName: bestProject?.name,
    bestProjectReason: analysisRow?.best_project_reason,
    positioningStatement: ctx.application.positioning_statement,
    studentName: req.student.name,
  };

  const result = doc_type === 'ANSWER'
    ? await draftAnswer({ questionType: question_type, ctx: draftCtx, evidenceList })
    : await draftRecruiterMessage({ ctx: draftCtx, evidenceList });

  const docId = id('doc');
  db.prepare(`INSERT INTO application_documents (id, application_id, doc_type, question, content, flagged_claims_json, generation_method)
    VALUES (?,?,?,?,?,?,?)`).run(docId, ctx.application.id, doc_type, question_type || null, result.text, toJSON(result.flagged_claims), result.method);

  logEvent(req.student.id, doc_type === 'ANSWER' ? 'application_answer_drafted' : 'recruiter_message_drafted', { application_id: ctx.application.id });

  res.status(201).json({
    id: docId, doc_type, question: question_type || null, content: result.text,
    flagged_claims: result.flagged_claims, generation_method: result.method,
  });
});

module.exports = router;
