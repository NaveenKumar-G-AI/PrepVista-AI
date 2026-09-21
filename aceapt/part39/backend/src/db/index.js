const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

// Using Node's built-in SQLite (stable/unflagged since Node 22.5, still
// labeled experimental by Node itself) instead of the better-sqlite3 native
// addon. This is a deliberate reliability choice: better-sqlite3's install
// falls back to compiling from source (needing nodejs.org + build tools)
// whenever no prebuilt binary matches the platform/Node version, which can
// fail on restricted networks or machines without a C++ toolchain. Built-in
// SQLite means `npm install` never has a native compile step at all. Swap
// back to better-sqlite3 or point this at Postgres if you outgrow it --
// every query elsewhere in this codebase uses plain SQL via
// db.prepare(...).run/get/all(...), so the rest of the app doesn't change.

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'aceapt.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

function init() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
}

init();

module.exports = db;
