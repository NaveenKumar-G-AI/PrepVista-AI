import { createApp } from './api/server';

const app = createApp();
const port = Number(process.env.PORT) || 4019;

app.listen(port, () => {
  console.log('ACEAPT AI — Feature 19: Retention Intelligence');
  console.log(`Listening on http://localhost:${port}/api/feature19`);
  console.log(`Health check: http://localhost:${port}/health`);
});
