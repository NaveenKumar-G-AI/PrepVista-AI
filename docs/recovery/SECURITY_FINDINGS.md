# Security verification ledger

## PV-SEC-001: protected fields exposed by browser write policies

Migration 001 allowed row-owner UPDATE on profiles and INSERT/UPDATE on interview_sessions. With normal browser table grants, this also permitted changing is_admin, plan and final_score. No subsequent policy removal existed. A local PostgreSQL authenticated-role test reproduced the writes.

Migration 045 removes those browser write policies and explicitly revokes table mutation privileges from anon/authenticated when present. Existing SELECT policies remain. Authorized FastAPI backend writes remain functional. The frontend uses the API for these mutations. The test confirms denial after applying the migration twice, owner-scoped reads and backend updates. Actual deployed grants have not been inspected; all work is local by user instruction.

## Evaluation recovery boundary

Retry verifies owner and finished state under a session lock, validates the UUID, applies the existing rate limiter, accepts no answer/model/score override, and loads saved source messages. Job tables have RLS and no browser policies. Queues cannot upgrade client code results into trusted execution evidence. Background errors use structured type/code metadata rather than raw provider exceptions.

Existing tenant isolation, coding VM limits, guest-import ownership, concurrent quotas, assignment sharing and reviewer consent tests remain required. The production dependency npm audit reported zero findings for the installed frontend production graph. This is not a complete penetration test, backend vulnerability audit or verification of deployed Supabase grants.
