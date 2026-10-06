# PrepVista Old-Push: Automatic Render Deployment

This document outlines the zero-downtime automatic deployment workflow on Render. The backend will automatically bootstrap database roles, apply missing schema migrations, verify the ledger, and start the application.

## 1. Render Backend Start Command

Configure your Render web service to use this exact start command (or update your Dockerfile CMD):

```bash
python -m app.deployment.start
```

*(This launcher encapsulates Gunicorn/Uvicorn startup, preserving all existing options like workers and ports).*

## 2. Required Backend Environment Variables

To securely separate migration privileges from runtime privileges, you must configure TWO distinct database connection strings in Render:

| Variable | Role Required | Purpose |
|----------|---------------|---------|
| `MIGRATION_DATABASE_URL` | `postgres` (or equivalent admin) | Used strictly for executing DDL/migrations and bootstrapping roles during deployment. It is removed from memory before the web server starts. |
| `DATABASE_URL` | `prepvista_runtime` | The least-privilege connection used by the actual application. Cannot perform schema alterations. |

### Other Key Variables:
- `SUPABASE_URL`: Your online production Supabase project URL.
- `SUPABASE_ANON_KEY`: Your production public anon key.
- `SUPABASE_SERVICE_KEY`: Your backend-only service key.
- `SUPABASE_JWT_SECRET`: Your backend-only JWT secret.
- `FRONTEND_URL` / `BACKEND_URL`: Your exact HTTPS Render origins.
- `CORS_ALLOWED_ORIGINS`: Your Render frontend HTTPS URL.
- `AUTO_MIGRATE_ON_DEPLOY`: Defaults to `true` in production. Controls automatic deployment migrations.

## 3. What Happens During Deployment

1. **Environment Validation**: Validates that production does not use `localhost` or the `postgres` role for `DATABASE_URL`.
2. **Lock Acquisition**: Acquires a distributed PostgreSQL advisory lock. If multiple Render instances boot simultaneously, only one will perform the migrations.
3. **Role Bootstrap**: Non-destructively creates or updates `prepvista_runtime` and `prepvista_worker` to enforce least-privilege rules (e.g., `NOBYPASSRLS`).
4. **Migration Execution**: Applies any missing `.sql` files from `app/database/migrations` exactly once.
5. **Ledger Verification**: Checks `schema_migrations` checksums to guarantee the physical schema perfectly matches the deployed codebase.
6. **Credential Purge**: `MIGRATION_DATABASE_URL` is completely removed from the environment.
7. **Server Start**: Launches the normal FastAPI server using `DATABASE_URL`.

## 4. What Happens if Migration Fails?

If any migration fails to execute, or if the ledger detects a checksum mismatch (e.g., someone altered a historical migration file), the deployment launcher **aborts immediately** with a non-zero exit code.
- The FastAPI application will **not** start.
- Render will mark the deploy as **Failed**.
- To fix, check the Render logs to identify the broken SQL script or checksum drift, correct it in the codebase, and push a new commit.

## 5. How to Inspect Readiness

Once the application boots, you can externally verify that the schema, roles, and migration ledger are perfectly aligned by pinging the backend's readiness endpoint:

```
GET https://<your-backend-url>/health/ready
```
If it returns a `200 OK`, your Supabase database is completely compatible with your deployed codebase and ready to accept traffic.
