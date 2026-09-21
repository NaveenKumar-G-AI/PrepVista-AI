import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env.local") });
dotenv.config({ path: path.join(__dirname, "..", ".env") });

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set for tests. This test suite needs a real local Postgres " +
      "(see README 'Running the tests' — db/local-dev/000_local_shim.sql + db/migrations must be applied first)."
  );
}
