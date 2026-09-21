import pg from "pg";

const { Pool } = pg;

export interface DbConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export function ownerConfigFromEnv(): DbConfig {
  return {
    host: process.env.DIAG_DB_HOST ?? "127.0.0.1",
    port: Number(process.env.DIAG_DB_PORT ?? 5432),
    database: process.env.DIAG_DB_NAME ?? "aceapt_diagnostic",
    user: process.env.DIAG_OWNER_USER ?? "diag_owner",
    password: process.env.DIAG_OWNER_PASSWORD ?? "",
  };
}

export function appConfigFromEnv(): DbConfig {
  return {
    host: process.env.DIAG_DB_HOST ?? "127.0.0.1",
    port: Number(process.env.DIAG_DB_PORT ?? 5432),
    database: process.env.DIAG_DB_NAME ?? "aceapt_diagnostic",
    user: process.env.DIAG_APP_USER ?? "diag_app",
    password: process.env.DIAG_APP_PASSWORD ?? "",
  };
}

/**
 * The app's runtime pool MUST connect as diag_app — never diag_owner. Every
 * table access from this pool goes through a SECURITY DEFINER function
 * (see db/migrations/002_rls_and_functions.sql). diag_app has no raw grants
 * on any per-student table, so even a SQL-injected query through this pool
 * cannot read or write another student's rows.
 */
export function createAppPool(config: DbConfig = appConfigFromEnv()) {
  return new Pool(config);
}

/** Owner pool — migrations and any back-office / blueprint-authoring tooling only. */
export function createOwnerPool(config: DbConfig = ownerConfigFromEnv()) {
  return new Pool(config);
}
