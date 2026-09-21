const db = require('../db');
const { fromJSON } = require('../utils');
const { RECOMMENDATION_COPY } = require('./priorityEngine');

function getLatestAnalysis(opportunityId) {
  return db.prepare('SELECT * FROM opportunity_analysis WHERE opportunity_id = ? AND stale = 0 ORDER BY analyzed_at DESC LIMIT 1').get(opportunityId);
}

function serializeAnalysis(a) {
  if (!a) return null;
  return {
    ...a,
    why: fromJSON(a.why_json, []),
    gaps: fromJSON(a.gaps_json, []),
    matches: fromJSON(a.matches_json, []),
    dimensions: fromJSON(a.dimensions_json, {}),
    secondary_project_ids: fromJSON(a.secondary_project_ids_json, []),
  };
}

function serializeOpportunitySummary(opp) {
  const analysisRow = getLatestAnalysis(opp.id);
  const gaps = analysisRow ? fromJSON(analysisRow.gaps_json, []) : [];
  const why = analysisRow ? fromJSON(analysisRow.why_json, []) : [];
  return {
    id: opp.id,
    role: opp.role,
    company: opp.company,
    industry: opp.industry,
    location: opp.location,
    work_mode: opp.work_mode,
    seniority: opp.seniority,
    source_type: opp.source_type,
    source_url: opp.source_url,
    posting_date: opp.posting_date,
    deadline: opp.deadline,
    compensation_text: opp.compensation_text,
    status: opp.status,
    created_at: opp.created_at,
    priority_recommendation: analysisRow?.priority_recommendation || null,
    recommendation_label: analysisRow ? RECOMMENDATION_COPY[analysisRow.priority_recommendation] : null,
    value_score: analysisRow?.value_score ?? null,
    confidence: analysisRow?.confidence || null,
    portfolio_tag: analysisRow?.portfolio_tag || null,
    career_alignment: analysisRow?.career_alignment ?? null,
    application_effort: analysisRow?.application_effort || null,
    safety_concern_level: analysisRow?.safety_concern_level || null,
    top_gap: gaps[0] || null,
    top_why: why[0] || null,
    analyzed_at: analysisRow?.analyzed_at || null,
  };
}

function serializeOpportunityDetail(opp) {
  const requirements = db.prepare('SELECT * FROM opportunity_requirements WHERE opportunity_id = ? ORDER BY sort_order').all(opp.id);
  const analysisRow = getLatestAnalysis(opp.id);
  const analysis = serializeAnalysis(analysisRow);
  const safetySignals = db.prepare('SELECT * FROM opportunity_safety_signals WHERE opportunity_id = ?').all(opp.id);

  if (analysis) {
    analysis.best_project = analysis.best_project_id
      ? db.prepare('SELECT id, name FROM projects WHERE id = ?').get(analysis.best_project_id) || null
      : null;
    analysis.secondary_projects = analysis.secondary_project_ids; // already {project_id, name, matched_skills}[]
  }

  return {
    ...serializeOpportunitySummary(opp),
    raw_jd_text: opp.raw_jd_text,
    requirements,
    analysis,
    safety_signals: safetySignals,
  };
}

module.exports = { getLatestAnalysis, serializeAnalysis, serializeOpportunitySummary, serializeOpportunityDetail };
