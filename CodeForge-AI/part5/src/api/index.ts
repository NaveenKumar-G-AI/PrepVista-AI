import { createDb, runMigrations } from '../db/client.js';
import { seed } from '../db/seed.js';
import { createAIProvider } from '../ai/index.js';
import { createServer } from './server.js';

const db = createDb();
runMigrations(db);

const existingSkills = db.prepare('SELECT COUNT(*) as c FROM skills').get() as { c: number };
if (existingSkills.c === 0) {
  seed(db);
}

const ai = createAIProvider();
const app = createServer(db, ai);
const port = Number(process.env.PORT) || 3000;

app.listen(port, () => {
  console.log(`CodeForge Adaptive Engine listening on http://localhost:${port}`);
  console.log(`AI provider: ${ai.name}`);
  console.log(`Try: curl -X POST http://localhost:${port}/api/auth/demo-login -H "Content-Type: application/json" -d '{"studentId":"student_demo_1"}'`);
});
