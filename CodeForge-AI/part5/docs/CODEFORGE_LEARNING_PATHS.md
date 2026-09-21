# Learning Paths: Roles, Goals, Time, Spaced Review

## Role × Skill matrix (Phase 28/29)

`roles` and `role_skill_priority` tables hold `(role, skill, priority, target_level)` as pure data (`src/config/roleSkillMatrix.ts`, seeded into the DB — never branching logic in the recommendation code). 8 roles are seeded (Software Engineer, Backend/Frontend/Full Stack Developer, Data Scientist, ML Engineer, Data Engineer, DevOps Engineer); the ML Engineer row set matches the spec's own worked example (Python Collections → VERY_HIGH, Python/Algorithms/Data Structures → HIGH). `roleRelevance` in the ranking engine reads this table directly.

## Student goals (Phase 30)

`students.goal` is one of `PLACEMENT_PREPARATION`, `INTERVIEW_PREPARATION`, `DSA_MASTERY`, `GENERAL_CODING`, `ROLE_PREPARATION`, `LANGUAGE_MASTERY`, `SPECIFIC_SKILL`. Currently wired into the ranking/intervention layer: `DSA_MASTERY` / `PLACEMENT_PREPARATION` / `ROLE_PREPARATION` boost `goalRelevance` for skill-gap-driven candidates; `INTERVIEW_PREPARATION` boosts `goalRelevance` further and biases intervention selection toward `INTERVIEW_STYLE_CHALLENGE`.

## Time-awareness (Phase 31/32)

`students.prep_deadline` and `students.daily_target_minutes` are captured in the schema and seed data (the demo student has both set). **This is a partial implementation**: the fields exist and are queryable, but the recommendation engine does not yet actively re-weight candidate selection based on remaining days or throttle recommendation volume against the daily budget — see the truth table in `CODEFORGE_FINAL_REPORT.md`. This is flagged honestly rather than claimed as done, per the spec's own instruction never to claim unfinished functionality as implemented.

## Spaced review & mastery verification (Phase 25/26/27)

`student_skill_state.next_review_at` is set whenever a skill state is recomputed into `COMPETENT` or above, with an interval by state (`config.spacedReview.reviewIntervalDaysByState`: 10/14/21/30 days). `MasteryStateService.getDueReviews()` is a real, queryable function; the recommendation orchestrator checks it **first**, ahead of ordinary gap-driven picks. When a skill nears `MASTERED` but hasn't been independently verified yet, the engine surfaces a `MASTERY_VERIFICATION` intervention instead of just declaring mastery from the score alone (Phase 25's exact "unseen verification challenge" idea) — `markVerified()` exists for the pipeline to call once that challenge is passed independently.

**Partial**: there is no background scheduler/cron actually firing review reminders in this reference build (there's no job infrastructure running at all — see `CODEFORGE_FINAL_REPORT.md`, Phase 54); the due-review check runs synchronously whenever a recommendation is requested, which is functionally correct for a pull-based dashboard but not push-based reminders.

## Interleaving & exploration (Phase 20/24)

The ranking engine's `diversity` signal discounts a candidate whose primary skill was targeted in the last 3 recommendations, nudging toward interleaving related skills rather than drilling one skill repeatedly. Exploration (probing an unattempted, content-bearing, role-relevant skill) fires 15% of the time by default even when real gaps exist — see `CODEFORGE_RECOMMENDATION_ENGINE.md`.
