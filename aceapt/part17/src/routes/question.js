const router = require('express').Router();
const orchestrator = require('../services/questionOrchestrator');

router.get('/next/:studentId', async (req, res) => {
  try {
    const result = await orchestrator.getNextQuestion(req.params.studentId, {
      skillId: req.query.skillId,
      mode: req.query.mode,
    });
    if (result.error) return res.status(422).json(result);
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/answer', async (req, res) => {
  try {
    const { studentId, questionId, optionId, responseTimeMs, hintsUsed } = req.body || {};
    if (!studentId || !questionId || !optionId) {
      return res.status(400).json({ error: 'studentId, questionId and optionId are required' });
    }
    const result = await orchestrator.submitAnswer(studentId, questionId, optionId, { responseTimeMs, hintsUsed });
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: e.message });
  }
});

router.get('/practice-set/:studentId', async (req, res) => {
  try {
    const result = await orchestrator.getPracticeSet(req.params.studentId);
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
