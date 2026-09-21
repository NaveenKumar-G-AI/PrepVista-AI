require('dotenv').config({ quiet: true });
const express = require('express');
const cors = require('cors');

const aiClient = require('./services/aiClient');
const { simpleRateLimit } = require('./middleware/rateLimit');
const studentsRoute = require('./routes/students');
const opportunitiesRoute = require('./routes/opportunities');
const applicationsRoute = require('./routes/applications');
const followupsRoute = require('./routes/followups');
const insightsRoute = require('./routes/insights');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/api', simpleRateLimit());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', ai_enabled: aiClient.isAvailable() });
});

app.use('/api/students', studentsRoute);
app.use('/api/opportunities', opportunitiesRoute);
app.use('/api/applications', applicationsRoute);
app.use('/api/followups', followupsRoute);
app.use('/api/insights', insightsRoute);

app.use((req, res) => res.status(404).json({ error: 'Not found.' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error.' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Feature 39 backend listening on :${PORT}`);
  console.log(`AI-enhanced analysis: ${aiClient.isAvailable() ? 'ENABLED' : 'disabled (deterministic fallback active -- set ANTHROPIC_API_KEY to enable)'}`);
});
