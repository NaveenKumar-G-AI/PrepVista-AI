import { createApp } from "./app.js";
import { openDb, ensureSchema, defaultDbPath } from "./db/connection.js";

const db = openDb();
ensureSchema(db);

const app = createApp(db);
const port = Number(process.env.PORT ?? 4000);

app.listen(port, () => {
  console.log(`PrepVista Companies & Recruiters API listening on http://localhost:${port}`);
  console.log(`Database: ${defaultDbPath}`);
});
