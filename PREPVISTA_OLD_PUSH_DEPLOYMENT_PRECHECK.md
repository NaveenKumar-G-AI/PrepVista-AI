# PrepVista Old-Push Deployment Precheck

## Operator Checklist
Do not proceed with deployment until every step in this precheck is verified.

### 1. Environment Verification
- [ ] Verify Production `.env` contains all required variables (`DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `SUPABASE_JWT_SECRET`, `INTERVIEW_AUDIO_BUCKET`, `OFFER_DOCUMENT_BUCKET`).
- [ ] Ensure frontend bundle environment only receives `NEXT_PUBLIC_*` safe variables. No `DATABASE_URL` or `SERVICE_KEY`.
- [ ] Verify CORS `ALLOWED_HOSTS` matches actual production frontend domains, and `CORS_ALLOWED_ORIGINS` explicitly lists the frontend URL (no `*`).

### 2. Backup Verification
- [ ] MANDATORY: Verify PostgreSQL automated backups are enabled and PITR (Point-In-Time Recovery) is active in the provider dashboard. Deployment is BLOCKED until backup frequency and retention are verified.
- [ ] Take a manual pre-deploy snapshot before applying new migrations (specifically 039/040).

### 3. Role Provisioning
- [ ] Execute `setup_runtime_role.py` or equivalent admin script to ensure the `prepvista_runtime` role exists, has `LOGIN`, and has a secure password.
- [ ] Ensure `prepvista_runtime` owns NO schema objects.

### 4. Migration Execution
- [ ] Apply migrations 001–040 using the designated migration runner (connecting via a separate `postgres` or admin migration role).
- [ ] Ensure `040_runtime_role_rls_hardening.sql` succeeds, correctly revoking global `BYPASSRLS` and applying explicit table-scoped `USING (true)` policies for the backend service role.

### 5. Runtime Role Verification
- [ ] Run `test_security.py` or manually connect as `prepvista_runtime` to verify:
  - `CREATE TABLE` fails (DDL blocked).
  - `INSERT INTO schema_migrations` fails.
  - Future tables fail closed.

### 6. Cron & Storage Verification
- [ ] Verify pg_cron is enabled in the database and Jobs (like `gdpr-pseudonymise-old-user` and `gdpr-hard-delete-old-user`) are scheduled.
- [ ] Ensure the storage buckets defined in `INTERVIEW_AUDIO_BUCKET` and `OFFER_DOCUMENT_BUCKET` exist in Supabase and are marked **PRIVATE**.
- [ ] Verify storage bucket access is properly gated via the `SUPABASE_SERVICE_KEY` on the backend.

### 7. Deployment
- [ ] Deploy the backend API.
- [ ] Deploy the frontend application.
- [ ] **Gap Acknowledgment**: Deploy the external durable worker or queue processor that will retry pending `account_deletion_requests` if the backend process crashes (as FastAPI `BackgroundTasks` do not survive restarts).

### 8. Readiness & Smoke Tests
- [ ] Monitor the `/health` and `/health/awake` endpoints. Ensure `status=ready` and `database=ok`.
- [ ] Create a synthetic account, start an interview, upload an offer document, and execute an account deletion.

### 9. Rollback Conditions
- [ ] If the new application version fails, rollback the application deployment. The previous application is **BACKWARD COMPATIBLE** with schema 040.
- [ ] Do NOT rollback `040_runtime_role_rls_hardening.sql` unless explicit database connectivity issues mandate restoring global `BYPASSRLS`.

### 10. Cron Monitoring
- [ ] Run `python check_cron.py` to verify pg_cron jobs are active and check run history for failures.
