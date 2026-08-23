import { openDb, ensureSchema, defaultDbPath } from "./connection.js";

const db = openDb();
ensureSchema(db);
console.log(`Schema applied to ${defaultDbPath}`);
db.close();
