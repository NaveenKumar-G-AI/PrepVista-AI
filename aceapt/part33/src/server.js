'use strict';

const { createApp } = require('./app');
const config = require('./config');

const app = createApp();
app.listen(config.port, () => {
  console.log(`ACEAPT Feature 33 (Opportunity-to-Action Engine) listening on http://localhost:${config.port}`);
});
