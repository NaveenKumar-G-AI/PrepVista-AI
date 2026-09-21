require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const sessionRoutes = require('./src/routes/session');
const questionRoutes = require('./src/routes/question');
const studentRoutes = require('./src/routes/student');
const eventsRoutes = require('./src/routes/events');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/session', sessionRoutes);
app.use('/api/question', questionRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/events', eventsRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    generationMode: process.env.ANTHROPIC_API_KEY ? 'llm-capable' : 'template-and-bank-fallback',
  });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`ACEAPT Feature 17 prototype running on http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('[info] ANTHROPIC_API_KEY not set — Generation Engine running in template/bank-fallback mode.');
  }
});
