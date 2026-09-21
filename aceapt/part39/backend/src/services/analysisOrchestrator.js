const { id, toJSON } = require('../utils');
const jdParser = require('./jdParser');
const { matchRequirementsToEvidence, computeFitDimensions } = require('./matchingEngine');
const { computePriority } = require('./priorityEngine');
const { checkOpportunitySafety } = require('./safetyChecker');
const { selectBestProject } = require('./positioningService');

function ingestRequirements(db, opportunityId, parsed) {
  const insert = db.prepare(`INSERT INTO opportunity_requirements
    (id, opportunity_id, requirement_text, category, priority, req_type, skill_key, explanation, sort_order)
    VALUES (@id, @opportunity_id, @requirement_text, @category, @priority, @req_type, @skill_key, @explanation, @sort_order)`);

  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM opportunity_requirements WHERE opportunity_id = ?').run(opportunityId);
    for (const r of parsed.requirements) insert.run({ id: id('req'), opportunity_id: opportunityId, ...r });
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// Parses raw JD text, stores requirements, and backfills any opportunity
// fields the student left blank (never overwrites what they typed).
async function parseAndIngest(db, opportunityId, rawText) {
  const parsed = await jdParser.parseJD(rawText);
  ingestRequirements(db, opportunityId, parsed);

  const fieldMap = {
    role: parsed.role_guess,
    seniority: parsed.seniority_guess !== 'UNKNOWN' ? parsed.seniority_guess : null,
    work_mode: parsed.work_mode_guess !== 'UNKNOWN' ? parsed.work_mode_guess : null,
    location: parsed.location_guess,
    compensation_text: parsed.compensation_guess,
    deadline: parsed.deadline_guess,
  };

  const existing = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(opportunityId);
  const setClauses = [];
  const params = { id: opportunityId };
  for (const [key, value] of Object.entries(fieldMap)) {
    if (value && !existing[key]) {
      setClauses.push(`${key} = @${key}`);
      params[key] = value;
    }
  }
  if (setClauses.length > 0) {
    db.prepare(`UPDATE opportunities SET ${setClauses.join(', ')}, updated_at = datetime('now') WHERE id = @id`).run(params);
  }

  return parsed;
}

// Full pipeline: load state -> match -> score -> prioritize -> persist as a
// cached analysis row (spec section 81 -- never recompute AI/heavy analysis
// on every page load; this is called once on ingest and again only on
// explicit re-analyze or when underlying data changes).
function runAnalysis(db, opportunityId) {
  const opportunity = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(opportunityId);
  if (!opportunity) throw new Error('Opportunity not found');

  const requirements = db.prepare('SELECT * FROM opportunity_requirements WHERE opportunity_id = ? ORDER BY sort_order').all(opportunityId);
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(opportunity.student_id);
  const evidenceList = db.prepare('SELECT * FROM evidence WHERE student_id = ?').all(opportunity.student_id);
  const projects = db.prepare('SELECT * FROM projects WHERE student_id = ?').all(opportunity.student_id);

  const safety = checkOpportunitySafety(opportunity);
  const matches = matchRequirementsToEvidence(requirements, evidenceList);
  const dimensions = computeFitDimensions({ student, opportunity, requirements, matches, projects, safety });
  const priority = computePriority({ dimensions, safety, matches, requirements });
  const { best, secondary } = selectBestProject(projects, requirements);

  db.prepare('UPDATE opportunity_analysis SET stale = 1 WHERE opportunity_id = ?').run(opportunityId);

  const analysisId = id('analysis');
  db.prepare(`INSERT INTO opportunity_analysis (
    id, opportunity_id, career_alignment, capability_fit, evidence_fit, experience_fit, project_relevance,
    location_fit, work_mode_fit, compensation_fit, opportunity_quality, application_effort, safety_concern_level,
    priority_recommendation, value_score, confidence, portfolio_tag, next_action, why_json, gaps_json, matches_json, dimensions_json,
    best_project_id, best_project_reason, secondary_project_ids_json, analysis_method
  ) VALUES (
    @id, @opportunity_id, @career_alignment, @capability_fit, @evidence_fit, @experience_fit, @project_relevance,
    @location_fit, @work_mode_fit, @compensation_fit, @opportunity_quality, @application_effort, @safety_concern_level,
    @priority_recommendation, @value_score, @confidence, @portfolio_tag, @next_action, @why_json, @gaps_json, @matches_json, @dimensions_json,
    @best_project_id, @best_project_reason, @secondary_project_ids_json, @analysis_method
  )`).run({
    id: analysisId,
    opportunity_id: opportunityId,
    career_alignment: dimensions.career_alignment,
    capability_fit: dimensions.capability_fit,
    evidence_fit: dimensions.evidence_fit,
    experience_fit: dimensions.experience_fit,
    project_relevance: dimensions.project_relevance,
    location_fit: dimensions.location_fit,
    work_mode_fit: dimensions.work_mode_fit,
    compensation_fit: dimensions.compensation_fit,
    opportunity_quality: dimensions.opportunity_quality,
    application_effort: dimensions.application_effort,
    safety_concern_level: safety.concern_level,
    priority_recommendation: priority.priority_recommendation,
    value_score: priority.value_score,
    confidence: priority.confidence,
    portfolio_tag: priority.portfolio_tag,
    next_action: priority.next_action,
    why_json: toJSON(priority.why),
    gaps_json: toJSON(priority.gaps),
    matches_json: toJSON(matches),
    dimensions_json: toJSON(dimensions),
    best_project_id: best ? best.project_id : null,
    best_project_reason: best ? best.reason : null,
    secondary_project_ids_json: toJSON(secondary),
    analysis_method: 'DETERMINISTIC',
  });

  db.prepare('DELETE FROM opportunity_safety_signals WHERE opportunity_id = ?').run(opportunityId);
  const insertSignal = db.prepare('INSERT INTO opportunity_safety_signals (id, opportunity_id, signal, detail, severity) VALUES (?,?,?,?,?)');
  for (const s of safety.signals) insertSignal.run(id('safety'), opportunityId, s.signal, s.detail, s.severity);

  return db.prepare('SELECT * FROM opportunity_analysis WHERE id = ? AND stale = 0').get(analysisId);
}

module.exports = { ingestRequirements, parseAndIngest, runAnalysis };
