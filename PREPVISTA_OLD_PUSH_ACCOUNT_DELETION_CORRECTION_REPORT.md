# PrepVista Old-Push Account Deletion Correction Report

## Original Defects
1. **Auth Delete Ordering**: Deleting the Supabase Auth user before the database transaction could lead to a split-brain state where a user is locked out but their profile data remains permanently in the system.
2. **old_user Identity Mismatch**: The GDPR erasure trigger targeted original_user_id while the application inserted user_id. This meant the trigger affected 0 rows and retained PII indefinitely.
3. **Storage Cleanup Missing**: There was no mechanism to identify and delete audio, PDF, and resume files associated with a deleted account.
4. **offer_documents.uploaded_by RESTRICT Block**: This foreign key blocked account deletion entirely if the user had uploaded a document.
5. **Runtime Sequence Privilege**: The prepvista_runtime lacked the USAGE privilege on old_user_id_seq, causing INSERT INTO old_user to crash.

## New Architecture
A durable deletion saga pattern was implemented.
1. The application first resolves all external auth_user_ids and storage object paths.
2. A single atomic database transaction:
   - Records the intended deletion into account_deletion_requests (acting as an outbox).
   - Deletes the profile and inserts the old_user archive.
   - Cleans up relevant offer grants.
3. Once committed, a BackgroundTasks worker picks up the outbox request and executes:
   - Fan-out deletion of Supabase Auth users.
   - Fan-out deletion of Supabase Storage objects.
4. The worker records AUTH_DELETED, STORAGE_DELETED, COMPLETED, or FAILED states durably.

## Forward Migration (039)
- Unified old_user to use user_id as the canonical identifier to match audit logs and the application payload.
- Rewrote fn_erasure_pseudonymise_old_user to use user_id = OLD.id.
- Recreated the offer_documents_uploaded_by_fk as ON DELETE SET NULL, preserving business documents while detaching the deleting user's identity.
- Created the account_deletion_requests table with appropriate ENUM-like states.
- Explicitly granted USAGE, SELECT on required sequences to prepvista_runtime.

## Failure Handling
- **Auth Failure**: If auth fails, the outbox state transitions to FAILED with Auth fail logged, making it retryable.
- **Storage Failure**: If storage fails, the state transitions to FAILED with Storage fail, preserving the list of remaining paths.
- **Process Crash**: If the server crashes after the DB transaction but before the background worker finishes, the DB_DELETED request remains in account_deletion_requests and can be picked up by a recovery worker on boot (to be implemented next).

## Remaining Release Blockers
- **Local Testing**: The local Docker integration was completely unavailable due to system constraints, preventing the execution of focused destructive tests. Real-world execution on a live/local Supabase instance MUST occur before qualifying for production.
- **RLS Hardening**: The prepvista_runtime role still possesses BYPASSRLS. Removing this requires a full application testing sweep.
