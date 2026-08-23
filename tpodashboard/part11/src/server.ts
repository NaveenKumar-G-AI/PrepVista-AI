import 'dotenv/config';
import { createApp } from './app';
import { runMigrations } from './lib/db';

runMigrations();

const port = process.env.PORT ? Number(process.env.PORT) : 3000;
const app = createApp();

app.listen(port, () => {
  console.log(`PrepVista Part 11 (Admin, Security & Governance) listening on http://localhost:${port}`);
});
