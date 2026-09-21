'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');
const opportunitiesRouter = require('./routes/opportunities.routes');
const studentsRouter = require('./routes/students.routes');
const demoRouter = require('./routes/demo.routes');
const { errorHandler } = require('./middleware/errorHandler');
const { requestLogger } = require('./middleware/requestLogger');

function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(requestLogger);

  app.get('/api/health', (req, res) => res.json({ ok: true, service: 'aceapt-feature-33' }));
  app.use('/api/opportunities', opportunitiesRouter);
  app.use('/api/students', studentsRouter);
  app.use('/api/demo', demoRouter);

  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
