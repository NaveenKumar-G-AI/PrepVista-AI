# Student workspace access

The shared student header provides Interview and Coding links on desktop and
mobile. Interview opens setup; Coding opens the practice catalog. The active
workspace is marked. Coding drafts use the existing account-scoped recovery
cache when switching routes. Active interview sessions retain their existing
finish/exit flow rather than gaining an unguarded navigation link.

For access by all signed-in students, configure the deployed backend:

```env
CODING_WORKSPACE_ENABLED=true
CODING_ALL_STUDENTS_ENABLED=true
```

Individual profile enrollment is unnecessary in this mode. Authentication is
still required. This grants practice access only; cloud sync, mentoring, trusted
validation, and readiness retain their existing flags and requirements. Interview
allowances are unchanged. Both access flags remain off in installation defaults;
deployment environment values must be set to enable access.

For a restricted pilot, set `CODING_ALL_STUDENTS_ENABLED=false` and supply exact
canonical profile IDs in `CODING_PILOT_PROFILE_IDS`. Empty or wildcard lists do
not grant pilot access. `CODING_WORKSPACE_ENABLED=false` disables access in both
modes. The new all-student option supersedes the earlier plan's pilot-only access
assumption; it does not qualify evidence or authorize a production release.
