import path from 'node:path';
import { openDatabase } from '../db/connection.js';
import { buildApp } from './app.js';

const DB_PATH = path.join(process.cwd(), 'data', 'codeforge.db');
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

const db = openDatabase({ file: DB_PATH });
const app = buildApp(db);

app.listen(PORT, () => {
  console.log(`codeforge-role-context API listening on http://localhost:${PORT}/codeforge`);
  console.log(`Using database at ${DB_PATH} — run "npm run seed" first if it's empty.`);
});
