const express = require('express');
const db = require('../db');
const { id } = require('../utils');
const { requireStudent, assertOwnership } = require('../middleware/auth');
const { parseAndIngest, runAnalysis } = require('../services/analysisOrchestrator');
const { RECOMMENDATION_COPY } = require('../services/priorityEngine');
const { buildEmphasis, buildStatementDeterministic } = require('../services/positioningService');
const { serializeOpportunitySummary, serializeOpportunityDetail, getLatestAnalysis, serializeAnalysis } = require('../services/serializers');

const router = express.Router();
router.use(requireStudent);

async function fetchJDFromUrl(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ACEAPTBot/1.0)' } });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, '\n')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return text.length > 200 ? text.slice(0, 20000) : null;
  } catch {
    return null;
  }
}

function findDuplicate(studentId, { source_url, company, role }) {
  if (source_url) {
    const bySource = db.prepare('SELECT * FROM opportunities WHERE student_id = ? AND source_url = ? AND status != ?')
      .get(studentId, source_url, 'ARCHIVED');
    if (bySource) return bySource;
  }
  if (company && role) {
    const byPair = db.prepare(`SELECT * FROM opportunities WHERE student_id = ? AND status != 'ARCHIVED'
      AND lower(company) = lower(?) AND lower(role) = lower(?)`).get(studentId, company, role);
    if (byPair) return byPair;
  }
  return null;
}

