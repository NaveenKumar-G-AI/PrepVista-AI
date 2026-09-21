const router = require('express').Router();
const eventBus = require('../events/eventBus');

router.get('/:studentId', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
  res.json({ events: eventBus.list({ studentId: req.params.studentId, limit }) });
});

module.exports = router;
