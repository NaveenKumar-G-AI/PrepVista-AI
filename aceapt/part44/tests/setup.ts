// Loads .env before any test file runs, so `npm test` works the same
// way whether or not the shell already sourced .env. Node 20.6+ ships
// process.loadEnvFile() natively - no extra dependency needed.
import { existsSync } from "node:fs";

if (existsSync(".env")) {
  process.loadEnvFile(".env");
}