// GET /api/opportunities?tab=recommended|saved|shortlisted|all
router.get('/', (req, res) => {
  const tab = req.query.tab || 'all';
  let rows = db.prepare('SELECT * FROM opportunities WHERE student_id = ?').all(req.student.id);

  if (tab === 'saved') rows = rows.filter((r) => r.status === 'SAVED');
  else if (tab === 'shortlisted') rows = rows.filter((r) => r.status === 'SHORTLISTED');
  else if (tab === 'recommended') rows = rows.filter((r) => r.status === 'NEW');

  const summaries = rows.map((r) => serializeOpportunitySummary(r));

  if (tab === 'recommended') {
    summaries.sort((a, b) => (b.value_score ?? -1) - (a.value_score ?? -1));
  } else {
    summaries.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  res.json({ opportunities: summaries });
});

// POST /api/opportunities  { source_url?, raw_jd_text?, company?, role?, deadline? }
router.post('/', async (req, res) => {
  const { source_url, raw_jd_text, company, role, deadline } = req.body;

  if (!source_url && !raw_jd_text) {
    return res.status(400).json({ error: 'Provide a job URL or paste the job description text.' });
  }

  const duplicate = findDuplicate(req.student.id, { source_url, company, role });
  if (duplicate) {
    return res.status(409).json({
      error: 'This looks like an opportunity you already added.',
      existing_opportunity: serializeOpportunitySummary(duplicate),
    });
  }

  let jdText = raw_jd_text || null;
  let fetchFailed = false;
  if (!jdText && source_url) {
    jdText = await fetchJDFromUrl(source_url);
    if (!jdText) fetchFailed = true;
  }

  const oppId = id('opp');
  db.prepare(`INSERT INTO opportunities (id, student_id, role, company, source_url, source_type, raw_jd_text, deadline, status)
    VALUES (?,?,?,?,?,?,?,?, 'NEW')`).run(
    oppId, req.student.id, role || null, company || null, source_url || null,
    source_url ? 'EXTERNAL_SOURCE' : 'STUDENT_ADDED', jdText, deadline || null,
  );

  if (jdText) {
    await parseAndIngest(db, oppId, jdText);
    runAnalysis(db, oppId);
  }

  logEvent(req.student.id, 'opportunity_added', { opportunity_id: oppId, had_jd_text: Boolean(jdText) });

  const opp = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(oppId);
  res.status(201).json({
    opportunity: serializeOpportunityDetail(opp),
    needs_jd_text: fetchFailed,
    fetch_note: fetchFailed ? "We couldn't automatically read that page (many job sites block automated fetches). Paste the job description text to complete the analysis." : null,
  });
});

router.get('/:id', (req, res) => {
  const opp = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(req.params.id);
  if (!assertOwnership(opp, req, res)) return;
  logEvent(req.student.id, 'opportunity_viewed', { opportunity_id: opp.id });

  const detail = serializeOpportunityDetail(opp);

  // Deterministic-only preview (no AI call) so viewing a card never triggers
  // paid inference -- the full, potentially AI-enhanced statement is
  // generated once when the student actually starts an application.
  if (detail.analysis) {
    const positioningProfile = db.prepare('SELECT * FROM positioning_profiles WHERE student_id = ? AND is_active = 1').get(req.student.id);
    const differentiators = positioningProfile?.differentiators_json ? JSON.parse(positioningProfile.differentiators_json) : [];
    const emphasize = buildEmphasis(detail.requirements, detail.analysis.matches);
    detail.positioning_preview = {
      statement: buildStatementDeterministic({
        roleDirection: positioningProfile?.role_direction || req.student.target_role,
        emphasize,
        differentiators,
      }),
      emphasize,
    };
  }

  res.json(detail);
});

router.patch('/:id', async (req, res) => {
  const opp = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(req.params.id);
  if (!assertOwnership(opp, req, res)) return;

  const { status, company, role, deadline, raw_jd_text } = req.body;
  const setClauses = [];
  const params = { id: opp.id };
  if (status !== undefined) { setClauses.push('status = @status'); params.status = status; }
  if (company !== undefined) { setClauses.push('company = @company'); params.company = company; }
  if (role !== undefined) { setClauses.push('role = @role'); params.role = role; }
  if (deadline !== undefined) { setClauses.push('deadline = @deadline'); params.deadline = deadline; }
  if (raw_jd_text !== undefined) { setClauses.push('raw_jd_text = @raw_jd_text'); params.raw_jd_text = raw_jd_text; }

  if (setClauses.length > 0) {
    db.prepare(`UPDATE opportunities SET ${setClauses.join(', ')}, updated_at = datetime('now') WHERE id = @id`).run(params);
  }
  if (raw_jd_text !== undefined) await parseAndIngest(db, opp.id, raw_jd_text);
  if (setClauses.length > 0) runAnalysis(db, opp.id);

  if (status === 'SAVED') logEvent(req.student.id, 'opportunity_saved', { opportunity_id: opp.id });
  if (status === 'SHORTLISTED') logEvent(req.student.id, 'opportunity_shortlisted', { opportunity_id: opp.id });

  const updated = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(opp.id);
  res.json(serializeOpportunityDetail(updated));
});

router.post('/:id/analyze', (req, res) => {
  const opp = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(req.params.id);
  if (!assertOwnership(opp, req, res)) return;
  try {
    runAnalysis(db, opp.id);
    logEvent(req.student.id, 'opportunity_analyzed', { opportunity_id: opp.id });
    res.json(serializeOpportunityDetail(db.prepare('SELECT * FROM opportunities WHERE id = ?').get(opp.id)));
  } catch (err) {
    res.status(503).json({ error: 'Opportunity analysis is temporarily unavailable.', detail: err.message });
  }
});

router.get('/:id/should-i-apply', (req, res) => {
  const opp = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(req.params.id);
  if (!assertOwnership(opp, req, res)) return;

  const analysisRow = getLatestAnalysis(opp.id);
  if (!analysisRow) return res.status(202).json({ status: 'ANALYZING', message: 'Analysis is still being prepared for this opportunity.' });

  const analysis = serializeAnalysis(analysisRow);
  logEvent(req.student.id, 'should_apply_clicked', { opportunity_id: opp.id });

  res.json({
    recommendation: analysis.priority_recommendation,
    recommendation_label: RECOMMENDATION_COPY[analysis.priority_recommendation],
    confidence: analysis.confidence,
    why: analysis.why,
    gaps: analysis.gaps,
    application_effort: analysis.application_effort,
    safety_concern_level: analysis.safety_concern_level,
    next_action: analysis.next_action,
  });
});

function logEvent(studentId, eventType, payload) {
  db.prepare('INSERT INTO events (id, student_id, event_type, payload_json) VALUES (?,?,?,?)')
    .run(id('evt'), studentId, eventType, JSON.stringify(payload || {}));
}

module.exports = router;
