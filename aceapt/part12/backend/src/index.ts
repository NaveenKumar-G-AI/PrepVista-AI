import 'dotenv/config';
import { createServer } from './api/server';

const port = process.env.PORT ? Number(process.env.PORT) : 4000;
const app = createServer();

app.listen(port, () => {
  console.log(`ACEAPT Feature 12 backend listening on http://localhost:${port}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('ANTHROPIC_API_KEY not set — explanations will use the deterministic template. This is expected out of the box.');
  }
});
